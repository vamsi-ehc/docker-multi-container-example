# Multi-Container Todo & Calculator App

A complete multi-tier application demonstrating microservices architecture with React frontend, Node.js backend, Python calculator API, and MongoDB database.

## Quick Start

```bash
docker compose up --build
```

Access the application at **http://localhost:3002**

## Services

### Frontend (React) - Port 3002
- User interface for Todo management and Calculator
- Real-time todo list management
- Calculator with mathematical expression evaluation

### Backend (Node.js/Express) - Port 3000
- RESTful API for Todo operations
- Proxy for calculator requests to Flask API
- Health monitoring endpoints

### Calculator API (Python/Flask) - Internal Service
- Mathematical expression evaluation
- Security measures against code injection
- Accessible via Node.js backend proxy

### MongoDB Database
- Stores todo items
- Port 27017 exposed for development

### Health Monitor
- Internal service for system health checks
- MongoDB and Node.js status monitoring

## API Endpoints

### Todo API
```
GET    /api/todos              - Get all todos
POST   /api/todos              - Create new todo
DELETE /api/todos/:id          - Delete todo
```

### Calculator API (Via Proxy)
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
React Frontend (3002)
        │
        └── Node.js API (3000)
                ├── MongoDB
                ├── Calculator API (Flask - Internal)
                └── Health Monitor (Internal)
```

## Technologies

- **Frontend**: React 18, Axios, CSS3
- **Backend**: Node.js 19, Express, Mongoose
- **Calculator**: Python 3.11, Flask
- **Database**: MongoDB 6
- **Orchestration**: Docker Compose