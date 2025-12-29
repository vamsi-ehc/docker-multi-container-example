const mongoose = require('mongoose');
const bodyParse = require('body-parser');
const app = require('express')();
const moment = require('moment');
//log requests
const morgan = require('morgan');
app.use(morgan('dev'));

// Live Reload configuration (only in development)
if (process.env.NODE_ENV !== 'production') {
    try {
        const livereload = require('livereload');
        const connectLiveReload = require('connect-livereload');
        const liveReloadServer = livereload.createServer();
        liveReloadServer.server.once("connection", () => {
            setTimeout(() => {
                liveReloadServer.refresh("/");
            }, 100);
        });
        app.use(connectLiveReload());
    } catch (e) {
        console.log('Live reload not available');
    }
}

// Backend API route
const APIRouter = require('./routes/front');
const CalculatorRouter = require('./routes/calculator');

// Middleware - must be before routes
app.use(bodyParse.json());
app.use(bodyParse.urlencoded({ extended: false }));
app.locals.moment = moment;

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Database connection
const db = require('./config/keys').mongoProdURI;
mongoose
    .connect(db, { useNewUrlParser: true })
    .then(() => console.log(`Mongodb Connected`))
    .catch(error => console.log(error));

// API routes
app.use(APIRouter);
app.use(CalculatorRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'UP', service: 'Todo API' });
});

// 404 handler
app.use((req, res) => {
    // Handle 404 errors with printing the requested path
    res.status(404).json({ 
        error: 'Not found', 
        method: req.method,
        endpoint: req.originalUrl 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Todo API Server listening on port ${PORT}`);
});