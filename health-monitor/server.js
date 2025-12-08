const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();

// Health Routes
const HealthRouter = require('./routes/health');

// Set ejs template engine
app.set('view engine', 'ejs');

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));

// Serve static files
app.use(express.static('public'));

// Database connection
const db = require('./config/keys').mongoURI;
mongoose
    .connect(db, { useNewUrlParser: true })
    .then(() => console.log(`MongoDB Connected`))
    .catch(error => console.log(`MongoDB Connection Error: ${error}`));

// Dashboard view
app.get('/', (req, res) => {
    res.render('dashboard');
});

// API routes
app.use(HealthRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Health Monitor listening on port ${PORT}`);
});
