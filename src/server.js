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

// Auto-set environment variables on startup if EQUINOX_MODE not set
async function autoConfigureEnvironment() {
  try {
    // Only auto-configure if running on Balena and EQUINOX_MODE not already set
    if (!process.env.EQUINOX_MODE && process.env.BALENA_DEVICE_UUID) {
      console.log('[Server] EQUINOX_MODE not set. Attempting to auto-configure from Wattmore...');
      
      const balenaToken = balenaTokenManager.getToken();
      if (!balenaToken) {
        console.log('[Server] Balena token not available, skipping auto-configuration');
        return;
      }
      
      const fleetName = process.env.BALENA_APP_NAME;
      const deviceUuid = process.env.BALENA_DEVICE_UUID;
      
      if (!fleetName || !deviceUuid) {
        console.log('[Server] Fleet name or device UUID missing, skipping auto-configuration');
        return;
      }
      
      // Import required modules
      const BalenaApiHelper = require('./services/balenaApiHelper');
      const hardwareConfigLoader = require('./services/hardwareConfigLoader');
      const wattmoreClient = require('./services/wattmoreClient');
      const configGenerator = require('./services/configGenerator');
      
      try {
        console.log(`[Server] Fetching project data for fleet: ${fleetName}`);
        await hardwareConfigLoader.load();
        const projectData = await wattmoreClient.getProjectByName(fleetName);
        const deploymentConfig = await configGenerator.generateConfig(projectData);
        
        console.log(`[Server] Setting ${Object.keys(deploymentConfig.environmentVariables).length} environment variables...`);
        const balenaHelper = new BalenaApiHelper(balenaToken);
        const result = await balenaHelper.setDeviceEnvVars(deviceUuid, deploymentConfig.environmentVariables);
        
        console.log(`[Server] ✓ Auto-configured ${result.length} environment variables on device`);
      } catch (err) {
        console.warn(`[Server] Auto-configuration failed (non-fatal): ${err.message}`);
        console.log('[Server] You can manually set environment variables via:');
        console.log(`        node src/utils/balena-env-setter.js set-monitor ${deviceUuid}`);
      }
    }
  } catch (error) {
    console.warn(`[Server] Error during auto-configuration: ${error.message}`);
  }
}

// Start server with proper initialization
(async () => {
  try {
    // Initialize Balena token manager before starting server
    await balenaTokenManager.loadToken();
    console.log(`[Server] Balena token loaded from: ${balenaTokenManager.getSourceInfo()}`);
    
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
