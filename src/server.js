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

// Get current Equinox mode
app.get('/api/status/mode', (req, res) => {
  res.json({
    mode: EQUINOX_MODE,
    isMonitor: EQUINOX_MODE === 'monitor'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// Check if device is in monitor mode (already configured)
// EQUINOX_MODE is set by Balena device environment when configured
const EQUINOX_MODE = process.env.EQUINOX_MODE || 'config';
console.log(`[Server] EQUINOX_MODE=${EQUINOX_MODE}`);

// Log all environment variables for debugging mode detection
if (process.env.EQUINOX_MODE) {
  console.log(`[Server] EQUINOX_MODE explicitly set to: ${process.env.EQUINOX_MODE}`);
} else {
  console.log('[Server] EQUINOX_MODE not set, defaulting to config mode');
}

// Auto-configuration disabled - environment variables should only be set when user clicks Confirm
// This ensures variables are set for the correct project, not just whatever fleet the device is in
async function autoConfigureEnvironment() {
  // Placeholder - actual configuration happens via /api/deployment/deploy endpoint
  // when user clicks the Confirm button on the dashboard
  if (EQUINOX_MODE === 'monitor') {
    console.log('[Server] Device is in monitor mode. Chat/monitoring features active.');
  } else {
    console.log('[Server] Device is in config mode. Configuration dashboard active.');
  }
}

// Start server with proper initialization
(async () => {
  try {
    // Initialize Balena token manager before starting server
    await balenaTokenManager.loadToken();
    const sourceInfo = balenaTokenManager.getSourceInfo();
    const isLoaded = balenaTokenManager.isLoaded();
    console.log(`[Server] Balena token loaded: ${isLoaded}, from: ${sourceInfo}`);
    
    if (isLoaded) {
      // In Configure mode, automatically persist the token for Monitor mode to use
      const mode = process.env.EQUINOX_MODE || 'config';
      if (mode === 'config') {
        console.log('[Server] Running in Configure mode - attempting to persist token to /collect_data for Monitor mode...');
        const persistSuccess = balenaTokenManager.constructor.createSecureConfigFile(
          balenaTokenManager.getToken()
        );
        if (persistSuccess) {
          console.log('[Server] [OK] Token persisted to secure storage for Monitor mode');
        } else {
          console.warn('[Server] Warning: Could not persist token, but it will still work in Configure mode');
        }
      }
    }
    
    // Auto-configure environment on startup if needed
    await autoConfigureEnvironment();
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
