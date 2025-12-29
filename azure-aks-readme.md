# ☁️ Azure AKS Deployment Guide

Complete guide to deploy your multi-container application on **Azure Kubernetes Service (AKS)** with and without Istio service mesh.

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

## 📁 Step 6A: Create Kubernetes Manifests (Without Istio)

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

## 🏷️ Step 7B: Enable Sidecar Injection

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

---

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

🎊 **Your multi-container application is now running on Azure AKS!**

Choose the deployment path that matches your requirements:
- **Path A (Without Istio)**: Simpler, cheaper, good for basic apps
- **Path B (With Istio)**: Advanced features, better for production microservices
