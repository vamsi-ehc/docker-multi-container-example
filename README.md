
# Multi-Container Todo & Calculator App

This project demonstrates a microservices architecture using Docker Compose and Kubernetes. It features a React frontend, Node.js backend for todos, a Python Flask calculator API, a health monitor service, and a MongoDB database.


## Quick Start (Docker Compose)

```bash
docker compose up --build
```

Access the frontend at **http://localhost:3002**


## Services Overview

- **Frontend (React, port 3002):**
  - User interface for todo management and calculator
  - Communicates with the Node.js API

- **Todo API (Node.js/Express, port 3000):**
  - RESTful API for todos
  - Proxies calculator requests to Flask API
  - Exposes health endpoints

- **Calculator API (Python/Flask, port 5000, internal):**
  - Evaluates mathematical expressions
  - Accessed via Node.js API proxy

- **Health Monitor (Node.js, port 3001, internal):**
  - Monitors MongoDB and Node.js health

- **MongoDB (port 27017):**
  - Stores todo items


## API Endpoints

### Todo API
```
GET    /api/todos              - Get all todos
POST   /api/todos              - Create new todo
DELETE /api/todos/:id          - Delete todo
```

### Calculator API (via Node.js proxy)
```
POST   /api/calculate          - Calculate expression
  Request:  {"expression": "2+2*3"}
  Response: {"expression": "2+2*3", "result": 8}
```

### Health Check
```
GET    /api/health             - System health status
```


## Architecture

```
User
 │
 │  http://localhost:3002
 ▼
Frontend (React)
 │
 │ REST API calls
 ▼
Todo API (Node.js, 3000)
 ├── MongoDB (27017)
 ├── Calculator API (Flask, 5000, internal)
 └── Health Monitor (Node.js, 3001, internal)
```

---

## Kubernetes Deployment

Kubernetes manifests are in the `k8s/` directory:

- `frontend.yaml` — React frontend Deployment & Service
- `todo-app.yaml` — Node.js API Deployment & Service
- `calculator-api.yaml` — Python Flask API Deployment & Service
- `health-monitor.yaml` — Health monitor Deployment & Service
- `mongo.yaml` — MongoDB Deployment & Service
- `ingress.yaml` — Ingress for routing external traffic

### Deploy all services:

```bash
kubectl apply -f k8s/
```

### Accessing the app (Kubernetes):
- Frontend: http://frontend.local (via Ingress)
- Todo API: http://api.local/todos
- Calculator API: http://api.local/calc
- Health: http://health.local/


## Technologies

- **Frontend**: React 18, Axios, CSS3
- **Backend**: Node.js 19, Express, Mongoose
- **Calculator**: Python 3.11, Flask
- **Database**: MongoDB 6
- **Orchestration**: Docker Compose, Kubernetes