const mongoose = require('mongoose');
const express = require('express');

const router = express.Router();
const mongoURI = require('../config/keys').mongoURI;

// Check MongoDB health
router.get('/api/health/mongodb', async (req, res) => {
    try {
        const admin = mongoose.connection.getClient().db('admin');
        const status = await admin.command({ ping: 1 });
        
        res.json({
            service: 'MongoDB',
            status: 'UP',
            timestamp: new Date().toISOString(),
            response: status
        });
    } catch (error) {
        res.status(503).json({
            service: 'MongoDB',
            status: 'DOWN',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Check Node.js health
router.get('/api/health/node', (req, res) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    res.json({
        service: 'Node.js',
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: {
            seconds: uptime,
            formatted: formatUptime(uptime)
        },
        memory: {
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
            external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
        }
    });
});

// Combined health check
router.get('/api/health', async (req, res) => {
    const nodeHealth = {
        service: 'Node.js',
        status: 'UP',
        uptime: process.uptime()
    };

    try {
        const admin = mongoose.connection.getClient().db('admin');
        const mongoStatus = await admin.command({ ping: 1 });
        
        const mongoHealth = {
            service: 'MongoDB',
            status: 'UP'
        };

        res.json({
            status: 'HEALTHY',
            timestamp: new Date().toISOString(),
            services: [nodeHealth, mongoHealth]
        });
    } catch (error) {
        res.status(503).json({
            status: 'UNHEALTHY',
            timestamp: new Date().toISOString(),
            services: [
                nodeHealth,
                {
                    service: 'MongoDB',
                    status: 'DOWN',
                    error: error.message
                }
            ]
        });
    }
});

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

module.exports = router;
