const express = require('express');
const http = require('http');
const Todo = require('./../models/Todo');

const router = express.Router();

// Get all todos
router.get('/api/todos', async (req, res) => {
    try {
        const todos = await Todo.find();
        res.json(todos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single todo
router.get('/api/todos/:id', async (req, res) => {
    try {
        const todo = await Todo.findById(req.params.id);
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        res.json(todo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new todo
router.post('/api/todos', (req, res) => {
    const newTask = new Todo({
        task: req.body.task
    });

    newTask.save()
        .then(task => res.status(201).json(task))
        .catch(err => res.status(500).json({ error: err.message }));
});

// Update todo
router.put('/api/todos/:id', async (req, res) => {
    try {
        const todo = await Todo.findByIdAndUpdate(
            req.params.id,
            { task: req.body.task },
            { new: true }
        );
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        res.json(todo);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete todo
router.delete('/api/todos/:id', async (req, res) => {
    try {
        const todo = await Todo.findByIdAndRemove(req.params.id);
        if (!todo) return res.status(404).json({ error: 'Todo not found' });
        res.json({ message: 'Todo deleted', todo });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health status route - fetches from internal health-monitor service
router.get('/api/health', async (req, res) => {
    try {
        const data = await fetchHealthStatus();
        res.json(data);
    } catch (error) {
        res.status(503).json({
            status: 'UNHEALTHY',
            error: error.message
        });
    }
});

// Helper function to fetch health status from health-monitor service
function fetchHealthStatus() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'health-monitor',
            port: 3001,
            path: '/api/health',
            method: 'GET'
        };

        const request = http.request(options, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        request.on('error', error => reject(error));
        request.end();
    });
}

module.exports = router;
