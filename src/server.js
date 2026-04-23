const express = require('express');
const path = require('path');
const multer = require('multer');
const dotenv = require('dotenv');

const stateManager = require('./stateManager');
const deploymentRouter = require('./routes/deployment');
const statusRouter = require('./routes/status');
const { startSchedulers } = require('./services/scheduler');
const balenaTokenManager = require('./services/balenaTokenManager');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize state file
stateManager.initializeStateFile();

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/deployment', deploymentRouter);
app.use('/api/status', statusRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Serve main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// Start server with proper initialization
(async () => {
  try {
    // Initialize Balena token manager before starting server
    await balenaTokenManager.loadToken();
    console.log(`[Server] Balena token loaded from: ${balenaTokenManager.getSourceInfo()}`);
  } catch (error) {
    console.warn(`[Server] Failed to load Balena token on startup: ${error.message}`);
  }

  const server = app.listen(PORT, () => {
    console.log(`LLM Deployment server listening on port ${PORT}`);
    console.log(`State file: ${stateManager.STATE_FILE_PATH}`);
    console.log(`[Server] Ready to accept requests`);
  });

  // Start background schedulers (log analysis, data validation)
  startSchedulers();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close();
  });
})().catch(err => {
  console.error('[Server] Fatal error during initialization:', err);
  process.exit(1);
});

module.exports = app;
