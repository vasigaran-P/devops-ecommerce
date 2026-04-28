pipeline {
    agent any

    environment {
        DOCKERHUB_USER  = "vasigaran"
        IMAGE_TAG       = "${env.GIT_COMMIT?.take(7) ?: 'latest'}"
        DOCKERHUB_CREDS = credentials('dockerhub-credentials')
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
                        sh """
                            ${scannerHome}/bin/sonar-scanner \
                              -Dsonar.projectKey=node-microservices \
                              -Dsonar.sources=. \
                              -Dsonar.exclusions=**/node_modules/**,**/test/**
                        """
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
                sh "docker build -t ${DOCKERHUB_USER}/auth-service:${IMAGE_TAG} services/auth-service"
                sh "docker build -t ${DOCKERHUB_USER}/order-service:${IMAGE_TAG} services/order-service"
                sh "docker build -t ${DOCKERHUB_USER}/product-service:${IMAGE_TAG} services/product-service"
            }
        }

        stage('Trivy scan') {
            steps {
                sh """
                    docker run --rm \
                      -v /var/run/docker.sock:/var/run/docker.sock \
                      -v trivy-cache:/root/.cache/trivy \
                      aquasec/trivy image \
                      --exit-code 0 \
                      --severity HIGH,CRITICAL \
                      --timeout 10m \
                      ${DOCKERHUB_USER}/auth-service:${IMAGE_TAG}
                """
            }
        }

        // 🔥 PARALLEL STAGE
        stage('Security & Push') {
            parallel {

                stage('OWASP ZAP scan') {
                    steps {
                        sh 'mkdir -p zap-reports'
                        sh 'chmod -R 777 zap-reports || true'

                        sh """
                            docker run --rm \
                              -v \$(pwd)/zap-reports:/zap/wrk/:rw \
                              ghcr.io/zaproxy/zaproxy:stable \
                              zap-baseline.py \
                              -t http://host.docker.internal:80 \
                              -r zap-report.html \
                              -I \
                              -z "-config spider.maxDuration=2 -config ajaxSpider.maxDuration=2 -config spider.maxDepth=3"
                        """
                    }
                    post {
                        always {
                            publishHTML(target: [
                                allowMissing: true,
                                reportDir: 'zap-reports',
                                reportFiles: 'zap-report.html',
                                reportName: 'OWASP ZAP Report'
                            ])
                        }
                    }
                }

                stage('Push to DockerHub') {
                    steps {
                        sh """
                            echo \${DOCKERHUB_CREDS_PSW} | \
                              docker login -u \${DOCKERHUB_CREDS_USR} --password-stdin
                            docker push ${DOCKERHUB_USER}/auth-service:${IMAGE_TAG}
                            docker push ${DOCKERHUB_USER}/order-service:${IMAGE_TAG}
                            docker push ${DOCKERHUB_USER}/product-service:${IMAGE_TAG}
                        """
                    }
                }
            }
        }
    }

    post {
        success {
            echo "✅ Pipeline passed. Tag: ${IMAGE_TAG}"
        }
        failure {
            echo "❌ Pipeline failed. Check logs."
        }
        always {
            sh 'docker logout || true'
        }
    }
}
