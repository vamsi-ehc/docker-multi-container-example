const express = require('express');
const http = require('http');

const router = express.Router();

// Proxy calculator requests to Flask API
router.post('/api/calculate', async (req, res) => {
    try {
        const data = await proxyCalculate(req.body.expression);
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json({
            error: error.message
        });
    }
});

function proxyCalculate(expression) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ expression });
        
        const options = {
            hostname: 'calculator-api',
            port: 5000,
            path: '/api/calculate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const request = http.request(options, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (response.statusCode >= 400) {
                        const error = new Error(parsed.error || 'Calculator error');
                        error.status = response.statusCode;
                        reject(error);
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error('Invalid response from calculator'));
                }
            });
        });

        request.on('error', error => reject(error));
        request.write(payload);
        request.end();
    });
}

module.exports = router;
