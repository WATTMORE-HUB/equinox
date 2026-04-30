const express = require('express');
const path = require('path');
const multer = require('multer');
const dotenv = require('dotenv');

const stateManager = require('./stateManager');
const deploymentRouter = require('./routes/deployment');
const statusRouter = require('./routes/status');
const chatRouter = require('./routes/chat');
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
app.use('/api/chat', chatRouter);

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

// Auto-configuration disabled - environment variables should only be set when user clicks Confirm
// This ensures variables are set for the correct project, not just whatever fleet the device is in
async function autoConfigureEnvironment() {
  // Placeholder - actual configuration happens via /api/deployment/deploy endpoint
  // when user clicks the Confirm button on the dashboard
  console.log('[Server] Environment auto-configuration is disabled. Variables will be set when user clicks Confirm.');
}

// Start server with proper initialization
(async () => {
  try {
    // Initialize Balena token manager before starting server
    console.log('[Server] Attempting to load Balena token...');
    await balenaTokenManager.loadToken();
    const sourceInfo = balenaTokenManager.getSourceInfo();
    const isLoaded = balenaTokenManager.isLoaded();
    console.log(`[Server] Balena token loaded: ${isLoaded}, from: ${sourceInfo}`);
    
    if (!isLoaded) {
      console.warn('[Server] WARNING: Balena token is not loaded. Environment variables upload will fail.');
      console.warn('[Server] Make sure BALENA_API_TOKEN env var, S3 bucket, or /etc/equinox/balena-token.json is configured.');
    }
    
    // Auto-configure environment on startup if needed
    await autoConfigureEnvironment();
  } catch (error) {
    console.error(`[Server] Error during startup: ${error.message}`);
    console.error('[Server] Stack:', error.stack);
  }

  const server = app.listen(PORT, () => {
    const mode = process.env.EQUINOX_MODE || 'config';
    console.log(`LLM Deployment server listening on port ${PORT}`);
    console.log(`State file: ${stateManager.STATE_FILE_PATH}`);
    console.log(`[Server] EQUINOX_MODE: ${mode}`);
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
