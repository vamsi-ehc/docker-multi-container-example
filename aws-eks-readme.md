# 🌩️ AWS EKS Deployment Guide

Complete guide to deploy your multi-container application on **AWS Elastic Kubernetes Service (EKS)** with and without Istio service mesh, including AWS Console navigation routes.

---

## 📋 Prerequisites

- **AWS Account** with active payment method
- **AWS CLI v2** installed ([Download](https://aws.amazon.com/cli/))
- **kubectl** installed
- **Docker** installed locally
- **Helm 3** (optional, for Istio installation)
- **IAM User** with permissions: AmazonEC2FullAccess, AmazonECS_FullAccess, AmazonEKSFullAccess, IAMFullAccess

Verify installations:
```bash
aws --version
kubectl version --client
docker --version
```

---

## 🔐 Step 1: AWS CLI Configuration

### Configure AWS Credentials

```bash
aws configure
```

When prompted, enter:
- **AWS Access Key ID**: Your IAM access key
- **AWS Secret Access Key**: Your IAM secret key
- **Default region**: `us-east-1` (or your preferred region)
- **Default output format**: `json`

Verify configuration:
```bash
aws sts get-caller-identity
```

### Create IAM User (if needed)

**Portal Navigation:** `AWS Console > IAM > Users > Create User`

```bash
# Via CLI
aws iam create-user --user-name eks-deployer
aws iam attach-user-policy \
  --user-name eks-deployer \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSFullAccess
```

---

## 📦 Step 2: Create ECR Repository (AWS Container Registry)

### Via AWS Console

**Portal Navigation:** `AWS Console > ECR > Repositories > Create Repository`

1. Click **Create Repository**
2. Enter repository names:
   - `multi-container-app/frontend`
   - `multi-container-app/todo-app`
   - `multi-container-app/calculator-api`
   - `multi-container-app/health-monitor`

### Via AWS CLI

```bash
# Create repositories
aws ecr create-repository \
  --repository-name multi-container-app/frontend \
  --region us-east-1

aws ecr create-repository \
  --repository-name multi-container-app/todo-app \
  --region us-east-1

aws ecr create-repository \
  --repository-name multi-container-app/calculator-api \
  --region us-east-1

aws ecr create-repository \
  --repository-name multi-container-app/health-monitor \
  --region us-east-1
```

Get ECR login token:
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
```

Replace `<ACCOUNT_ID>` with your AWS account ID:
```bash
aws sts get-caller-identity --query Account --output text
```

---

## 🏗️ Step 3: Build & Push Docker Images to ECR

Set AWS account ID and region variables:
```bash
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
$AWS_REGION = "us-east-1"
$ECR_URI = "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

Build and tag all images:

```bash
# Frontend
docker build -t frontend:latest ./frontend
docker tag frontend:latest $ECR_URI/multi-container-app/frontend:latest
docker push $ECR_URI/multi-container-app/frontend:latest

# Todo App
docker build -t todo-app:latest ./app
docker tag todo-app:latest $ECR_URI/multi-container-app/todo-app:latest
docker push $ECR_URI/multi-container-app/todo-app:latest

# Calculator API
docker build -t calculator-api:latest ./calculator-api
docker tag calculator-api:latest $ECR_URI/multi-container-app/calculator-api:latest
docker push $ECR_URI/multi-container-app/calculator-api:latest

# Health Monitor
docker build -t health-monitor:latest ./health-monitor
docker tag health-monitor:latest $ECR_URI/multi-container-app/health-monitor:latest
docker push $ECR_URI/multi-container-app/health-monitor:latest
```

Verify images:
```bash
aws ecr describe-repositories --region us-east-1
aws ecr list-images --repository-name multi-container-app/frontend --region us-east-1
```

---

## 🎯 Step 4: Create VPC & Networking (Optional but Recommended)

### Via AWS Console

**Portal Navigation:** `AWS Console > VPC > Virtual Private Cloud > Create VPC`

Or use CLI:
```bash
# Create VPC
$VPC_ID = aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --region us-east-1 \
  --query 'Vpc.VpcId' \
  --output text

# Create subnets (2 public, 2 private recommended)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --region us-east-1

aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b \
  --region us-east-1
```

---

## ⚙️ Step 5: Create EKS Cluster

### Via AWS Console

**Portal Navigation:** `AWS Console > EKS > Clusters > Create Cluster`

1. Click **Create Cluster**
2. **Cluster name**: `multi-container-eks`
3. **Kubernetes version**: Latest (1.28+)
4. **Role name**: Create new role (requires IAM permissions)
5. **VPC**: Select your VPC or default
6. Click **Create**
7. Wait for cluster status to be **Active** (5-10 minutes)

### Via AWS CLI

Create EKS service role:
```bash
# Create trust policy
$TRUST_POLICY = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "eks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
"@

aws iam create-role \
  --role-name eks-service-role \
  --assume-role-policy-document $TRUST_POLICY \
  --region us-east-1

aws iam attach-role-policy \
  --role-name eks-service-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSServiceRolePolicy \
  --region us-east-1
```

Create EKS cluster:
```bash
aws eks create-cluster \
  --name multi-container-eks \
  --version 1.28 \
  --role-arn arn:aws:iam::$ACCOUNT_ID:role/eks-service-role \
  --resources-vpc-config subnetIds=subnet-xxxxx,subnet-yyyyy \
  --region us-east-1
```

Wait for cluster to be active:
```bash
aws eks describe-cluster \
  --name multi-container-eks \
  --region us-east-1 \
  --query 'cluster.status'
```

---

## 🔗 Step 6: Add Node Group to EKS

### Via AWS Console

**Portal Navigation:** `AWS Console > EKS > Clusters > multi-container-eks > Compute > Add Node Group`

1. Click **Add Node Group**
2. **Name**: `multi-container-nodegroup`
3. **Role**: Create new role (IAM > Roles)
4. **Node Group compute configuration**: 
   - **Instance types**: `t3.medium` (2-3 nodes recommended)
   - **Min size**: 2
   - **Max size**: 5
   - **Desired size**: 2
5. Click **Create**

### Via AWS CLI

Create node group role:
```bash
$TRUST_POLICY = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
"@

aws iam create-role \
  --role-name eks-node-group-role \
  --assume-role-policy-document $TRUST_POLICY

aws iam attach-role-policy \
  --role-name eks-node-group-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy

aws iam attach-role-policy \
  --role-name eks-node-group-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy

aws iam attach-role-policy \
  --role-name eks-node-group-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

Create node group:
```bash
aws eks create-nodegroup \
  --cluster-name multi-container-eks \
  --nodegroup-name multi-container-nodegroup \
  --subnets subnet-xxxxx subnet-yyyyy \
  --node-role arn:aws:iam::$ACCOUNT_ID:role/eks-node-group-role \
  --scaling-config minSize=2,maxSize=5,desiredSize=2 \
  --instance-types t3.medium \
  --region us-east-1
```

---

## 🔗 Step 7: Connect to EKS Cluster

Update kubeconfig:
```bash
aws eks update-kubeconfig \
  --region us-east-1 \
  --name multi-container-eks
```

Verify connection:
```bash
kubectl cluster-info
kubectl get nodes
```

You should see 2+ nodes running.

---

# 🚢 Deployment Path A: Without Istio

## 📁 Step 8A: Deploy Application (Without Istio)

Create `k8s/aws-deployment.yaml`:

```yaml
# MongoDB
apiVersion: v1
kind: Namespace
metadata:
  name: default
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: mongo-config
  namespace: default
data:
  MONGO_INITDB_ROOT_USERNAME: admin
  MONGO_INITDB_ROOT_PASSWORD: password
---
apiVersion: v1
kind: Service
metadata:
  name: todo-database
  namespace: default
spec:
  type: ClusterIP
  ports:
  - port: 27017
    targetPort: 27017
  selector:
    app: mongo
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongo
  namespace: default
spec:
  serviceName: todo-database
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
        image: mongo:latest
        ports:
        - containerPort: 27017
        env:
        - name: MONGO_INITDB_ROOT_USERNAME
          valueFrom:
            configMapKeyRef:
              name: mongo-config
              key: MONGO_INITDB_ROOT_USERNAME
        - name: MONGO_INITDB_ROOT_PASSWORD
          valueFrom:
            configMapKeyRef:
              name: mongo-config
              key: MONGO_INITDB_ROOT_PASSWORD
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        volumeMounts:
        - name: mongo-storage
          mountPath: /data/db
      volumes:
      - name: mongo-storage
        emptyDir: {}
---
# Frontend
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: default
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
  selector:
    app: frontend
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/multi-container-app/frontend:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
---
# Todo App
apiVersion: v1
kind: Service
metadata:
  name: todo-app
  namespace: default
spec:
  type: ClusterIP
  ports:
  - port: 3000
    targetPort: 3000
  selector:
    app: todo-app
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-app
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: todo-app
  template:
    metadata:
      labels:
        app: todo-app
    spec:
      containers:
      - name: todo-app
        image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/multi-container-app/todo-app:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
        env:
        - name: MONGO_URI
          value: "mongodb://admin:password@todo-database:27017/todos?authSource=admin"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
---
# Calculator API
apiVersion: v1
kind: Service
metadata:
  name: calculator-api
  namespace: default
spec:
  type: ClusterIP
  ports:
  - port: 5000
    targetPort: 5000
  selector:
    app: calculator-api
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: calculator-api
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: calculator-api
  template:
    metadata:
      labels:
        app: calculator-api
    spec:
      containers:
      - name: calculator-api
        image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/multi-container-app/calculator-api:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 5000
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
---
# Health Monitor
apiVersion: v1
kind: Service
metadata:
  name: health-monitor
  namespace: default
spec:
  type: ClusterIP
  ports:
  - port: 4000
    targetPort: 4000
  selector:
    app: health-monitor
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: health-monitor
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: health-monitor
  template:
    metadata:
      labels:
        app: health-monitor
    spec:
      containers:
      - name: health-monitor
        image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/multi-container-app/health-monitor:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 4000
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
```

Replace `<ACCOUNT_ID>` with your AWS account ID, then deploy:

```bash
kubectl apply -f k8s/aws-deployment.yaml
```

Verify:
```bash
kubectl get pods
kubectl get svc
```

---

## 🌐 Step 9A: Install AWS Load Balancer Controller

Install using Helm:

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update

# Create IAM policy
$POLICY = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "elbv2:CreateLoadBalancer",
        "elbv2:CreateTargetGroup",
        "elbv2:CreateListener",
        "elbv2:DeleteLoadBalancer",
        "elbv2:DeleteTargetGroup",
        "elbv2:DeleteListener",
        "elbv2:ModifyLoadBalancerAttributes",
        "elbv2:ModifyTargetGroupAttributes",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSubnets",
        "ec2:DescribeVpcs"
      ],
      "Resource": "*"
    }
  ]
}
"@

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerPolicy \
  --policy-document $POLICY \
  --region us-east-1

# Create service account
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=multi-container-eks \
  --set serviceAccount.create=true
```

---

## 🌐 Step 10A: Setup Ingress

Create `k8s/aws-ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  rules:
  - host: frontend.yourapp.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
  - host: api.yourapp.com
    http:
      paths:
      - path: /calc
        pathType: Prefix
        backend:
          service:
            name: calculator-api
            port:
              number: 5000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: todo-app
            port:
              number: 3000
  - host: health.yourapp.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: health-monitor
            port:
              number: 4000
```

Apply:
```bash
kubectl apply -f k8s/aws-ingress.yaml
```

Get load balancer DNS:
```bash
kubectl get ingress app-ingress -w
```

Wait for EXTERNAL-IP to appear.

---

## 🌍 Step 11A: Setup Route 53 DNS

### Via AWS Console

**Portal Navigation:** `AWS Console > Route 53 > Hosted Zones > Create Hosted Zone`

1. Enter domain: `yourapp.com`
2. Click **Create Hosted Zone**
3. Add A records:
   - **Name**: `frontend.yourapp.com` → Points to ALB IP
   - **Name**: `api.yourapp.com` → Points to ALB IP
   - **Name**: `health.yourapp.com` → Points to ALB IP

### Via AWS CLI

```bash
# Get hosted zone ID
$ZONE_ID = aws route53 list-hosted-zones-by-name \
  --dns-name yourapp.com \
  --query 'HostedZones[0].Id' \
  --output text

# Get ALB IP
$ALB_IP = kubectl get ingress app-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Create A record
$CHANGE_BATCH = @"
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "frontend.yourapp.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "$ALB_IP"}]
      }
    },
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.yourapp.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "$ALB_IP"}]
      }
    },
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "health.yourapp.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "$ALB_IP"}]
      }
    }
  ]
}
"@

aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch $CHANGE_BATCH
```

---

## ✅ Step 12A: Test Application (Without Istio)

Access your application:
- **Frontend**: http://frontend.yourapp.com
- **Todo API**: http://api.yourapp.com/todos
- **Calculator**: http://api.yourapp.com/calc
- **Health**: http://health.yourapp.com

---

# 🕸️ Deployment Path B: With Istio Service Mesh

## 🕸️ Step 8B: Install Istio

Download and install Istio:

```bash
# Download latest Istio
curl -L https://istio.io/downloadIstio | sh -
cd istio-1.20.0

# Add to PATH
$env:PATH = "$PWD\bin;$env:PATH"

# Install Istio with demo profile
istioctl install --set profile=demo -y

# Or use Helm
helm repo add istio https://istio-release.storage.googleapis.com/charts
helm repo update

helm install istio-base istio/base -n istio-system --create-namespace
helm install istiod istio/istiod -n istio-system --wait
helm install istio-ingressgateway istio/gateway -n istio-system --wait
```

Verify:
```bash
kubectl get pods -n istio-system
```

---

## 🏷️ Step 9B: Enable Sidecar Injection

Label namespace:
```bash
kubectl label namespace default istio-injection=enabled
```

---

## 📦 Step 10B: Deploy Application (With Istio)

Create `k8s/aws-istio-deployment.yaml` (similar to Path A but with version labels):

```yaml
# Same as aws-deployment.yaml but add version labels:
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  template:
    metadata:
      labels:
        app: frontend
        version: v1
    spec:
      containers:
      - name: frontend
        image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/multi-container-app/frontend:latest
# ... (repeat for all deployments with version: v1)
```

Deploy:
```bash
kubectl apply -f k8s/aws-istio-deployment.yaml
```

Verify (2/2 containers per pod):
```bash
kubectl get pods
```

---

## 🌐 Step 11B: Configure Istio Gateway & VirtualServices

Create `k8s/aws-istio-gateway.yaml`:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: app-gateway
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 80
      name: http
      protocol: HTTP
    hosts:
    - "frontend.yourapp.com"
    - "api.yourapp.com"
    - "health.yourapp.com"
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: frontend
spec:
  hosts:
  - "frontend.yourapp.com"
  gateways:
  - app-gateway
  http:
  - route:
    - destination:
        host: frontend
        port:
          number: 80
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: api
spec:
  hosts:
  - "api.yourapp.com"
  gateways:
  - app-gateway
  http:
  - match:
    - uri:
        prefix: /calc
    route:
    - destination:
        host: calculator-api
        port:
          number: 5000
  - match:
    - uri:
        prefix: /
    route:
    - destination:
        host: todo-app
        port:
          number: 3000
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: health-monitor
spec:
  hosts:
  - "health.yourapp.com"
  gateways:
  - app-gateway
  http:
  - route:
    - destination:
        host: health-monitor
        port:
          number: 4000
```

Apply:
```bash
kubectl apply -f k8s/aws-istio-gateway.yaml
```

Get Istio Ingress Gateway external IP:
```bash
kubectl get svc -n istio-system istio-ingressgateway
```

Configure Route 53 to point to this IP.

---

## 🛡️ Step 12B: Enable mTLS

Create `k8s/aws-istio-mtls.yaml`:

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: default
spec:
  mtls:
    mode: STRICT
```

Apply:
```bash
kubectl apply -f k8s/aws-istio-mtls.yaml
```

---

## 📊 Step 13B: Install Observability Tools

### Kiali Dashboard

```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/kiali.yaml -n istio-system

# Access
kubectl port-forward svc/kiali -n istio-system 20001:20001
# http://localhost:20001
```

### Prometheus

```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/prometheus.yaml -n istio-system

# Access
kubectl port-forward svc/prometheus -n istio-system 9090:9090
# http://localhost:9090
```

### Grafana

```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/grafana.yaml -n istio-system

# Access
kubectl port-forward svc/grafana -n istio-system 3000:3000
# http://localhost:3000
```

### Jaeger (Distributed Tracing)

```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/jaeger.yaml -n istio-system

# Access
kubectl port-forward svc/tracing -n istio-system 16686:80
# http://localhost:16686
```

---

## 📈 AWS Monitoring Integration

### CloudWatch Container Insights

**Portal Navigation:** `AWS Console > CloudWatch > Container Insights > Setup`

```bash
# Enable Container Insights
aws eks create-addon \
  --cluster-name multi-container-eks \
  --addon-name vpc-cni \
  --addon-version latest \
  --region us-east-1

aws eks create-addon \
  --cluster-name multi-container-eks \
  --addon-name kube-proxy \
  --addon-version latest \
  --region us-east-1
```

View metrics:
```bash
# AWS Console > CloudWatch > Container Insights > Performance Monitoring
```

---

## 🔄 Update Application

1. Make code changes
2. Rebuild and push:

```bash
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
$ECR_URI = "$ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com"

docker build -t todo-app:v2 ./app
docker tag todo-app:v2 $ECR_URI/multi-container-app/todo-app:v2
docker push $ECR_URI/multi-container-app/todo-app:v2
```

3. Update deployment:

```bash
kubectl set image deployment/todo-app todo-app=$ECR_URI/multi-container-app/todo-app:v2
```

4. Verify:

```bash
kubectl rollout status deployment/todo-app
```

---

## 💰 Cost Optimization

### View EKS Costs

**Portal Navigation:** `AWS Console > Cost Explorer > EKS Costs`

### Scale down nodes

```bash
aws eks update-nodegroup-config \
  --cluster-name multi-container-eks \
  --nodegroup-name multi-container-nodegroup \
  --scaling-config minSize=1,maxSize=3,desiredSize=1 \
  --region us-east-1
```

### Use Spot Instances

Create spot node group:
```bash
aws eks create-nodegroup \
  --cluster-name multi-container-eks \
  --nodegroup-name spot-nodegroup \
  --subnets subnet-xxxxx \
  --node-role arn:aws:iam::$ACCOUNT_ID:role/eks-node-group-role \
  --scaling-config minSize=1,maxSize=5,desiredSize=2 \
  --instance-types t3.medium t3.large \
  --capacity-type SPOT \
  --region us-east-1
```

### Use Reserved Instances

**Portal Navigation:** `AWS Console > EC2 > Reserved Instances > Purchase Reserved Instances`

---

## 🔒 Security Best Practices

### Enable Pod Security Policy

```bash
# Create cluster with PSP
aws eks create-cluster \
  --name multi-container-eks \
  --pod-identity-associations \
  --enable-logging '{"clusterLogging":[{"types":["api","audit","authenticator"],"enabled":true}]}'
```

### Use AWS Secrets Manager

**Portal Navigation:** `AWS Console > Secrets Manager > Store a New Secret`

```bash
# Store MongoDB password
aws secretsmanager create-secret \
  --name mongo-password \
  --secret-string password \
  --region us-east-1

# Reference in deployment
# valueFrom:
#   secretKeyRef:
#     name: mongo-password
#     key: password
```

### Enable VPC Flow Logs

**Portal Navigation:** `AWS Console > VPC > Flow Logs > Create Flow Log`

### Enable CloudTrail

**Portal Navigation:** `AWS Console > CloudTrail > Create Trail`

```bash
aws cloudtrail create-trail \
  --name multi-container-trail \
  --s3-bucket-name multi-container-logs \
  --region us-east-1
```

---

## 📊 AWS Portal Navigation Summary

| Task | Portal Route |
|------|-------------|
| **View EKS Clusters** | AWS Console > EKS > Clusters |
| **View Node Groups** | AWS Console > EKS > Clusters > [Cluster] > Compute |
| **View Logs** | AWS Console > CloudWatch > Logs |
| **View Cost** | AWS Console > Cost Explorer |
| **Manage IAM** | AWS Console > IAM > Users/Roles |
| **Manage ECR** | AWS Console > ECR > Repositories |
| **Configure DNS** | AWS Console > Route 53 > Hosted Zones |
| **View Load Balancers** | AWS Console > EC2 > Load Balancers |
| **Monitor Performance** | AWS Console > CloudWatch > Container Insights |
| **View Alerts** | AWS Console > CloudWatch > Alarms |
| **Enable Logging** | AWS Console > CloudTrail |
| **Manage VPC** | AWS Console > VPC > Virtual Private Clouds |
| **Configure Security Groups** | AWS Console > EC2 > Security Groups |
| **View Networking** | AWS Console > VPC > Network Interfaces |

---

## 🧹 Cleanup / Delete Resources

Delete EKS cluster and node group:

```bash
# Delete node group
aws eks delete-nodegroup \
  --cluster-name multi-container-eks \
  --nodegroup-name multi-container-nodegroup \
  --region us-east-1 \
  --no-cli-pager

# Delete cluster
aws eks delete-cluster \
  --name multi-container-eks \
  --region us-east-1

# Delete ECR repositories
aws ecr delete-repository \
  --repository-name multi-container-app/frontend \
  --force \
  --region us-east-1

# Delete IAM roles
aws iam delete-role \
  --role-name eks-service-role
aws iam delete-role \
  --role-name eks-node-group-role
```

---

## 🐛 Troubleshooting

### Nodes not starting

Check node group events:
```bash
aws eks describe-nodegroup \
  --cluster-name multi-container-eks \
  --nodegroup-name multi-container-nodegroup \
  --region us-east-1 \
  --query 'nodegroup.health'
```

### Pods cannot pull ECR images

Check IAM permissions:
```bash
aws iam get-role \
  --role-name eks-node-group-role \
  --query 'Role.AssumeRolePolicyDocument'
```

Ensure `AmazonEC2ContainerRegistryReadOnly` is attached.

### Ingress LoadBalancer not getting IP

Check ingress controller:
```bash
kubectl describe ingress app-ingress
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

### DNS not resolving

Check Route 53 records:
```bash
aws route53 list-resource-record-sets \
  --hosted-zone-id <ZONE_ID>
```

Verify ALB is in public subnet with routing to internet gateway.

### High AWS bills

**Portal Navigation:** `AWS Console > Cost Explorer > Filter by EKS`

Check:
- NAT Gateway costs (data transfer)
- Load Balancer costs
- Unused EBS volumes
- Reserved Instance utilization

---

## 🏁 Comparison: With vs Without Istio

| Feature | Without Istio | With Istio |
|---------|---------------|------------|
| **Setup Time** | 15-20 mins | 25-30 mins |
| **Pod Overhead** | None (1/1) | ~50MB per pod (2/2) |
| **Traffic Control** | Basic | Advanced (retry, timeout) |
| **mTLS** | Manual | Automatic |
| **Observability** | CloudWatch | Full tracing + mesh visualization |
| **Cost** | Lower | ~20-30% higher |
| **Complexity** | Low | Moderate |

---

## 📚 Additional Resources

- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
- [AWS EKS Workshop](https://www.eksworkshop.com/)
- [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [Istio Documentation](https://istio.io/latest/docs/)
- [AWS Cost Explorer](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

---

## 🎯 Quick Reference Commands

```bash
# Connect to cluster
aws eks update-kubeconfig --name multi-container-eks --region us-east-1

# View cluster info
aws eks describe-cluster --name multi-container-eks --region us-east-1

# View node groups
aws eks list-nodegroups --cluster-name multi-container-eks --region us-east-1

# Get cluster status
aws eks describe-cluster \
  --name multi-container-eks \
  --region us-east-1 \
  --query 'cluster.{Name:name,Status:status,Version:version}'

# View logs
aws logs tail /aws/eks/multi-container-eks/cluster --follow

# Get resource usage
kubectl top nodes
kubectl top pods

# Check ingress
kubectl get ingress
kubectl describe ingress app-ingress

# Port forward to service
kubectl port-forward svc/frontend 8080:80

# View deployment history
kubectl rollout history deployment/todo-app

# Rollback deployment
kubectl rollout undo deployment/todo-app

# Scale deployment
kubectl scale deployment todo-app --replicas=3

# View pod logs
kubectl logs -f <POD_NAME>
kubectl logs -f <POD_NAME> --previous  # Crashed pod

# Execute commands in pod
kubectl exec -it <POD_NAME> -- /bin/sh
```

---

🎊 **Your multi-container application is now running on AWS EKS!**

Choose the deployment path that matches your requirements:
- **Path A (Without Istio)**: Simpler, cheaper, good for standard Kubernetes
- **Path B (With Istio)**: Advanced features, better observability, production-grade service mesh
