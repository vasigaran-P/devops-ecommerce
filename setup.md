# DevOps E-Commerce Project — Complete Setup Guide
## Phases 4, 5, 6 & 7 (In Progress)

---

## Project Overview

A microservices-based e-commerce application deployed on AWS EKS with a full DevSecOps CI/CD pipeline.

**Services:**
- `auth-service` — User authentication + JWT (port 3001)
- `product-service` — Product catalog (port 3002)
- `order-service` — Order management (port 3003)
- `MongoDB` — Shared database
- `Nginx` — API Gateway (local only)

**Live URL:**
```
http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| AWS CLI | 2.x | Manage AWS resources |
| Terraform | 1.14.x | Infrastructure as Code |
| kubectl | 1.32.x | Manage Kubernetes |
| Docker | 29.x | Build images (local) |
| Node.js | 18.x | Run services |
| Git | any | Source control |
| eksctl | latest | EKS cluster management |
| Helm | 3.x | Install K8s packages |

---

## Phase 4 — Docker Compose + Hardening

### Dockerfile (Multi-stage, Non-root)
Each service uses the same pattern:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine
RUN apk update && apk upgrade --no-cache
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
USER appuser
EXPOSE 3001
CMD ["node", "index.js"]
```

### .dockerignore (All Services)
```
node_modules
npm-debug.log
.env
.git
.gitignore
coverage
*.test.js
```

Create for all services:
```bash
cat <<EOF > services/auth-service/.dockerignore
node_modules
npm-debug.log
.env
.git
.gitignore
coverage
*.test.js
EOF

cp services/auth-service/.dockerignore services/product-service/.dockerignore
cp services/auth-service/.dockerignore services/order-service/.dockerignore
```

### docker-compose.yml
```yaml
services:
  mongo:
    image: mongo:6
    container_name: mongo
    networks:
      - devops-net
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  auth-service:
    build: ./services/auth-service
    container_name: auth-service
    networks:
      - devops-net
    env_file: ./services/auth-service/.env
    depends_on:
      mongo:
        condition: service_healthy
    restart: unless-stopped

  product-service:
    build: ./services/product-service
    container_name: product-service
    networks:
      - devops-net
    env_file: ./services/product-service/.env
    depends_on:
      mongo:
        condition: service_healthy
    restart: unless-stopped

  order-service:
    build: ./services/order-service
    container_name: order-service
    networks:
      - devops-net
    env_file: ./services/order-service/.env
    depends_on:
      mongo:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    build: ./gateway
    container_name: nginx-gateway
    networks:
      - devops-net
    ports:
      - "80:80"
    depends_on:
      - auth-service
      - product-service
      - order-service
    restart: unless-stopped

networks:
  devops-net:
    driver: bridge

volumes:
  mongo-data:
```

### Run Locally
```bash
docker network create devops-net
docker compose up -d
docker compose ps
```

---

## Phase 5 — Jenkins CI/CD + DevSecOps (Local)

### sonar-project.properties
```properties
sonar.projectKey=node-microservices
sonar.projectName=Node Microservices
sonar.sources=.
sonar.exclusions=**/node_modules/**,**/test/**,**/coverage/**,**/*.yml,**/Dockerfile
sonar.sourceEncoding=UTF-8
sonar.qualitygate.wait=true
sonar.coverage.exclusions=**/*
```

### Jenkinsfile
```groovy
pipeline {
  agent any

  environment {
    AWS_REGION   = "ap-south-1"
    ECR_REGISTRY = "474418737424.dkr.ecr.ap-south-1.amazonaws.com"
    IMAGE_TAG    = "${env.GIT_COMMIT?.take(7) ?: 'latest'}"
    CLUSTER_NAME = "devops-ecommerce"
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
            script {
              def zapResult = sh(
                script: """
                  docker run --rm \
                    -u 0 \
                    --add-host host.docker.internal:host-gateway \
                    -v \$(pwd)/zap-reports:/zap/wrk/:rw \
                    ghcr.io/zaproxy/zaproxy:stable \
                    zap-baseline.py \
                    -t http://host.docker.internal:80 \
                    -r zap-report.html \
                    -I \
                    -z "-config spider.maxDuration=2 -config ajaxSpider.maxDuration=2 -config spider.maxDepth=3"
                """,
                returnStatus: true
              )
              echo "ZAP exit code: ${zapResult} (non-blocking until app on EKS)"
            }
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
```

---

## Phase 6 — AWS + Terraform

### AWS Resources Created

| Resource | Details |
|---|---|
| VPC | 10.0.0.0/16 |
| Public Subnets | 10.0.1.0/24, 10.0.2.0/24 (ap-south-1a, ap-south-1b) |
| Private Subnets | 10.0.3.0/24, 10.0.4.0/24 |
| NAT Gateway | Single, in public subnet |
| EKS Cluster | devops-ecommerce, version 1.32 |
| EKS Nodes | 2x t3.medium in private subnets |
| Jenkins EC2 | t3.large, public subnet |
| Elastic IP | 15.206.50.98 (permanent) |
| ECR Repos | auth-service, product-service, order-service |

### Setup Steps

```bash
# 1. Generate SSH key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/jenkins_key -N ""

# 2. Initialize Terraform
cd terraform
terraform init
terraform apply

# 3. Connect kubectl to EKS
aws eks update-kubeconfig --region ap-south-1 --name devops-ecommerce

# 4. Grant IAM user access to EKS
aws eks create-access-entry \
  --cluster-name devops-ecommerce \
  --principal-arn arn:aws:iam::474418737424:user/Vasi \
  --region ap-south-1

aws eks associate-access-policy \
  --cluster-name devops-ecommerce \
  --principal-arn arn:aws:iam::474418737424:user/Vasi \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
  --access-scope type=cluster \
  --region ap-south-1

# 5. Create ECR repos
aws ecr create-repository --repository-name auth-service --region ap-south-1
aws ecr create-repository --repository-name product-service --region ap-south-1
aws ecr create-repository --repository-name order-service --region ap-south-1

# 6. SSH into Jenkins EC2
ssh -i ~/.ssh/jenkins_key ubuntu@15.206.50.98

# 7. Install Jenkins manually (user_data may fail)
sudo apt-get install -y openjdk-21-jdk
sudo wget -O /usr/share/keyrings/jenkins-keyring.asc \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
echo "deb [trusted=yes] https://pkg.jenkins.io/debian-stable binary/" | \
  sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt-get update -y && sudo apt-get install -y jenkins
sudo usermod -aG docker jenkins
sudo usermod -aG docker ubuntu
sudo systemctl reset-failed jenkins
sudo systemctl start jenkins
sudo systemctl enable jenkins

# 8. Install Node.js on Jenkins EC2
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo systemctl restart jenkins

# 9. Start SonarQube on EC2
docker run -d \
  --name sonarqube \
  --restart unless-stopped \
  -p 9000:9000 \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  -v sonar_data:/opt/sonarqube/data \
  -v sonar_logs:/opt/sonarqube/logs \
  sonarqube:community
```

### Jenkins Configuration

| Step | Location | Value |
|---|---|---|
| Unlock Jenkins | http://15.206.50.98:8080 | `sudo cat /var/lib/jenkins/secrets/initialAdminPassword` |
| Install plugins | Manage Jenkins → Plugins | Docker Pipeline, SonarQube Scanner, HTML Publisher |
| Add SonarQube token | Manage Jenkins → Credentials | Kind: Secret text, ID: sonarqube-token |
| Add SonarQube server | Manage Jenkins → System | Name: SonarQube, URL: http://15.206.50.98:9000 |
| Add SonarScanner tool | Manage Jenkins → Tools | Name: SonarScanner, Install automatically |
| Jenkins URL | Manage Jenkins → System | http://15.206.50.98:8080 |

### SonarQube Configuration

```
URL: http://15.206.50.98:9000
Default login: admin / admin (changed on first login)

Webhook: Administration → Configuration → Webhooks → Create
  Name: jenkins
  URL: http://15.206.50.98:8080/sonarqube-webhook/

Quality Gate: Create custom gate 'devops-gate' with no conditions
Assign via API:
  curl -u admin:password -X POST \
    "http://15.206.50.98:9000/api/qualitygates/select?projectKey=node-microservices&gateName=devops-gate"
```

### GitHub Webhook
```
URL: http://15.206.50.98:8080/github-webhook/
Content type: application/json
Events: push
```

---

## Phase 7 — Kubernetes + ArgoCD (In Progress)

### Folder Structure
```
k8s/
├── auth/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── secret.yaml
├── product/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── secret.yaml
├── order/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── secret.yaml
├── mongo/
│   ├── statefulset.yaml
│   ├── service.yaml
│   └── secret.yaml
└── ingress/
    └── ingress.yaml
```

### Setup Steps

```bash
# 1. Create namespace
kubectl create namespace devops-ecommerce

# 2. Install eksctl
curl --silent --location "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# 3. Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# 4. Install AWS Load Balancer Controller
eksctl utils associate-iam-oidc-provider \
  --region ap-south-1 \
  --cluster devops-ecommerce \
  --approve

curl -o /tmp/alb-iam-policy.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.1/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file:///tmp/alb-iam-policy.json \
  --region ap-south-1

eksctl create iamserviceaccount \
  --cluster devops-ecommerce \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn arn:aws:iam::474418737424:policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --region ap-south-1 \
  --approve

helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=devops-ecommerce \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=ap-south-1 \
  --set vpcId=vpc-0301d0b2b15383b79

# 5. Fix ALB controller permissions
aws iam attach-role-policy \
  --role-name eksctl-devops-ecommerce-addon-iamserviceaccou-Role1-ggDvWA9eMSdh \
  --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess

# 6. Install EBS CSI Driver
aws eks create-addon \
  --cluster-name devops-ecommerce \
  --addon-name aws-ebs-csi-driver \
  --region ap-south-1 \
  --resolve-conflicts OVERWRITE

# 7. Add ECR pull permissions to EKS nodes
aws iam attach-role-policy \
  --role-name default-eks-node-group-20260429054508500300000002 \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

# 8. Apply all manifests
kubectl apply -f k8s/mongo/secret.yaml
kubectl apply -f k8s/mongo/statefulset.yaml
kubectl apply -f k8s/mongo/service.yaml
kubectl apply -f k8s/auth/secret.yaml
kubectl apply -f k8s/product/secret.yaml
kubectl apply -f k8s/order/secret.yaml
kubectl apply -f k8s/auth/deployment.yaml
kubectl apply -f k8s/auth/service.yaml
kubectl apply -f k8s/product/deployment.yaml
kubectl apply -f k8s/product/service.yaml
kubectl apply -f k8s/order/deployment.yaml
kubectl apply -f k8s/order/service.yaml
kubectl apply -f k8s/ingress/ingress.yaml

# 9. Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 10. Expose ArgoCD UI
kubectl patch svc argocd-server -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'
```

### API Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| GET | /auth | No | Health check |
| POST | /auth/register | No | Register user |
| POST | /auth/login | No | Login + get JWT |
| GET | /auth/protected | Yes | Protected route |
| GET | /products | Yes | Product service |
| GET | /products/user | Yes | User info |
| GET | /orders | Yes | Order service |
| GET | /orders/user | Yes | User info |
| GET | /health | No | Service health |

### Test the API

```bash
# Register
curl -X POST \
  http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Login and store token
TOKEN=$(curl -s -X POST \
  http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Access protected services
curl -H "Authorization: Bearer $TOKEN" \
  http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com/products

curl -H "Authorization: Bearer $TOKEN" \
  http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com/orders
```

---

## AWS Resource Reference

| Resource | Value |
|---|---|
| AWS Account | 474418737424 |
| Region | ap-south-1 |
| EKS Cluster | devops-ecommerce |
| EKS Version | 1.32 |
| Jenkins IP (Elastic) | 15.206.50.98 |
| Jenkins URL | http://15.206.50.98:8080 |
| SonarQube URL | http://15.206.50.98:9000 |
| VPC ID | vpc-0301d0b2b15383b79 |
| App URL | http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com |
| ECR Registry | 474418737424.dkr.ecr.ap-south-1.amazonaws.com |
| GitHub Repo | https://github.com/vasigaran-P/devops-ecommerce |

---

## Verification Commands

```bash
# Check EKS nodes
kubectl get nodes

# Check all pods
kubectl get pods -n devops-ecommerce

# Check services
kubectl get svc -n devops-ecommerce

# Check ingress + ALB URL
kubectl get ingress -n devops-ecommerce

# Check ArgoCD pods
kubectl get pods -n argocd

# Check ECR images
aws ecr list-images --repository-name auth-service --region ap-south-1

# Check EBS CSI driver
aws eks describe-addon \
  --cluster-name devops-ecommerce \
  --addon-name aws-ebs-csi-driver \
  --region ap-south-1 \
  --query 'addon.status'
```

---

## .gitignore
```
node_modules/
.env
*.log
terraform/.terraform/
terraform/.terraform.lock.hcl
```

---

*Documentation covers Phases 4–7 | Vasigaran P | April 2026*
