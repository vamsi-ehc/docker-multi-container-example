# ☁️ Azure AKS Deployment Guide

Complete guide to deploy your multi-container application on **Azure Kubernetes Service (AKS)** with and without Istio service mesh.

---

## 🌐 Traffic Flow Architecture

### Overall Azure AKS Setup

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERNET                                    │
│                    (Users & External Requests)                      │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
                   ┌───────────────────────┐
                   │  Azure Public IP (ALB)│
                   │  (frontend.local)     │
                   │  (api.local)          │
                   │  (health.local)       │
                   └───────────────────────┘
                               ↓
        ┌──────────────────────┴──────────────────────┐
        │                                              │
        ↓                                              ↓
┌──────────────────────┐                   ┌──────────────────────┐
│  INGRESS-NGINX       │                   │  ISTIO INGRESSGATEWAY│
│  (Without Istio)     │                   │  (With Istio)        │
│  Routes HTTP/HTTPS  │                   │ Routes + Policies    │
└──────────────────────┘                   └──────────────────────┘
        ↓                                              ↓
        │                      ┌────────────────────┬─┴─┬──────────────┐
        │                      │                    │   │              │
        ↓                      ↓                    ↓   ↓              ↓
   ┌─────────────┐    ┌──────────────┐    ┌─────────────────────────┐
   │  Frontend   │    │  Todo App    │    │  Calculator API         │
   │  Service    │    │  Service     │    │  Health Monitor Service │
   │  (Port 80)  │    │  (Port 3000) │    │                         │
   └─────────────┘    └──────────────┘    └─────────────────────────┘
        ↓                    ↓                      ↓
   ┌─────────────┐    ┌──────────────┐    ┌──────────────────────────┐
   │  Frontend   │    │  Todo App    │    │  Calculator   │ Health   │
   │  Pod (2x)   │    │  Pod (2x)    │    │  Pod (2x)     │ Pod (1x) │
   │ +Sidecar*   │    │ +Sidecar*    │    │ +Sidecar*     │+Sidecar* │
   │ (if Istio)  │    │ (if Istio)   │    │ (if Istio)    │(if Istio)│
   └─────────────┘    └──────────────┘    └──────────────────────────┘
        ↓                    ↓                      ↓
        └────────────────────┴──────────────────────┘
                             ↓
                    ┌────────────────────┐
                    │   MongoDB Service  │
                    │   (Port 27017)     │
                    │   Replica: 1       │
                    └────────────────────┘
                             ↓
                    ┌────────────────────┐
                    │   MongoDB Pod      │
                    │   (No Sidecar)     │
                    │   Persistent Vol   │
                    └────────────────────┘
```

> **Note:** `*Sidecar` = Envoy proxy (only with Istio)

---

## 📋 Prerequisites

- **Azure Account** with active subscription
- **Azure CLI** installed ([Download](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
- **kubectl** installed
- **Docker** installed locally
- **Helm 3** (optional, for Istio installation)
- Sufficient Azure credits/quota

Verify installations:
```bash
az --version
kubectl version --client
docker --version
```

---

## 🔐 Step 1: Azure Login & Setup

Login to Azure:
```bash
az login
```

Set your subscription (if you have multiple):
```bash
# List subscriptions
az account list --output table

# Set active subscription
az account set --subscription "<SUBSCRIPTION_ID>"
```

Create a resource group:
```bash
az group create \
  --name multi-container-rg \
  --location eastus
```

> 💡 **Available regions**: `eastus`, `westus2`, `westeurope`, `southeastasia`, etc.

---

## 📦 Step 2: Create Azure Container Registry (ACR)

Create ACR to store your Docker images:
```bash
az acr create \
  --resource-group multi-container-rg \
  --name multicontaineracr \
  --sku Basic \
  --location eastus
```

> ⚠️ ACR name must be **globally unique** and lowercase. Adjust `multicontaineracr` if taken.

Login to ACR:
```bash
az acr login --name multicontaineracr
```

Get ACR login server:
```bash
az acr show \
  --name multicontaineracr \
  --query loginServer \
  --output tsv
```

Output: `multicontaineracr.azurecr.io` (save this!)

---

## 🏗️ Step 3: Build & Push Docker Images to ACR

Tag and push all images:

```bash
# Set ACR name variable
$ACR_NAME = "multicontaineracr.azurecr.io"

# Build and tag frontend
docker build -t frontend:latest ./frontend
docker tag frontend:latest $ACR_NAME/frontend:latest
docker push $ACR_NAME/frontend:latest

# Build and tag todo-app
docker build -t todo-app:latest ./app
docker tag todo-app:latest $ACR_NAME/todo-app:latest
docker push $ACR_NAME/todo-app:latest

# Build and tag calculator-api
docker build -t calculator-api:latest ./calculator-api
docker tag calculator-api:latest $ACR_NAME/calculator-api:latest
docker push $ACR_NAME/calculator-api:latest

# Build and tag health-monitor
docker build -t health-monitor:latest ./health-monitor
docker tag health-monitor:latest $ACR_NAME/health-monitor:latest
docker push $ACR_NAME/health-monitor:latest
```

Verify images:
```bash
az acr repository list --name multicontaineracr --output table
```

---

## ⚙️ Step 4: Create AKS Cluster

### Option A: Without Istio (Standard AKS)

Create basic AKS cluster:
```bash
az aks create \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --node-count 2 \
  --node-vm-size Standard_B2s \
  --enable-managed-identity \
  --attach-acr multicontaineracr \
  --generate-ssh-keys \
  --location eastus
```

### Option B: With Istio (AKS with Istio Add-on)

Create AKS with Istio service mesh add-on:
```bash
az aks create \
  --resource-group multi-container-rg \
  --name multi-container-aks-istio \
  --node-count 2 \
  --node-vm-size Standard_B2s \
  --enable-managed-identity \
  --attach-acr multicontaineracr \
  --enable-asm \
  --generate-ssh-keys \
  --location eastus
```

> 📝 `--enable-asm` enables the **Azure Service Mesh** (Istio-based managed add-on)

⏱️ Cluster creation takes **5-10 minutes**.

---

## 🔗 Step 5: Connect to AKS Cluster

Get cluster credentials:
```bash
# For standard AKS
az aks get-credentials \
  --resource-group multi-container-rg \
  --name multi-container-aks

# For AKS with Istio
az aks get-credentials \
  --resource-group multi-container-rg \
  --name multi-container-aks-istio
```

Verify connection:
```bash
kubectl cluster-info
kubectl get nodes
```

---

# 🚢 Deployment Path A: Without Istio (Standard Kubernetes)

## � Traffic Flow (Without Istio)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    USER BROWSER REQUEST                             │
│              http://frontend.local/todos                            │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
                     ┌──────────────────┐
                     │ Azure Load       │
                     │ Balancer (ALB)   │
                     │ Public IP:       │
                     │ 40.xx.xx.xx      │
                     └──────────────────┘
                               ↓
                 DNS Resolution: frontend.local
                      ↓
          ┌─────────────────────────────┐
          │ INGRESS-NGINX CONTROLLER    │
          │ Namespace: ingress-nginx    │
          │ Service Type: LoadBalancer  │
          └─────────────────────────────┘
                      ↓
           ┌──────────────────────────┐
           │ INGRESS RESOURCE         │
           │ spec:                    │
           │ - hosts:                 │
           │   - frontend.local       │
           │   - api.local            │
           │   - health.local         │
           │ - backend services       │
           └──────────────────────────┘
                      ↓
    ┌─────────────────┬──────────────┬────────────────┐
    ↓                 ↓              ↓                ↓
┌────────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐
│ Frontend   │  │ Todo App   │  │Calculator│  │  Health    │
│ Service    │  │ Service    │  │  API     │  │  Monitor   │
│ ClusterIP  │  │ ClusterIP  │  │ Service  │  │  Service   │
│ :80        │  │ :3000      │  │ :5000    │  │  :4000     │
└────────────┘  └────────────┘  └──────────┘  └────────────┘
    ↓                 ↓              ↓                ↓
┌────────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐
│ Frontend   │  │ Todo App   │  │Calculator│  │  Health    │
│ Pod-1      │  │ Pod-1      │  │  API     │  │  Monitor   │
│ Pod-2      │  │ Pod-2      │  │  Pod-1   │  │  Pod-1     │
│ (1/1)      │  │ (1/1)      │  │  Pod-2   │  │  (1/1)     │
│            │  │            │  │  (1/1)   │  │            │
└────────────┘  └────────────┘  └──────────┘  └────────────┘
    ↓                 ↓              ↓ (both connect to DB)
    │                 │              │
    └─────────────────┴──────────────┤
                      ↓
            ┌──────────────────────┐
            │ MongoDB Service      │
            │ ClusterIP :27017     │
            └──────────────────────┘
                      ↓
            ┌──────────────────────┐
            │ MongoDB Pod          │
            │ Persistent Storage   │
            │ (Kubernetes PVC)     │
            └──────────────────────┘
```

### Path A - Network Path Example

**Request Flow for:** `http://api.local/todos`

```
1. Browser → ALB (40.xx.xx.xx)
   ├─ DNS lookup: api.local → 40.xx.xx.xx
   └─ HTTP GET /todos

2. ALB → INGRESS-NGINX
   └─ Forwards to ingress controller pod(s)

3. INGRESS-NGINX → Service Routing
   ├─ Matches host: api.local
   ├─ Matches path: /todos
   └─ Routes to: todo-app service

4. Service → Pod Load Balancing
   ├─ Round-robin to todo-app pod-1 or pod-2
   └─ ClusterIP :3000 → Pod Port 3000

5. Pod → Database Query
   ├─ App connects to todo-database:27017
   ├─ MongoDB service resolves DNS
   └─ Reaches MongoDB pod via kube-proxy

6. Response → Browser
   ├─ MongoDB returns data
   ├─ Todo App processes & returns JSON
   ├─ INGRESS-NGINX forwards response
   ├─ ALB sends to client
   └─ Browser renders todos
```

---

## �📁 Step 6A: Create Kubernetes Manifests (Without Istio)

Create `k8s/aks-deployment.yaml`:

```yaml
# MongoDB
apiVersion: v1
kind: Service
metadata:
  name: todo-database
spec:
  type: ClusterIP
  ports:
  - port: 27017
    targetPort: 27017
  selector:
    app: mongo
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongo
spec:
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
          value: admin
        - name: MONGO_INITDB_ROOT_PASSWORD
          value: password
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
        persistentVolumeClaim:
          claimName: mongo-pvc
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongo-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: default
---
# Frontend
apiVersion: v1
kind: Service
metadata:
  name: frontend
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
        image: multicontaineracr.azurecr.io/frontend:latest
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
        image: multicontaineracr.azurecr.io/todo-app:latest
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
        image: multicontaineracr.azurecr.io/calculator-api:latest
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
        image: multicontaineracr.azurecr.io/health-monitor:latest
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

> ⚠️ Replace `multicontaineracr.azurecr.io` with your ACR login server!

Deploy:
```bash
kubectl apply -f k8s/aks-deployment.yaml
```

Verify:
```bash
kubectl get pods
kubectl get svc
```

---

## 🌐 Step 7A: Setup Ingress Controller (Without Istio)

Install NGINX Ingress Controller:
```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
```

Wait for external IP:
```bash
kubectl get svc -n ingress-nginx -w
```

Get the **EXTERNAL-IP** (e.g., `20.12.34.56`).

Create `k8s/aks-ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
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
kubectl apply -f k8s/aks-ingress.yaml
```

---

## 🌍 Step 8A: Configure DNS (Without Istio)

### Option 1: Use Azure DNS

Create DNS zone:
```bash
az network dns zone create \
  --resource-group multi-container-rg \
  --name yourapp.com
```

Add A records pointing to ingress external IP:
```bash
# Get ingress IP
$INGRESS_IP = kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Create DNS records
az network dns record-set a add-record \
  --resource-group multi-container-rg \
  --zone-name yourapp.com \
  --record-set-name frontend \
  --ipv4-address $INGRESS_IP

az network dns record-set a add-record \
  --resource-group multi-container-rg \
  --zone-name yourapp.com \
  --record-set-name api \
  --ipv4-address $INGRESS_IP

az network dns record-set a add-record \
  --resource-group multi-container-rg \
  --zone-name yourapp.com \
  --record-set-name health \
  --ipv4-address $INGRESS_IP
```

### Option 2: Use Public IP with DNS Label

```bash
# Get public IP resource name
az network public-ip list \
  --resource-group MC_multi-container-rg_multi-container-aks_eastus \
  --query "[?contains(name, 'kubernetes')].name" \
  --output tsv

# Set DNS name label
az network public-ip update \
  --resource-group MC_multi-container-rg_multi-container-aks_eastus \
  --name <PUBLIC_IP_NAME> \
  --dns-name multicontainerapp
```

Access via: `multicontainerapp.eastus.cloudapp.azure.com`

### Option 3: Use Hosts File (Testing Only)

Edit hosts file with ingress external IP:
```
20.12.34.56 frontend.yourapp.com
20.12.34.56 api.yourapp.com
20.12.34.56 health.yourapp.com
```

---

## ✅ Step 9A: Test Application (Without Istio)

Access your application:
- **Frontend**: http://frontend.yourapp.com
- **Todo API**: http://api.yourapp.com/todos
- **Calculator**: http://api.yourapp.com/calc
- **Health**: http://health.yourapp.com

---

# 🕸️ Deployment Path B: With Istio Service Mesh

## 📁 Step 6B: Enable Istio in AKS

If you created cluster without `--enable-asm`, enable it:
```bash
az aks mesh enable \
  --resource-group multi-container-rg \
  --name multi-container-aks-istio
```

Verify Istio installation:
```bash
kubectl get pods -n aks-istio-system
```

You should see:
- `istiod-*` (control plane)
- `istio-ingressgateway-*`

---

# 🕸️ Deployment Path B: With Istio Service Mesh

## 🔄 Traffic Flow (With Istio)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    USER BROWSER REQUEST                             │
│              http://frontend.local/todos                            │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
                     ┌──────────────────┐
                     │ Azure Load       │
                     │ Balancer (ALB)   │
                     │ Public IP:       │
                     │ 40.yy.yy.yy      │
                     └──────────────────┘
                               ↓
                 DNS Resolution: frontend.local
                      ↓
          ┌─────────────────────────────┐
          │ ISTIO INGRESSGATEWAY        │
          │ Namespace: istio-system     │
          │ Service Type: LoadBalancer  │
          │ (Envoy Proxy)               │
          └─────────────────────────────┘
                      ↓
           ┌──────────────────────────┐
           │ GATEWAY RESOURCE         │
           │ spec:                    │
           │ - servers:               │
           │   - port: 80             │
           │   - hosts:               │
           │     - frontend.local     │
           │     - api.local          │
           └──────────────────────────┘
                      ↓
           ┌──────────────────────────┐
           │ VIRTUALSERVICE ROUTING   │
           │ Advanced Traffic Rules:  │
           │ - Retries                │
           │ - Timeouts               │
           │ - Circuit breakers       │
           │ - Weighted routing       │
           └──────────────────────────┘
                      ↓
    ┌─────────────────┬──────────────┬────────────────┐
    ↓                 ↓              ↓                ↓
┌────────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐
│ Frontend   │  │ Todo App   │  │Calculator│  │  Health    │
│ Service    │  │ Service    │  │  API     │  │  Monitor   │
│ ClusterIP  │  │ ClusterIP  │  │ Service  │  │  Service   │
│ :80        │  │ :3000      │  │ :5000    │  │  :4000     │
└────────────┘  └────────────┘  └──────────┘  └────────────┘
    ↓                 ↓              ↓                ↓
┌────────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐
│ Frontend   │  │ Todo App   │  │Calculator│  │  Health    │
│ Pod-1      │  │ Pod-1      │  │  API     │  │  Monitor   │
│ Envoy ●    │  │ Envoy ●    │  │  Pod-1   │  │  Pod-1     │
│ App ●      │  │ App ●      │  │  Envoy ●│  │  Envoy ●   │
│ (2/2)      │  │ (2/2)      │  │  App ●  │  │  App ●     │
│ Pod-2      │  │ Pod-2      │  │  (2/2)  │  │  (2/2)     │
│ Envoy ●    │  │ Envoy ●    │  │  Pod-2   │  │            │
│ App ●      │  │ App ●      │  │  Envoy ● │  │            │
│ (2/2)      │  │ (2/2)      │  │  App ●  │  │            │
└────────────┘  └────────────┘  └──────────┘  └────────────┘
    ↓                 ↓              ↓                ↓
    │      ┌──────────────────────┐ │
    │      │  DESTINATION RULES   │ │
    │      │  & PEER AUTH         │ │
    │      │ - mTLS: STRICT       │ │
    │      │ - Retries: 3x        │ │
    │      │ - Timeout: 10s       │ │
    │      └──────────────────────┘ │
    │                               │
    └───────────────┬───────────────┘
                    ↓
            ┌──────────────────────┐
            │ MongoDB Service      │
            │ ClusterIP :27017     │
            │ (No Sidecar)         │
            └──────────────────────┘
                    ↓
            ┌──────────────────────┐
            │ MongoDB Pod          │
            │ Persistent Storage   │
            │ (Kubernetes PVC)     │
            └──────────────────────┘
```

### Path B - Network Path Example with Istio

**Request Flow for:** `http://api.local/todos`

```
1. Browser → Istio Ingress Gateway (40.yy.yy.yy)
   ├─ DNS lookup: api.local → 40.yy.yy.yy
   └─ HTTP GET /todos

2. Istio Ingress Gateway (Envoy)
   ├─ Receives request
   ├─ Applies Gateway policies
   └─ Evaluates VirtualService rules

3. VirtualService Routing (Policy Enforcement)
   ├─ Matches: host = api.local
   ├─ Matches: uri prefix = /todos
   ├─ Checks: Retry policy (3 attempts)
   ├─ Checks: Circuit breaker
   ├─ Routes to: todo-app destination
   └─ Load balancing: Round-robin

4. Service → Sidecar Proxy (Envoy)
   ├─ Pod's Envoy sidecar intercepts
   ├─ Service mesh applies policies:
   │  ├─ Automatic mTLS encryption
   │  ├─ Request timeout: 10s
   │  ├─ Retry with exponential backoff
   │  └─ Circuit breaker on errors
   └─ Forwards to app container

5. Pod → Database Query (via Sidecar)
   ├─ Todo App sends to todo-database:27017
   ├─ Client Sidecar → mTLS handshake
   ├─ Encrypted connection to MongoDB
   └─ (MongoDB pod has NO sidecar - not in mesh)

6. Metrics Collection
   ├─ Envoy sidecars collect metrics
   │  ├─ Request latency
   │  ├─ Success/error rates
   │  └─ Traffic volume
   ├─ Sent to Prometheus (if enabled)
   └─ Visualized in Kiali dashboard

7. Response → Browser
   ├─ MongoDB returns data (unencrypted local)
   ├─ Sidecar applies egress rules
   ├─ Todo App processes & returns
   ├─ Sidecar compresses response
   ├─ Ingress gateway forwards to client
   ├─ ALB sends to browser
   └─ Browser renders todos
```

### Istio Traffic Management Policies

```
┌─────────────────────────────────────────────────────┐
│       VIRTUALSERVICE TRAFFIC POLICIES                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  RETRY POLICY                                      │
│  ├─ attempts: 3                                    │
│  ├─ perTryTimeout: 5s                             │
│  └─ retryOn: 5xx,reset-by-peer                    │
│                                                     │
│  TIMEOUT POLICY                                    │
│  └─ timeout: 10s (per request)                    │
│                                                     │
│  WEIGHTED ROUTING (Canary)                         │
│  ├─ Version v1: 90% traffic                       │
│  └─ Version v2: 10% traffic                       │
│                                                     │
│  CIRCUIT BREAKER (Destination Rule)                │
│  ├─ Max connections: 100                          │
│  ├─ Max pending requests: 50                      │
│  ├─ Max errors: 5                                 │
│  └─ Eject time: 30s                               │
│                                                     │
│  mTLS (Peer Authentication)                        │
│  ├─ Mode: STRICT                                  │
│  ├─ Auto-encryption between all pods              │
│  └─ Certificates managed by Istio                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🏷️ Step 6B: Enable Sidecar Injection

Label namespace for automatic sidecar injection:
```bash
kubectl label namespace default istio.io/rev=asm-1-20
```

> 📝 AKS uses revision-based injection. Check your revision:
```bash
kubectl get mutatingwebhookconfigurations | grep istio
```

---

## 📦 Step 8B: Deploy Application (With Istio)

Create `k8s/aks-istio-deployment.yaml`:

```yaml
# MongoDB (no sidecar needed)
apiVersion: v1
kind: Service
metadata:
  name: todo-database
spec:
  type: ClusterIP
  ports:
  - port: 27017
    name: mongo
  selector:
    app: mongo
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mongo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
      annotations:
        sidecar.istio.io/inject: "false"  # No sidecar for database
    spec:
      containers:
      - name: mongo
        image: mongo:latest
        ports:
        - containerPort: 27017
        env:
        - name: MONGO_INITDB_ROOT_USERNAME
          value: admin
        - name: MONGO_INITDB_ROOT_PASSWORD
          value: password
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
        persistentVolumeClaim:
          claimName: mongo-pvc
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongo-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: default
---
# Frontend Service
apiVersion: v1
kind: Service
metadata:
  name: frontend
  labels:
    app: frontend
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
    name: http
  selector:
    app: frontend
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
        version: v1
    spec:
      containers:
      - name: frontend
        image: multicontaineracr.azurecr.io/frontend:latest
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
# Todo App Service
apiVersion: v1
kind: Service
metadata:
  name: todo-app
  labels:
    app: todo-app
spec:
  type: ClusterIP
  ports:
  - port: 3000
    targetPort: 3000
    name: http
  selector:
    app: todo-app
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: todo-app
  template:
    metadata:
      labels:
        app: todo-app
        version: v1
    spec:
      containers:
      - name: todo-app
        image: multicontaineracr.azurecr.io/todo-app:latest
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
# Calculator API Service
apiVersion: v1
kind: Service
metadata:
  name: calculator-api
  labels:
    app: calculator-api
spec:
  type: ClusterIP
  ports:
  - port: 5000
    targetPort: 5000
    name: http
  selector:
    app: calculator-api
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: calculator-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: calculator-api
  template:
    metadata:
      labels:
        app: calculator-api
        version: v1
    spec:
      containers:
      - name: calculator-api
        image: multicontaineracr.azurecr.io/calculator-api:latest
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
# Health Monitor Service
apiVersion: v1
kind: Service
metadata:
  name: health-monitor
  labels:
    app: health-monitor
spec:
  type: ClusterIP
  ports:
  - port: 4000
    targetPort: 4000
    name: http
  selector:
    app: health-monitor
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: health-monitor
spec:
  replicas: 1
  selector:
    matchLabels:
      app: health-monitor
  template:
    metadata:
      labels:
        app: health-monitor
        version: v1
    spec:
      containers:
      - name: health-monitor
        image: multicontaineracr.azurecr.io/health-monitor:latest
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

Deploy:
```bash
kubectl apply -f k8s/aks-istio-deployment.yaml
```

Verify (each pod should show 2/2):
```bash
kubectl get pods
```

---

## 🌐 Step 9B: Configure Istio Gateway & VirtualServices

Create `k8s/aks-istio-gateway.yaml`:

```yaml
# Istio Gateway
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: app-gateway
spec:
  selector:
    istio: ingressgateway-external
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
# Frontend VirtualService
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
  - match:
    - uri:
        prefix: /
    route:
    - destination:
        host: frontend
        port:
          number: 80
---
# API VirtualService (Todo + Calculator)
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
# Health Monitor VirtualService
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
  - match:
    - uri:
        prefix: /
    route:
    - destination:
        host: health-monitor
        port:
          number: 4000
```

Apply:
```bash
kubectl apply -f k8s/aks-istio-gateway.yaml
```

---

## 🛡️ Step 10B: Enable mTLS (Optional)

Create `k8s/aks-istio-mtls.yaml`:

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
kubectl apply -f k8s/aks-istio-mtls.yaml
```

---

## 🌍 Step 11B: Get Istio Gateway External IP

Get external IP:
```bash
kubectl get svc -n aks-istio-ingress
```

Look for `istio-ingressgateway-external` service EXTERNAL-IP.

Configure DNS (same as Step 8A) but use the Istio gateway IP instead.

---

## ✅ Step 12B: Test Application (With Istio)

Access your application:
- **Frontend**: http://frontend.yourapp.com
- **Todo API**: http://api.yourapp.com/todos
- **Calculator**: http://api.yourapp.com/calc
- **Health**: http://health.yourapp.com

---

## 📊 Step 13B: Enable Istio Observability

### Install Kiali (Service Mesh Dashboard)

```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/kiali.yaml -n aks-istio-system
```

Expose Kiali:
```bash
kubectl port-forward svc/kiali -n aks-istio-system 20001:20001
```

Access: http://localhost:20001

### Install Prometheus & Grafana

```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/prometheus.yaml -n aks-istio-system
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/grafana.yaml -n aks-istio-system
```

Expose Grafana:
```bash
kubectl port-forward svc/grafana -n aks-istio-system 3000:3000
```

Access: http://localhost:3000

### Install Jaeger (Distributed Tracing)

```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/jaeger.yaml -n aks-istio-system
```

Expose Jaeger:
```bash
kubectl port-forward svc/tracing -n aks-istio-system 16686:80
```

Access: http://localhost:16686

---

## 📈 Monitoring with Azure Monitor

### Enable Container Insights

```bash
az aks enable-addons \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --addons monitoring
```

View logs:
```bash
az monitor log-analytics workspace list --output table
```

Access via Azure Portal → Monitor → Containers

---

### 📊 Istio Observability Visualization (Kiali Dashboard)

When using Istio, you can visualize your service mesh in Kiali:

```
┌─────────────────────────────────────────────────────────────────┐
│                     KIALI SERVICE MESH DASHBOARD                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Graph View:                                                    │
│                                                                 │
│         ┌──────────────┐          ┌──────────────┐              │
│         │  Frontend    │◄───────►│  Todo App    │              │
│         │   (v1: 100%) │ 95ms    │  (v1: 90%)   │              │
│         │  ✓ Healthy  │          │  ✓ Healthy  │              │
│         │  90 req/sec  │          │  45 req/sec  │              │
│         └──────────────┘          └──────────────┘              │
│               │                          │                      │
│               │                          ▼                      │
│               │                   ┌──────────────┐              │
│               │                   │   MongoDB    │              │
│               │                   │ :27017       │              │
│               └──────────────────►│  ✓ Connected │              │
│                                   │  5ms latency │              │
│         ┌──────────────┐          └──────────────┘              │
│         │ Calculator   │                                        │
│         │  API (v2: ?) │          ┌──────────────┐              │
│         │  (v1: 10%)   │◄────────►│  Health      │              │
│         │ ✓ Healthy    │ 2ms      │  Monitor     │              │
│         │  20 req/sec  │          │ ✓ Healthy    │              │
│         └──────────────┘          └──────────────┘              │
│                                                                 │
│  Metrics:                                                       │
│  ├─ Request Rate: 155 req/sec                                  │
│  ├─ Success Rate: 99.8%                                        │
│  ├─ P95 Latency: 150ms                                         │
│  ├─ mTLS Status: All connections encrypted ✓                  │
│  └─ Circuit Breaker: 0 trips                                   │
│                                                                 │
│  Tracing (Jaeger):                                              │
│  ├─ Request IDs tracked across services                        │
│  ├─ Distributed latency breakdown visible                      │
│  ├─ Service dependencies mapped                                │
│  └─ Error traces available                                     │
│                                                                 │
│  Alerts:                                                        │
│  ├─ High Error Rate (>5%): NOT triggered                      │
│  ├─ Slow Response (>500ms): NOT triggered                     │
│  ├─ Pod Crash Loop: NOT triggered                             │
│  └─ mTLS Issues: NOT triggered                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Metrics Collected by Istio Sidecars

```
PER REQUEST METRICS
├─ Request Details
│  ├─ Source Service: frontend
│  ├─ Destination Service: todo-app
│  ├─ Protocol: HTTP/1.1
│  ├─ Method: GET /todos
│  ├─ Status Code: 200
│  ├─ Latency: 145ms
│  └─ Bytes Sent/Received: 1.2KB / 3.5KB
├─ Retry Information
│  ├─ Attempts: 1 (success on first try)
│  └─ Backoff: N/A
├─ Circuit Breaker Status
│  └─ Status: OPEN/CLOSED (no trips)
└─ Security
   ├─ TLS Version: TLSv1.3
   ├─ Cipher: TLS_AES_256_GCM_SHA384
   └─ Certificate Valid Until: 2025-01-02

TIME SERIES METRICS
├─ Request Rate (req/sec)
│  ├─ Frontend → Todo: 45 req/sec
│  ├─ Frontend → Calculator: 12 req/sec
│  └─ Todo → MongoDB: 45 queries/sec
├─ Latency Distribution
│  ├─ p50 (median): 95ms
│  ├─ p95: 150ms
│  ├─ p99: 250ms
│  └─ p99.9: 400ms
├─ Error Rate
│  ├─ Total Errors: 0.2%
│  ├─ 5xx Errors: 0.05%
│  ├─ 4xx Errors: 0.15%
│  └─ Connection Errors: 0%
└─ Throughput
   ├─ Inbound: 2.5 Mbps
   ├─ Outbound: 3.2 Mbps
   └─ Total: 5.7 Mbps
```

---

## 🔄 Update Application

### Update a Single Service

1. Make code changes
2. Rebuild and push image:

```bash
$ACR_NAME = "multicontaineracr.azurecr.io"
docker build -t todo-app:v2 ./app
docker tag todo-app:v2 $ACR_NAME/todo-app:v2
docker push $ACR_NAME/todo-app:v2
```

3. Update deployment:

```bash
kubectl set image deployment/todo-app todo-app=$ACR_NAME/todo-app:v2
```

4. Verify:

```bash
kubectl rollout status deployment/todo-app
```

---

## 💰 Cost Optimization

### Scale down when not in use

```bash
# Scale down all deployments
kubectl scale deployment --all --replicas=0

# Scale down nodes
az aks scale \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --node-count 1
```

### Stop cluster (keeps resources but stops billing)

```bash
az aks stop \
  --resource-group multi-container-rg \
  --name multi-container-aks
```

### Start cluster

```bash
az aks start \
  --resource-group multi-container-rg \
  --name multi-container-aks
```

---

## 🔒 Security Best Practices

### Store secrets in Azure Key Vault

```bash
# Create Key Vault
az keyvault create \
  --name multicontainerkv \
  --resource-group multi-container-rg \
  --location eastus

# Store MongoDB password
az keyvault secret set \
  --vault-name multicontainerkv \
  --name mongo-password \
  --value "your-secure-password"
```

Enable Key Vault integration:
```bash
az aks enable-addons \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --addons azure-keyvault-secrets-provider
```

### Enable Network Policies

```bash
az aks update \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --network-policy azure
```

### Use Azure AD Authentication

```bash
az aks update \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --enable-aad \
  --aad-admin-group-object-ids <ADMIN_GROUP_ID>
```

---

## 🧹 Cleanup / Delete Resources

Delete specific resources:
```bash
# Delete deployments
kubectl delete -f k8s/aks-deployment.yaml
kubectl delete -f k8s/aks-istio-deployment.yaml

# Delete cluster
az aks delete \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --yes --no-wait
```

Delete entire resource group (WARNING: deletes everything):
```bash
az group delete \
  --name multi-container-rg \
  --yes --no-wait
```

---

## 🐛 Troubleshooting

### Cannot pull images from ACR

Check ACR integration:
```bash
az aks check-acr \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --acr multicontaineracr.azurecr.io
```

Reattach ACR:
```bash
az aks update \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --attach-acr multicontaineracr
```

### Pods not getting sidecar (Istio)

Check namespace label:
```bash
kubectl get namespace default --show-labels
```

Re-label and restart:
```bash
kubectl label namespace default istio.io/rev=asm-1-20 --overwrite
kubectl rollout restart deployment --all
```

### Ingress not working

Check ingress controller:
```bash
# For NGINX
kubectl get pods -n ingress-nginx

# For Istio
kubectl get pods -n aks-istio-ingress
```

Check external IP assignment:
```bash
kubectl get svc -A | grep LoadBalancer
```

### High costs

Check resource usage:
```bash
kubectl top nodes
kubectl top pods

# View pricing
az aks show \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --query 'agentPoolProfiles[].vmSize'
```

---

## 📊 Comparison: With vs Without Istio

| Feature | Without Istio | With Istio |
|---------|---------------|------------|
| **Setup Complexity** | Simple | Moderate |
| **Resource Usage** | Lower (no sidecars) | Higher (2x pods) |
| **Traffic Management** | Basic (Ingress) | Advanced (retries, circuit breakers) |
| **Security** | Manual TLS | Automatic mTLS |
| **Observability** | Azure Monitor only | Full tracing + metrics |
| **Cost** | Lower | ~20-30% higher |
| **Best For** | Simple apps, cost-sensitive | Production, microservices |

### Side-by-Side Network Comparison

```
WITHOUT ISTIO (Path A)              |    WITH ISTIO (Path B)
─────────────────────────────────────────────────────────────

Client Request                      |    Client Request
        ↓                           |           ↓
   ALB (Public IP)                  |    ALB (Public IP)
        ↓                           |           ↓
INGRESS-NGINX Controller            |  ISTIO INGRESS GATEWAY
        ↓                           |    (Envoy Proxy)
Service Selection                   |           ↓
        ↓                           |    Gateway + VirtualService
ClusterIP Service                   |    (Advanced Routing)
        ↓                           |           ↓
   Pod (Direct)                     |    ClusterIP Service
   App Container                    |           ↓
   (1/1)                            |    Pod (Sidecar Injection)
        ↓                           |    ├─ Envoy Proxy
   No Encryption                    |    └─ App Container
   (Local Network)                  |    (2/2)
   Direct TCP/HTTP                  |           ↓
                                    |    Encrypted (mTLS)
                                    |    Sidecar Policies:
                                    |    ├─ Retry
                                    |    ├─ Timeout
                                    |    ├─ Circuit Break
                                    |    └─ Observability
```

### Pod Resource Comparison

```
WITHOUT ISTIO                      |    WITH ISTIO
────────────────────────────────────────────────────────

Pod Memory: ~128-256Mi             |    Pod Memory: ~256-512Mi
Pod CPU: ~100-200m                 |    Pod CPU: ~200-400m
Containers per Pod: 1              |    Containers per Pod: 2
  ├─ App Container                 |    ├─ Envoy Proxy (~50MB)
  └─ No overhead                   |    └─ App Container

Network Throughput                 |    Network Throughput
└─ Direct: Full capacity           |    └─ Via Sidecar: ~95-98%

Latency Impact                     |    Latency Impact
└─ Minimal: <1ms                   |    └─ Low: 1-3ms (sidecar)
```

---

## 🆚 Migration from Ingress-NGINX to Istio

If you're currently using ingress-nginx:

## 🏁 Quick Reference Commands

```bash
# Connect to cluster
az aks get-credentials --resource-group multi-container-rg --name <CLUSTER_NAME>

# View all resources
kubectl get all --all-namespaces

# View logs
kubectl logs -f <POD_NAME>
kubectl logs -f <POD_NAME> -c istio-proxy  # Istio sidecar logs

# Port forward for testing
kubectl port-forward svc/frontend 8080:80

# Check cluster health
az aks show \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --query 'powerState'

# Update cluster Kubernetes version
az aks upgrade \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --kubernetes-version 1.28.3

# Get cluster credentials again
az aks get-credentials \
  --resource-group multi-container-rg \
  --name multi-container-aks \
  --overwrite-existing
```

---

## 📚 Additional Resources

- [Azure AKS Documentation](https://docs.microsoft.com/en-us/azure/aks/)
- [Azure Service Mesh (Istio)](https://docs.microsoft.com/en-us/azure/aks/istio-about)
- [ACR Documentation](https://docs.microsoft.com/en-us/azure/container-registry/)
- [Azure Monitor for Containers](https://docs.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-overview)
- [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)

---

## 🔄 Complete Request/Response Lifecycle

### Example: GET http://api.local/todos

```
TIME    SOURCE              ACTION                          DESTINATION
────────────────────────────────────────────────────────────────────────

T=0ms   Browser             1. DNS Lookup: api.local
                               └─ Resolves to: 40.xx.xx.xx ✓

T=5ms   Browser             2. TCP Handshake
                               └─ SYN → ALB:80

T=8ms   ALB                 3. Accept connection
                               └─ SYN-ACK ← Browser

T=12ms  Browser             4. HTTP Request
                               GET /todos HTTP/1.1
                               Host: api.local
                               └─ →→→→→ ALB

T=15ms  ALB                 5. Route Request
                               ├─ Check Ingress rule
                               ├─ Match: host=api.local, path=/
                               └─ Forward to: todo-app service

T=18ms  INGRESS NGINX       6. Service Resolution
                               ├─ todo-app → ClusterIP:3000
                               ├─ Lookup service DNS
                               └─ Find backend pods: pod-1, pod-2

T=21ms  INGRESS NGINX       7. Pod Selection (RR)
                               └─ Selected: todo-app-pod-1

T=23ms  INGRESS NGINX       8. Pod Connection
                               └─ Connect to Pod IP:3000

T=28ms  Pod (App)           9. Receive Request
                               ├─ Parse HTTP request
                               └─ Extract path: /todos

T=32ms  Pod (App)           10. Query Database
                               ├─ Connect: mongodb://todo-db:27017
                               ├─ Query: db.todos.find({})
                               └─ Send to MongoDB

T=45ms  MongoDB             11. Execute Query
                               ├─ Search todos collection
                               └─ Return: [doc1, doc2, ...]

T=48ms  Pod (App)           12. Process Results
                               ├─ Deserialize BSON
                               ├─ Convert to JSON
                               └─ Create response body

T=52ms  Pod (App)           13. Send Response
                               HTTP/1.1 200 OK
                               Content-Type: application/json
                               [...todos array...]
                               └─ Send to INGRESS

T=55ms  INGRESS NGINX       14. Forward Response
                               └─ Send to ALB

T=58ms  ALB                 15. Send to Browser
                               └─ HTTP response → Browser

T=62ms  Browser             16. Receive & Render
                               ├─ Parse JSON response
                               ├─ Update DOM
                               └─ Display todos list ✓

TOTAL REQUEST TIME: ~62ms
  ├─ Network overhead: ~12ms (DNS, TCP, routing)
  ├─ App processing: ~20ms (request handling)
  ├─ Database query: ~15ms (query + response)
  ├─ Serialization: ~8ms (BSON to JSON)
  └─ Ingress overhead: ~7ms (routing, forwarding)
```

### Same Request with Istio (Path B)

```
TIME    SOURCE                  ACTION                      DESTINATION
──────────────────────────────────────────────────────────────────────

T=0ms   Browser                 1. DNS Lookup: api.local
                                   └─ Resolves to: 40.yy.yy.yy ✓

T=5ms   Browser                 2. TCP Handshake
                                   └─ → ISTIO INGRESS GATEWAY:80

T=8ms   ISTIO IG (Envoy)        3. Accept connection
                                   └─ SYN-ACK ← Browser

T=12ms  Browser                 2. HTTP Request
                                   GET /todos HTTP/1.1
                                   └─ →→→→→ ISTIO IG

T=15ms  ISTIO IG (Envoy)        4. Gateway Processing
                                   ├─ Match Gateway rule
                                   ├─ Match: host=api.local
                                   └─ Route: VirtualService

T=18ms  ISTIO IG (Envoy)        5. VirtualService Policy
                                   ├─ Check retry policy: attempts=3
                                   ├─ Check timeout: 10s
                                   ├─ Check circuit breaker
                                   └─ Select destination: todo-app

T=21ms  ISTIO IG (Envoy)        6. Service Resolution
                                   ├─ Load balance: pod-1 or pod-2
                                   └─ Selected: todo-app-pod-1

T=23ms  ISTIO IG (Envoy)        7. Initiate mTLS
                                   ├─ TLS handshake start
                                   └─ Encrypt connection

T=28ms  todo-app SIDECAR        8. Receive Encrypted
                                   ├─ mTLS established
                                   ├─ Decrypt request
                                   ├─ Check authorization (AUTHZ)
                                   └─ Forward to app container

T=32ms  Pod (App)               9. Receive Request
                                   ├─ Parse HTTP request
                                   └─ Extract path: /todos

T=35ms  Pod (App)               10. Query Database
                                   ├─ Connect: mongodb://todo-db:27017
                                   └─ Send query

T=48ms  MongoDB                 11. Execute Query
                                   └─ Return: [doc1, doc2, ...]

T=51ms  Pod (App)               12. Process Results
                                   └─ Convert to JSON

T=54ms  Pod (App)               13. Send Response
                                   └─ Response body ready

T=55ms  todo-app SIDECAR        14. Sidecar Egress
                                   ├─ Collect metrics
                                   ├─ Latency so far: 42ms
                                   ├─ Request count: +1
                                   └─ Forward to IG

T=58ms  ISTIO IG (Envoy)        15. Forward Response
                                   ├─ Collect metrics
                                   └─ Send to browser

T=62ms  Browser                 16. Receive & Render
                                   └─ Display todos list ✓

TOTAL REQUEST TIME: ~62-65ms
  ├─ Network overhead: ~12ms
  ├─ mTLS encryption: ~5-8ms (extra)
  ├─ Sidecar processing: ~3-5ms (extra)
  ├─ App processing: ~20ms
  ├─ Database query: ~15ms
  └─ Serialization: ~8ms

OVERHEAD FROM ISTIO: ~5-10ms (~8-15% additional latency)
BENEFITS: Enhanced observability, security, policy enforcement
```

---

🎊 **Your multi-container application is now running on Azure AKS!**

Choose the deployment path that matches your requirements:
- **Path A (Without Istio)**: Simpler, cheaper, good for basic apps
- **Path B (With Istio)**: Advanced features, better for production microservices
