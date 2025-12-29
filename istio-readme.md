# 🕸️ Istio Service Mesh Setup Guide

## 📖 What is Istio?

**Istio** is a service mesh that provides:
- **Traffic Management**: Advanced routing, load balancing, retries, failovers
- **Security**: Automatic mTLS encryption between services
- **Observability**: Metrics, logs, distributed tracing
- **Policy Enforcement**: Rate limiting, access control

### Why Use Istio Over Ingress-NGINX?

| Feature | Ingress-NGINX | Istio |
|---------|---------------|-------|
| Traffic Routing | Basic HTTP routing | Advanced (retry, timeout, circuit breaker) |
| Security | TLS termination | Automatic mTLS between all services |
| Observability | Basic logs | Full tracing, metrics, service graph |
| Canary Deployments | Limited | Built-in traffic splitting |
| Service-to-Service | Not managed | Fully managed with policies |

---

## 📋 Prerequisites

- Docker Desktop with **Kubernetes Enabled**
- `kubectl` installed and configured
- At least **8GB RAM** allocated to Docker Desktop
- **Helm 3** (optional but recommended)

Verify cluster:
```bash
kubectl cluster-info
kubectl config use-context docker-desktop
```

---

## 🚀 Step 1: Install Istio

### Option A: Using Istioctl (Recommended)

Download Istio:
```bash
# Download latest Istio
curl -L https://istio.io/downloadIstio | sh -

# Or for Windows PowerShell:
# Download from https://github.com/istio/istio/releases
# Extract and add to PATH
```

Add to PATH (PowerShell):
```powershell
$env:PATH = "D:\istio-1.20.0\bin;$env:PATH"
```

Install Istio with demo profile:
```bash
istioctl install --set profile=demo -y
```

### Option B: Using Helm

```bash
helm repo add istio https://istio-release.storage.googleapis.com/charts
helm repo update

# Install Istio base
helm install istio-base istio/base -n istio-system --create-namespace

# Install Istiod (control plane)
helm install istiod istio/istiod -n istio-system --wait

# Install Istio Ingress Gateway
helm install istio-ingressgateway istio/gateway -n istio-system --wait
```

Verify installation:
```bash
kubectl get pods -n istio-system
```

You should see:
- `istiod-*` (control plane)
- `istio-ingressgateway-*` (gateway)
- `istio-egressgateway-*` (optional)

---

## 🏷️ Step 2: Enable Automatic Sidecar Injection

Label your namespace to automatically inject Envoy sidecar proxies:

```bash
kubectl label namespace default istio-injection=enabled
```

Verify:
```bash
kubectl get namespace -L istio-injection
```

---

## 🏗️ Step 3: Build Docker Images

Build all images (if not done already):

```bash
docker build -t frontend:latest ./frontend
docker build -t todo-app:latest ./app
docker build -t calculator-api:latest ./calculator-api
docker build -t health-monitor:latest ./health-monitor
```

---

## 🗄️ Step 4: Deploy MongoDB

Create `k8s/istio-mongo.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: todo-database
  labels:
    app: mongo
spec:
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
        version: v1
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
        volumeMounts:
        - name: mongo-storage
          mountPath: /data/db
      volumes:
      - name: mongo-storage
        emptyDir: {}
```

Deploy:
```bash
kubectl apply -f k8s/istio-mongo.yaml
```

---

## 🎯 Step 5: Deploy Application Services

Create `k8s/istio-services.yaml`:

```yaml
# Frontend Service
apiVersion: v1
kind: Service
metadata:
  name: frontend
  labels:
    app: frontend
spec:
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
        image: frontend:latest
        imagePullPolicy: Never
        ports:
        - containerPort: 80
---
# Todo App Service
apiVersion: v1
kind: Service
metadata:
  name: todo-app
  labels:
    app: todo-app
spec:
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
        image: todo-app:latest
        imagePullPolicy: Never
        ports:
        - containerPort: 3000
        env:
        - name: MONGO_URI
          value: "mongodb://admin:password@todo-database:27017/todos?authSource=admin"
---
# Calculator API Service
apiVersion: v1
kind: Service
metadata:
  name: calculator-api
  labels:
    app: calculator-api
spec:
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
        image: calculator-api:latest
        imagePullPolicy: Never
        ports:
        - containerPort: 5000
---
# Health Monitor Service
apiVersion: v1
kind: Service
metadata:
  name: health-monitor
  labels:
    app: health-monitor
spec:
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
        image: health-monitor:latest
        imagePullPolicy: Never
        ports:
        - containerPort: 4000
```

Deploy:
```bash
kubectl apply -f k8s/istio-services.yaml
```

Verify (each pod should have 2/2 containers - app + sidecar):
```bash
kubectl get pods
```

---

## 🌐 Step 6: Configure Istio Gateway & VirtualServices

Create `k8s/istio-gateway.yaml`:

```yaml
# Istio Gateway (replaces Ingress)
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
    - "frontend.local"
    - "api.local"
    - "health.local"
---
# Frontend VirtualService
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: frontend
spec:
  hosts:
  - "frontend.local"
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
  - "api.local"
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
  - "health.local"
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
kubectl apply -f k8s/istio-gateway.yaml
```

---

## 🛡️ Step 7: Enable mTLS (Optional but Recommended)

Create `k8s/istio-mtls.yaml`:

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
kubectl apply -f k8s/istio-mtls.yaml
```

This enforces encrypted communication between all services.

---

## 🖥️ Step 8: Update Hosts File

Get Istio Ingress Gateway external IP:
```bash
kubectl get svc istio-ingressgateway -n istio-system
```

For Docker Desktop, it will be `localhost`. Edit hosts file as Administrator:

**Windows:** `C:\Windows\System32\drivers\etc\hosts`

Add:
```
127.0.0.1 frontend.local
127.0.0.1 api.local
127.0.0.1 health.local
```

---

## 🎉 Step 9: Test Your Application

| URL | Purpose |
|-----|---------|
| http://frontend.local | React Frontend |
| http://api.local/todos | Todo API |
| http://api.local/calc | Calculator API |
| http://health.local | Health Monitor |

Test in browser or with curl:
```bash
curl http://frontend.local
curl http://api.local/todos
curl http://health.local
```

---

## 📊 Step 10: Install Observability Tools (Optional)

### Kiali (Service Mesh Dashboard)
```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/kiali.yaml
```

Access:
```bash
istioctl dashboard kiali
```

### Prometheus (Metrics)
```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/prometheus.yaml
```

### Grafana (Visualization)
```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/grafana.yaml
```

Access:
```bash
istioctl dashboard grafana
```

### Jaeger (Distributed Tracing)
```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/jaeger.yaml
```

Access:
```bash
istioctl dashboard jaeger
```

---

## 🔄 Updating a Single Service with Istio

Example: Update todo-app

### Step 1: Make Code Changes
Edit files in `./app` directory

### Step 2: Rebuild Image
```bash
docker build -t todo-app:latest ./app
```

### Step 3: Restart Deployment
```bash
kubectl rollout restart deployment todo-app
```

### Step 4: Verify
```bash
kubectl rollout status deployment todo-app
kubectl get pods
```

Each pod should show `2/2` (app + Istio sidecar).

---

## 🎯 Advanced Traffic Management Examples

### Canary Deployment (Blue-Green)

Split traffic 90% to v1, 10% to v2:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: todo-app
spec:
  hosts:
  - todo-app
  http:
  - route:
    - destination:
        host: todo-app
        subset: v1
      weight: 90
    - destination:
        host: todo-app
        subset: v2
      weight: 10
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: todo-app
spec:
  host: todo-app
  subsets:
  - name: v1
    labels:
      version: v1
  - name: v2
    labels:
      version: v2
```

### Retry Policy

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: calculator-api
spec:
  hosts:
  - calculator-api
  http:
  - route:
    - destination:
        host: calculator-api
    retries:
      attempts: 3
      perTryTimeout: 2s
```

### Circuit Breaker

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: calculator-api
spec:
  host: calculator-api
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 50
        maxRequestsPerConnection: 2
    outlierDetection:
      consecutiveErrors: 5
      interval: 30s
      baseEjectionTime: 30s
```

---

## 🧹 Cleanup / Uninstall

Remove all deployments:
```bash
kubectl delete -f k8s/istio-gateway.yaml
kubectl delete -f k8s/istio-services.yaml
kubectl delete -f k8s/istio-mongo.yaml
kubectl delete -f k8s/istio-mtls.yaml
```

Uninstall Istio:
```bash
istioctl uninstall --purge -y
kubectl delete namespace istio-system
```

Remove namespace label:
```bash
kubectl label namespace default istio-injection-
```

---

## 🆚 Migration from Ingress-NGINX to Istio

If you're currently using ingress-nginx:

1. **Keep both running** initially for testing
2. **Delete old ingress**:
   ```bash
   kubectl delete ingress app-ingress
   ```
3. **Deploy Istio Gateway** as shown above
4. **Test everything works**
5. **Remove ingress-nginx**:
   ```bash
   kubectl delete namespace ingress-nginx
   ```

---

## 🏁 Complete Workflow Summary

| Step | Action |
|------|--------|
| 1 | Install Istio (istioctl or Helm) |
| 2 | Enable sidecar injection on namespace |
| 3 | Build Docker images |
| 4 | Deploy MongoDB |
| 5 | Deploy application services |
| 6 | Configure Gateway & VirtualServices |
| 7 | Enable mTLS (optional) |
| 8 | Update hosts file |
| 9 | Test in browser |
| 10 | Install observability tools (optional) |

---

## 📌 Useful Commands

```bash
# Check Istio status
istioctl version
istioctl proxy-status

# Analyze configuration issues
istioctl analyze

# View proxy logs
kubectl logs <pod-name> -c istio-proxy

# Get Istio metrics
kubectl top pods

# View service mesh configuration
kubectl get gateway,virtualservice,destinationrule

# Access dashboards
istioctl dashboard kiali
istioctl dashboard grafana
istioctl dashboard jaeger
```

---

## 🐛 Troubleshooting

### Pods stuck in Init or have 1/2 containers

Check if sidecar injection is enabled:
```bash
kubectl get namespace -L istio-injection
```

Enable if missing:
```bash
kubectl label namespace default istio-injection=enabled
kubectl rollout restart deployment --all
```

### Gateway not routing traffic

Check gateway and virtual services:
```bash
kubectl get gateway
kubectl get virtualservice
istioctl analyze
```

### Cannot access via browser

1. Verify hosts file has entries
2. Check ingress gateway is running:
   ```bash
   kubectl get pods -n istio-system
   ```
3. Check gateway configuration:
   ```bash
   kubectl describe gateway app-gateway
   ```

### mTLS issues

Check peer authentication:
```bash
kubectl get peerauthentication
```

Temporarily disable to test:
```bash
kubectl delete peerauthentication default
```

---

## 📚 Additional Resources

- [Istio Documentation](https://istio.io/latest/docs/)
- [Istio Traffic Management](https://istio.io/latest/docs/concepts/traffic-management/)
- [Istio Security](https://istio.io/latest/docs/concepts/security/)
- [Kiali Documentation](https://kiali.io/docs/)

---

🎊 **You now have a production-ready service mesh with Istio!**
