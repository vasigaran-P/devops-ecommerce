pipeline {
  agent any

  environment {
    AWS_REGION      = "ap-south-1"
    ECR_REGISTRY    = "474418737424.dkr.ecr.ap-south-1.amazonaws.com"
    IMAGE_TAG       = "${env.GIT_COMMIT?.take(7) ?: 'latest'}"
    CLUSTER_NAME    = "devops-ecommerce"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        sh 'echo "Building commit: ${IMAGE_TAG}"'
      }
    }

    stage('Install dependencies') {
      steps {
        dir('services/auth-service')    { sh 'npm ci' }
        dir('services/order-service')   { sh 'npm ci' }
        dir('services/product-service') { sh 'npm ci' }
      }
    }

    stage('Run tests') {
      steps {
        dir('services/auth-service')    { sh 'npm test --if-present' }
        dir('services/order-service')   { sh 'npm test --if-present' }
        dir('services/product-service') { sh 'npm test --if-present' }
      }
    }

    stage('SonarQube analysis') {
      steps {
        withSonarQubeEnv('SonarQube') {
          script {
            def scannerHome = tool 'SonarScanner'
            sh "${scannerHome}/bin/sonar-scanner"
          }
        }
      }
    }

    stage('Quality gate') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Docker build') {
      steps {
        sh "docker build -t ${ECR_REGISTRY}/auth-service:${IMAGE_TAG}    services/auth-service"
        sh "docker build -t ${ECR_REGISTRY}/order-service:${IMAGE_TAG}   services/order-service"
        sh "docker build -t ${ECR_REGISTRY}/product-service:${IMAGE_TAG} services/product-service"
      }
    }

    stage('Security & Push') {
      parallel {

        stage('Trivy scan') {
          steps {
            script {
              ['auth-service', 'order-service', 'product-service'].each { svc ->
                sh """
                  docker run --rm \
                    -v /var/run/docker.sock:/var/run/docker.sock \
                    -v trivy-cache:/root/.cache/trivy \
                    aquasec/trivy image \
                    --exit-code 1 \
                    --severity CRITICAL \
                    --timeout 10m \
                    ${ECR_REGISTRY}/${svc}:${IMAGE_TAG}
                """
              }
            }
          }
        }

        stage('OWASP ZAP scan') {
          steps {
            sh 'mkdir -p zap-reports'
            sh """
              docker run --rm \
                -u 0 \
                --add-host host.docker.internal:host-gateway \
                -v \$(pwd)/zap-reports:/zap/wrk/:rw \
                ghcr.io/zaproxy/zaproxy:stable \
                zap-baseline.py \
                -t http://host.docker.internal:80 \
                -r zap-report.html \
                -I \
                -z "-config spider.maxDuration=2 -config ajaxSpider.maxDuration=2 -config spider.maxDepth=3 || true"
            """
          }
          post {
            always {
              publishHTML(target: [
                allowMissing: true,
                reportDir:    'zap-reports',
                reportFiles:  'zap-report.html',
                reportName:   'OWASP ZAP Report'
              ])
            }
          }
        }

        stage('Push to ECR') {
          steps {
            sh """
              aws ecr get-login-password --region ${AWS_REGION} | \
              docker login --username AWS --password-stdin ${ECR_REGISTRY}

              docker push ${ECR_REGISTRY}/auth-service:${IMAGE_TAG}
              docker push ${ECR_REGISTRY}/order-service:${IMAGE_TAG}
              docker push ${ECR_REGISTRY}/product-service:${IMAGE_TAG}
            """
          }
        }

      }
    }

  }

  post {
    success { echo "✅ Pipeline passed. Tag: ${IMAGE_TAG}" }
    failure { echo "❌ Pipeline failed. Check logs." }
    always  { sh 'docker logout || true' }
  }
}
