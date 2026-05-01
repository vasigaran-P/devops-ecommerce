# DevOps E-Commerce Project — Complete Setup Guide
## Phase 1 to Phase 8

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Phase 1 — App Development](#phase-1--app-development)
3. [Phase 2 — Containerization](#phase-2--containerization)
4. [Phase 3 — Code Quality](#phase-3--code-quality)
5. [Phase 4 — Docker Compose + Hardening](#phase-4--docker-compose--hardening)
6. [Phase 5 — Jenkins CI/CD + DevSecOps](#phase-5--jenkins-cicd--devsecops)
7. [Phase 6 — AWS + Terraform](#phase-6--aws--terraform)
8. [Phase 7 — Kubernetes + ArgoCD](#phase-7--kubernetes--argocd)
9. [Phase 8 — Prometheus + Grafana + ELK](#phase-8--prometheus--grafana--elk)
10. [AWS Resource Reference](#aws-resource-reference)
11. [API Reference](#api-reference)
12. [Verification Commands](#verification-commands)

---

## Project Overview

A microservices-based e-commerce application with a full DevSecOps CI/CD pipeline deployed on AWS EKS.

### Architecture

```
Developer → GitHub → Jenkins EC2 → ECR → EKS
                         ↓
                    SonarQube
                    Trivy
                    OWASP ZAP
```

### Services

| Service | Port | Description |
|---|---|---|
| auth-service | 3001 | User authentication + JWT tokens |
| product-service | 3002 | Product catalog |
| order-service | 3003 | Order management |
| MongoDB | 27017 | Shared database |
| Nginx | 80 | API Gateway (local only) |

### Live URL
```
http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com
```

### Tech Stack

| Category | Technology |
|---|---|
| Language | Node.js 18 |
| Framework | Express.js |
| Database | MongoDB 6 |
| Container | Docker |
| Orchestration | Kubernetes (EKS 1.32) |
| CI/CD | Jenkins |
| Code Quality | SonarQube |
| Security Scan | Trivy + OWASP ZAP |
| Image Registry | AWS ECR |
| Infrastructure | Terraform |
| GitOps | ArgoCD |
| Monitoring | Prometheus + Grafana |
| Logging | ELK Stack |

---

## Phase 1 — App Development

### Goal
Build 3 Node.js microservices with MongoDB.

### auth-service (services/auth-service/index.js)

```javascript
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(express.json());

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: { type: String, default: "user" }
});
const User = mongoose.model("User", userSchema);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/auth", (req, res) => res.send("Auth Service Running"));

app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword });
  await user.save();
  res.json({ message: "User registered" });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: "Invalid password" });
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  res.json({ token });
});

app.get("/auth/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected route", user: req.user });
});

app.listen(3001, () => console.log("Auth Service running on port 3001"));
```

### product-service (services/product-service/index.js)

```javascript
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/products", authMiddleware, (req, res) => {
  res.send("Product Service Running (Protected)");
});
app.get("/products/user", authMiddleware, (req, res) => {
  res.json(req.user);
});

app.listen(3002, () => console.log("Product Service running on port 3002"));
```

### order-service (services/order-service/index.js)

```javascript
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/orders", authMiddleware, (req, res) => {
  res.send("Order Service Running (Protected)");
});
app.get("/orders/user", authMiddleware, (req, res) => {
  res.json(req.user);
});

app.listen(3003, () => console.log("Order Service running on port 3003"));
```

### package.json (each service)

```json
{
  "name": "auth-service",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "echo \"No tests yet\" && exit 0"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "mongoose": "^7.0.0",
    "dotenv": "^16.0.3"
  }
}
```

### .env files (never commit these)

```bash
# services/auth-service/.env
MONGO_URI=mongodb://mongo:27017/authdb
JWT_SECRET=your-super-secret-key
PORT=3001

# services/product-service/.env
MONGO_URI=mongodb://mongo:27017/productdb
JWT_SECRET=your-super-secret-key
PORT=3002

# services/order-service/.env
MONGO_URI=mongodb://mongo:27017/orderdb
JWT_SECRET=your-super-secret-key
PORT=3003
```

---

## Phase 2 — Containerization

### Goal
Dockerfile for each service. Run everything with docker compose.

### Dockerfile (same pattern for all 3 services)

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

> Change EXPOSE port per service: 3001 (auth), 3002 (product), 3003 (order)

### Nginx Gateway (gateway/nginx.conf)

```nginx
upstream auth {
    server auth-service:3001;
}
upstream product {
    server product-service:3002;
}
upstream order {
    server order-service:3003;
}

server {
    listen 80;

    location /auth/ {
        proxy_pass http://auth/;
    }
    location /products/ {
        proxy_pass http://product/;
    }
    location /orders/ {
        proxy_pass http://order/;
    }
}
```

### Run locally

```bash
docker build -t auth-service services/auth-service
docker build -t product-service services/product-service
docker build -t order-service services/order-service
docker compose up -d
```

---

## Phase 3 — Code Quality

### Goal
Integrate SonarQube for static code analysis.

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

### Run SonarQube locally

```bash
docker run -d \
  --name sonarqube \
  --restart unless-stopped \
  -p 9000:9000 \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  -v sonar_data:/opt/sonarqube/data \
  -v sonar_logs:/opt/sonarqube/logs \
  sonarqube:community
```

Access at `http://localhost:9000` — default login: `admin / admin`

### Custom Quality Gate (no coverage requirement)

```bash
# Create gate via API
curl -u admin:yourpassword -X POST \
  "http://localhost:9000/api/qualitygates/create?name=devops-gate"

# Assign to project
curl -u admin:yourpassword -X POST \
  "http://localhost:9000/api/qualitygates/select?projectKey=node-microservices&gateName=devops-gate"
```

---

## Phase 4 — Docker Compose + Hardening

### Goal
`docker compose up` starts everything. Production-grade images.

### .dockerignore (all 3 services)

```bash
# Create for all services
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

### docker-compose.jenkins.yml (local Jenkins + SonarQube)

```yaml
services:
  jenkins:
    image: jenkins/jenkins:lts
    container_name: jenkins
    user: root
    ports:
      - "8080:8080"
    volumes:
      - jenkins_home:/var/jenkins_home
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - devops-net

  sonarqube:
    image: sonarqube:community
    container_name: sonarqube
    ports:
      - "9000:9000"
    environment:
      - SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true
    volumes:
      - sonar_data:/opt/sonarqube/data
      - sonar_logs:/opt/sonarqube/logs
    networks:
      - devops-net

networks:
  devops-net:
    external: true

volumes:
  jenkins_home:
  sonar_data:
  sonar_logs:
```

### Run

```bash
# Create network first
docker network create devops-net

# Start app
docker compose up -d

# Start Jenkins + SonarQube (local only)
docker compose -f docker-compose.jenkins.yml up -d

# Get Jenkins unlock password (first time)
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

---

## Phase 5 — Jenkins CI/CD + DevSecOps

### Goal
Every git push triggers full automated pipeline.

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

### Jenkins Setup Checklist

```
1. Open http://15.206.50.98:8080
2. Unlock with: sudo cat /var/lib/jenkins/secrets/initialAdminPassword
3. Install suggested plugins
4. Install extra plugins:
   - Docker Pipeline
   - SonarQube Scanner
   - HTML Publisher
5. Add SonarQube token credential:
   - Kind: Secret text
   - ID: sonarqube-token
6. Configure SonarQube server:
   - Name: SonarQube
   - URL: http://15.206.50.98:9000
7. Configure SonarScanner tool:
   - Name: SonarScanner
   - Install automatically
8. Create Pipeline job:
   - SCM: Git
   - URL: https://github.com/vasigaran-P/devops-ecommerce
   - Branch: */main
   - Script Path: Jenkinsfile
   - Trigger: GitHub hook trigger for GITScm polling
9. Add GitHub webhook:
   - URL: http://15.206.50.98:8080/github-webhook/
   - Content type: application/json
   - Event: push
```

---

## Phase 6 — AWS + Terraform

### Goal
`terraform apply` creates entire AWS infrastructure.

### Prerequisites

```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && ./aws/install

# Configure AWS CLI
aws configure
# Region: ap-south-1
# Output: json

# Verify
aws sts get-caller-identity

# Install Terraform
# Download from https://developer.hashicorp.com/terraform/downloads
terraform --version

# Generate SSH key for Jenkins EC2
ssh-keygen -t rsa -b 4096 -f ~/.ssh/jenkins_key -N ""
```

### WSL2 Memory Fix (Windows only)

```ini
# Create ~/.wslconfig on Windows
[wsl2]
memory=4GB
processors=2
swap=2GB
```

```powershell
# Restart WSL2
wsl --shutdown
```

### Terraform Project Structure

```
terraform/
├── main.tf
├── variables.tf
├── outputs.tf
└── terraform.tfvars
```

### terraform/variables.tf

```hcl
variable "aws_region" {
  default = "ap-south-1"
}

variable "cluster_name" {
  default = "devops-ecommerce"
}

variable "vpc_cidr" {
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  default = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  default = ["10.0.3.0/24", "10.0.4.0/24"]
}

variable "node_instance_type" {
  default = "t3.medium"
}

variable "node_desired_size" {
  default = 2
}

variable "node_min_size" {
  default = 1
}

variable "node_max_size" {
  default = 3
}
```

### terraform/terraform.tfvars

```hcl
aws_region         = "ap-south-1"
cluster_name       = "devops-ecommerce"
node_instance_type = "t3.medium"
node_desired_size  = 2
node_min_size      = 1
node_max_size      = 3
```

### terraform/main.tf

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.2"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  public_subnets  = var.public_subnet_cidrs
  private_subnets = var.private_subnet_cidrs

  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true
  enable_dns_support   = true

  public_subnet_tags = {
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    "kubernetes.io/role/elb"                    = "1"
  }

  private_subnet_tags = {
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
    "kubernetes.io/role/internal-elb"           = "1"
  }

  tags = {
    Project     = var.cluster_name
    Environment = "dev"
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.8.4"

  cluster_name    = var.cluster_name
  cluster_version = "1.32"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = true

  eks_managed_node_groups = {
    default = {
      instance_types = [var.node_instance_type]
      desired_size   = var.node_desired_size
      min_size       = var.node_min_size
      max_size       = var.node_max_size
      labels = { Environment = "dev" }
    }
  }

  tags = {
    Project     = var.cluster_name
    Environment = "dev"
  }
}

resource "aws_security_group" "jenkins" {
  name        = "jenkins-sg"
  description = "Jenkins security group"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Jenkins UI"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SonarQube"
    from_port   = 9000
    to_port     = 9000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "jenkins-sg"
    Project = var.cluster_name
  }
}

resource "aws_key_pair" "jenkins" {
  key_name   = "jenkins-key"
  public_key = file("~/.ssh/jenkins_key.pub")
}

resource "aws_iam_role" "jenkins" {
  name = "jenkins-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "jenkins_ecr" {
  role       = aws_iam_role.jenkins.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess"
}

resource "aws_iam_role_policy_attachment" "jenkins_eks" {
  role       = aws_iam_role.jenkins.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_iam_instance_profile" "jenkins" {
  name = "jenkins-instance-profile"
  role = aws_iam_role.jenkins.name
}

resource "aws_instance" "jenkins" {
  ami                         = "ami-0f58b397bc5c1f2e8"
  instance_type               = "t3.large"
  subnet_id                   = module.vpc.public_subnets[0]
  vpc_security_group_ids      = [aws_security_group.jenkins.id]
  key_name                    = aws_key_pair.jenkins.key_name
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.jenkins.name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg unzip wget

    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io
    systemctl enable docker && systemctl start docker

    apt-get install -y openjdk-21-jdk

    wget -O /usr/share/keyrings/jenkins-keyring.asc \
      https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
    echo "deb [trusted=yes] https://pkg.jenkins.io/debian-stable binary/" | \
      tee /etc/apt/sources.list.d/jenkins.list > /dev/null
    apt-get update -y && apt-get install -y jenkins

    usermod -aG docker jenkins
    usermod -aG docker ubuntu
    systemctl enable jenkins
    systemctl reset-failed jenkins || true
    systemctl start jenkins

    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs

    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip && ./aws/install

    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

    docker run -d --name sonarqube --restart unless-stopped \
      -p 9000:9000 \
      -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
      -v sonar_data:/opt/sonarqube/data \
      -v sonar_logs:/opt/sonarqube/logs \
      sonarqube:community
  EOF

  tags = {
    Name    = "jenkins-server"
    Project = var.cluster_name
  }
}

resource "aws_eip" "jenkins" {
  instance = aws_instance.jenkins.id
  domain   = "vpc"

  tags = {
    Name    = "jenkins-eip"
    Project = var.cluster_name
  }
}
```

### terraform/outputs.tf

```hcl
output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  value     = module.eks.cluster_certificate_authority_data
  sensitive = true
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnets" {
  value = module.vpc.private_subnets
}

output "jenkins_public_ip" {
  value = aws_instance.jenkins.public_ip
}

output "jenkins_elastic_ip" {
  value = aws_eip.jenkins.public_ip
}
```

### .gitignore

```
node_modules/
.env
*.log
terraform/.terraform/
terraform/.terraform.lock.hcl
```

### Terraform Commands

```bash
cd terraform

# Initialize (download providers)
terraform init

# Preview changes
terraform plan

# Apply (create infrastructure)
terraform apply
# Type 'yes' when prompted

# Get outputs
terraform output jenkins_elastic_ip
terraform output cluster_endpoint

# Destroy all (when done)
terraform destroy
```

### EKS Version Upgrade (if needed — one minor version at a time)

```bash
# Edit cluster_version in main.tf step by step
# 1.29 → 1.30 → 1.31 → 1.32
terraform apply   # after each change
```

### Post-Terraform Setup

```bash
# Connect kubectl to EKS
aws eks update-kubeconfig --region ap-south-1 --name devops-ecommerce

# Grant IAM user access to EKS
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

# Verify nodes
kubectl get nodes

# Create ECR repos
aws ecr create-repository --repository-name auth-service --region ap-south-1
aws ecr create-repository --repository-name product-service --region ap-south-1
aws ecr create-repository --repository-name order-service --region ap-south-1

# SSH into Jenkins EC2
ssh -i ~/.ssh/jenkins_key ubuntu@15.206.50.98
```

---

## Phase 7 — Kubernetes + ArgoCD

### Goal
App runs on EKS. ArgoCD auto-deploys on every git push.

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

### Create Folder Structure

```bash
mkdir -p k8s/{auth,product,order,mongo,ingress}
```

### k8s/mongo/secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mongo-secret
  namespace: devops-ecommerce
type: Opaque
stringData:
  MONGO_ROOT_USERNAME: admin
  MONGO_ROOT_PASSWORD: admin1234
  MONGO_URI: mongodb://admin:admin1234@mongo-service:27017
```

### k8s/mongo/statefulset.yaml

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongo
  namespace: devops-ecommerce
spec:
  serviceName: mongo-service
  replicas: 1
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
        - name: mongo
          image: mongo:6
          ports:
            - containerPort: 27017
          env:
            - name: MONGO_INITDB_ROOT_USERNAME
              valueFrom:
                secretKeyRef:
                  name: mongo-secret
                  key: MONGO_ROOT_USERNAME
            - name: MONGO_INITDB_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mongo-secret
                  key: MONGO_ROOT_PASSWORD
          volumeMounts:
            - name: mongo-data
              mountPath: /data/db
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
  volumeClaimTemplates:
    - metadata:
        name: mongo-data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp2
        resources:
          requests:
            storage: 5Gi
```

### k8s/mongo/service.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mongo-service
  namespace: devops-ecommerce
spec:
  clusterIP: None
  selector:
    app: mongo
  ports:
    - port: 27017
      targetPort: 27017
```

### k8s/auth/secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: auth-secret
  namespace: devops-ecommerce
type: Opaque
stringData:
  MONGO_URI: mongodb://admin:admin1234@mongo-service:27017
  JWT_SECRET: your-jwt-secret-key-here
  PORT: "3001"
```

### k8s/auth/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: devops-ecommerce
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
        - name: auth-service
          image: 474418737424.dkr.ecr.ap-south-1.amazonaws.com/auth-service:latest
          ports:
            - containerPort: 3001
          envFrom:
            - secretRef:
                name: auth-secret
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
```

### k8s/auth/service.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: devops-ecommerce
spec:
  selector:
    app: auth-service
  ports:
    - port: 3001
      targetPort: 3001
  type: ClusterIP
```

> Create the same deployment.yaml and service.yaml for product-service (port 3002) and order-service (port 3003) following the same pattern.

### k8s/product/secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: product-secret
  namespace: devops-ecommerce
type: Opaque
stringData:
  MONGO_URI: mongodb://admin:admin1234@mongo-service:27017
  JWT_SECRET: your-jwt-secret-key-here
  PORT: "3002"
```

### k8s/order/secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: order-secret
  namespace: devops-ecommerce
type: Opaque
stringData:
  MONGO_URI: mongodb://admin:admin1234@mongo-service:27017
  JWT_SECRET: your-jwt-secret-key-here
  PORT: "3003"
```

### k8s/ingress/ingress.yaml

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ecommerce-ingress
  namespace: devops-ecommerce
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/region: ap-south-1
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "30"
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "5"
    alb.ingress.kubernetes.io/healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/unhealthy-threshold-count: "3"
spec:
  rules:
    - http:
        paths:
          - path: /auth
            pathType: Prefix
            backend:
              service:
                name: auth-service
                port:
                  number: 3001
          - path: /products
            pathType: Prefix
            backend:
              service:
                name: product-service
                port:
                  number: 3002
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 3003
```

### Install Prerequisites

```bash
# Install eksctl
curl --silent --location "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin
eksctl version

# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### Install AWS Load Balancer Controller

```bash
# Create OIDC provider
eksctl utils associate-iam-oidc-provider \
  --region ap-south-1 \
  --cluster devops-ecommerce \
  --approve

# Download IAM policy
curl -o /tmp/alb-iam-policy.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.1/docs/install/iam_policy.json

# Create IAM policy
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file:///tmp/alb-iam-policy.json \
  --region ap-south-1

# Create service account
eksctl create iamserviceaccount \
  --cluster devops-ecommerce \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --attach-policy-arn arn:aws:iam::474418737424:policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --region ap-south-1 \
  --approve

# Install via Helm
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=devops-ecommerce \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=ap-south-1 \
  --set vpcId=vpc-0301d0b2b15383b79

# Fix ALB controller permissions (additional policy needed)
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicyV2 \
  --policy-document file:///tmp/alb-iam-policy.json \
  --region ap-south-1

aws iam attach-role-policy \
  --role-name eksctl-devops-ecommerce-addon-iamserviceaccou-Role1-ggDvWA9eMSdh \
  --policy-arn arn:aws:iam::474418737424:policy/AWSLoadBalancerControllerIAMPolicyV2

aws iam attach-role-policy \
  --role-name eksctl-devops-ecommerce-addon-iamserviceaccou-Role1-ggDvWA9eMSdh \
  --policy-arn arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess

# Restart controller pods
kubectl delete pods -n kube-system \
  $(kubectl get pods -n kube-system \
  -l app.kubernetes.io/name=aws-load-balancer-controller \
  -o jsonpath='{.items[*].metadata.name}')
```

### Install EBS CSI Driver

```bash
aws eks create-addon \
  --cluster-name devops-ecommerce \
  --addon-name aws-ebs-csi-driver \
  --region ap-south-1 \
  --resolve-conflicts OVERWRITE

# Verify
aws eks describe-addon \
  --cluster-name devops-ecommerce \
  --addon-name aws-ebs-csi-driver \
  --region ap-south-1 \
  --query 'addon.status'
# Should show "ACTIVE"
```

### Add ECR Pull Permissions to EKS Nodes

```bash
# Get node group name
aws eks list-nodegroups \
  --cluster-name devops-ecommerce \
  --region ap-south-1

# Get node role
aws eks describe-nodegroup \
  --cluster-name devops-ecommerce \
  --nodegroup-name <nodegroup-name> \
  --region ap-south-1 \
  --query 'nodegroup.nodeRole' \
  --output text

# Attach ECR policy
aws iam attach-role-policy \
  --role-name <node-role-name> \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

### Deploy Everything to EKS

```bash
# Create namespace
kubectl create namespace devops-ecommerce

# Deploy in order
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

# Check pods
kubectl get pods -n devops-ecommerce

# Get ALB URL (takes 2-3 minutes)
kubectl get ingress -n devops-ecommerce
```

### Update Image Tag After Pipeline Runs

```bash
# Get latest tag from ECR
aws ecr list-images --repository-name auth-service \
  --region ap-south-1 \
  --query 'imageIds[*].imageTag' \
  --output table

# Update deployment files with new tag
NEW_TAG=<latest-tag-from-ecr>
sed -i "s|auth-service:.*|auth-service:${NEW_TAG}|g" k8s/auth/deployment.yaml
sed -i "s|product-service:.*|product-service:${NEW_TAG}|g" k8s/product/deployment.yaml
sed -i "s|order-service:.*|order-service:${NEW_TAG}|g" k8s/order/deployment.yaml

# Apply
kubectl apply -f k8s/auth/deployment.yaml
kubectl apply -f k8s/product/deployment.yaml
kubectl apply -f k8s/order/deployment.yaml
```

### Install ArgoCD

```bash
# Install
kubectl create namespace argocd
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods
kubectl get pods -n argocd

# Expose UI
kubectl patch svc argocd-server -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'

# Get ArgoCD URL
kubectl get svc argocd-server -n argocd

# Get initial admin password
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath='{.data.password}' | base64 -d
```

### Configure ArgoCD Application

```yaml
# argocd-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: devops-ecommerce
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/vasigaran-P/devops-ecommerce
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: devops-ecommerce
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

```bash
kubectl apply -f argocd-app.yaml
```

---

## Phase 8 — Prometheus + Grafana + ELK

### Goal
Live dashboards for pod health, HTTP rates, and centralized logs.

### Install Prometheus + Grafana via Helm

```bash
# Add Helm repos
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Create monitoring namespace
kubectl create namespace monitoring

# Install Prometheus stack (includes Grafana)
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set grafana.service.type=LoadBalancer \
  --set prometheus.service.type=LoadBalancer

# Check pods
kubectl get pods -n monitoring

# Get Grafana URL
kubectl get svc -n monitoring | grep grafana

# Get Grafana admin password
kubectl get secret prometheus-grafana -n monitoring \
  -o jsonpath='{.data.admin-password}' | base64 -d
```

### Key Grafana Dashboards to Import

| Dashboard | ID | What it shows |
|---|---|---|
| Kubernetes Cluster | 7249 | Node CPU, memory, disk |
| Kubernetes Pods | 6417 | Pod health, restarts |
| Node Exporter | 1860 | Host metrics |

### Install ELK Stack

```bash
# Add Elastic Helm repo
helm repo add elastic https://helm.elastic.co
helm repo update

# Create logging namespace
kubectl create namespace logging

# Install Elasticsearch
helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --set replicas=1 \
  --set resources.requests.memory=1Gi \
  --set resources.limits.memory=2Gi

# Install Kibana
helm install kibana elastic/kibana \
  --namespace logging \
  --set service.type=LoadBalancer

# Install Filebeat (collects logs from all pods)
helm install filebeat elastic/filebeat \
  --namespace logging

# Check pods
kubectl get pods -n logging

# Get Kibana URL
kubectl get svc -n logging | grep kibana
```

### Alert Rules (Prometheus)

```yaml
# prometheus-alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: ecommerce-alerts
  namespace: monitoring
spec:
  groups:
    - name: ecommerce
      rules:
        - alert: PodDown
          expr: up{job="kubernetes-pods"} == 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: "Pod {{ $labels.pod }} is down"

        - alert: HighMemoryUsage
          expr: container_memory_usage_bytes > 200000000
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High memory usage in {{ $labels.pod }}"
```

```bash
kubectl apply -f prometheus-alerts.yaml
```

---

## AWS Resource Reference

| Resource | Value |
|---|---|
| AWS Account ID | 474418737424 |
| Region | ap-south-1 |
| EKS Cluster Name | devops-ecommerce |
| EKS Version | 1.32 |
| Jenkins Elastic IP | 15.206.50.98 |
| Jenkins URL | http://15.206.50.98:8080 |
| SonarQube URL | http://15.206.50.98:9000 |
| VPC ID | vpc-0301d0b2b15383b79 |
| Private Subnet 1 | subnet-058d6f4dbba4e3710 |
| Private Subnet 2 | subnet-0f33216ded0e9c782 |
| App ALB URL | http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com |
| ECR Registry | 474418737424.dkr.ecr.ap-south-1.amazonaws.com |
| GitHub Repo | https://github.com/vasigaran-P/devops-ecommerce |
| Node Group Role | default-eks-node-group-20260429054508500300000002 |
| ALB Controller Role | eksctl-devops-ecommerce-addon-iamserviceaccou-Role1-ggDvWA9eMSdh |

---

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /auth | No | Auth service health |
| POST | /auth/register | No | Register new user |
| POST | /auth/login | No | Login + get JWT token |
| GET | /auth/protected | Yes | Protected auth route |
| GET | /health | No | Health check (all services) |
| GET | /products | Yes | Product service |
| GET | /products/user | Yes | Get user from token |
| GET | /orders | Yes | Order service |
| GET | /orders/user | Yes | Get user from token |

### Test Flow

```bash
# 1. Register
curl -X POST \
  http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# 2. Login and store token
TOKEN=$(curl -s -X POST \
  http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token: $TOKEN"

# 3. Access protected services
curl -H "Authorization: Bearer $TOKEN" \
  http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com/products

curl -H "Authorization: Bearer $TOKEN" \
  http://k8s-devopsec-ecommerc-dcd2216c10-1453832365.ap-south-1.elb.amazonaws.com/orders
```

---

## Verification Commands

```bash
# ── LOCAL ──────────────────────────────────────
# Check Docker
docker ps
docker compose ps

# ── AWS ────────────────────────────────────────
# Check AWS identity
aws sts get-caller-identity

# Check Terraform outputs
cd terraform && terraform output

# ── EKS ────────────────────────────────────────
# Check nodes
kubectl get nodes

# Check all pods
kubectl get pods -n devops-ecommerce
kubectl get pods -n argocd
kubectl get pods -n monitoring
kubectl get pods -n logging
kubectl get pods -n kube-system | grep aws-load-balancer

# Check services
kubectl get svc -n devops-ecommerce

# Check ingress + ALB URL
kubectl get ingress -n devops-ecommerce

# Check PVC (MongoDB storage)
kubectl get pvc -n devops-ecommerce

# ── ECR ────────────────────────────────────────
# List images
aws ecr list-images --repository-name auth-service --region ap-south-1
aws ecr list-images --repository-name product-service --region ap-south-1
aws ecr list-images --repository-name order-service --region ap-south-1

# ── EBS CSI ────────────────────────────────────
aws eks describe-addon \
  --cluster-name devops-ecommerce \
  --addon-name aws-ebs-csi-driver \
  --region ap-south-1 \
  --query 'addon.status'

# ── JENKINS EC2 ────────────────────────────────
ssh -i ~/.ssh/jenkins_key ubuntu@15.206.50.98
systemctl status jenkins
docker ps | grep sonarqube
df -h
free -h
```

---

*DevOps E-Commerce Project | Complete Setup Guide | Vasigaran P | April 2026*
