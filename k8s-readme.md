Great question. Yes — **you must first deploy your app services (pods + services) before applying ingress.**
Ingress only routes to services; if the services don’t exist, ingress fails.

Below is a **clean step-by-step guide to initialize and run your project with ingress on Docker Desktop Kubernetes**.

---

# 🧱 **Kubernetes + Ingress Full Setup (Docker Desktop)**

### 📌 **Prerequisites**

* Docker Desktop with **Kubernetes Enabled**
* `kubectl` configured and working

Test:

```bash
kubectl cluster-info
```

---

## ✅ **Step 1: Create Folder Structure**

```
multi-container-app/
│
├─ frontend/
├─ app/
├─ calculator-api/
├─ health-monitor/
├─ k8s/
│   ├─ frontend.yaml
│   ├─ todo-app.yaml
│   ├─ calculator-api.yaml
│   ├─ health-monitor.yaml
│   ├─ mongo.yaml
│   ├─ ingress.yaml
```

(You already have these)

---

## 👷‍♂️ **Step 2: Build Local Docker Images**

In project root (`multi-container-app`):

```bash
docker build -t frontend:latest ./frontend
docker build -t todo-app:latest ./app
docker build -t calculator-api:latest ./calculator-api
docker build -t health-monitor:latest ./health-monitor
```

> ⚠ Make sure your Kubernetes is using Docker Desktop (not Docker Hub).
> Check:

```bash
kubectl config use-context docker-desktop
```

---

## 🧠 **Step 3: Deploy Services + Database (No Ingress Yet!)**

Now deploy backend services and Mongo first:

```bash
kubectl apply -f k8s/mongo.yaml
kubectl apply -f k8s/calculator-api.yaml
kubectl apply -f k8s/health-monitor.yaml
kubectl apply -f k8s/todo-app.yaml
kubectl apply -f k8s/frontend.yaml
```

Verify everything is running:

```bash
kubectl get pods
kubectl get svc
```

You should see services such as:

* `frontend`
* `todo-app`
* `calculator-api`
* `health-monitor`
* `todo-database`

---

## 🌐 **Step 4: Install Ingress Controller (Docker Desktop)**

Run:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml --validate=false
```

If you previously tried and had webhook issues, clear them:

```bash
kubectl delete -A ValidatingWebhookConfiguration ingress-nginx-admission
```

Restart controller (optional but safe):

```bash
kubectl delete pod -n ingress-nginx -l app.kubernetes.io/component=controller
```

Wait for it:

```bash
kubectl get pods -n ingress-nginx -w
```

You need **1/1 running**.

---

## 🚪 **Step 5: Apply Ingress**

```bash
kubectl apply -f k8s/ingress.yaml --validate=false
```

Verify:

```bash
kubectl get ingress
```

Expected output should list `frontend.local`, `api.local`, `health.local`.

---

## 🖥 **Step 6: Add Hosts File Entries**

Edit (as Administrator):

```
C:\Windows\System32\drivers\etc\hosts
```

Add:

```
127.0.0.1 frontend.local
127.0.0.1 api.local
127.0.0.1 health.local
```

Save & close.

---

## 🎉 **Step 7: Test in Browser**

| URL                                              | Purpose        |
| ------------------------------------------------ | -------------- |
| [http://frontend.local](http://frontend.local)   | React UI       |
| [http://api.local/todos](http://api.local/todos) | Todo API       |
| [http://api.local/calc](http://api.local/calc)   | Calculator     |
| [http://health.local](http://health.local)       | Health Monitor |

---

# 🏁 Summary Workflow

| Order | Action                                    |
| ----- | ----------------------------------------- |
| 1     | Build Docker images                       |
| 2     | Deploy Mongo + APIs + Frontend            |
| 3     | Install Ingress-NGINX                     |
| 4     | Delete admission webhook (only if needed) |
| 5     | Apply Ingress                             |
| 6     | Add hosts entries                         |
| 7     | Test URLs                                 |

---

## ❓ Want Extras?

Which enhancement do you want next?

👉 **Choose one:**

```
1) Add HTTPS (Self-Signed TLS)
2) Persistent Mongo Storage
3) Auto-Reload for Dev inside Kubernetes
4) Helm Chart Packaging (Production Ready)
```

Reply with the option number. 😊
