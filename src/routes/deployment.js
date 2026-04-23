const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const stateManager = require('../stateManager');
const { deployServices } = require('../services/deployer');
const hardwareConfigLoader = require('../services/hardwareConfigLoader');
const wattmoreClient = require('../services/wattmoreClient');
const configGenerator = require('../services/configGenerator');
const balenaTokenManager = require('../services/balenaTokenManager');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/deployment/lookup
// Body: { projectName }
router.post('/lookup', async (req, res) => {
  try {
    const { projectName } = req.body;

    if (!projectName) {
      return res.status(400).json({ error: 'projectName is required' });
    }

    await hardwareConfigLoader.load();
    const projectData = await wattmoreClient.getProjectByName(projectName);
    const deploymentConfig = await configGenerator.generateConfig(projectData);

    res.json({
      success: true,
      project: {
        name: projectData.name,
        fleetName: projectData.fleetName,
        systemType: projectData.systemType,
      },
      hardwareDetected: projectData.hardware,
      deployment: deploymentConfig,
    });
  } catch (err) {
    console.error('Lookup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deployment/deploy
// Body: { deviceId, fleetName, csvFile }
// Uses server-side Balena token from balenaTokenManager for security
router.post('/deploy', upload.single('csvFile'), async (req, res) => {
  try {
    console.log('[DEPLOYMENT ROUTE] req.body:', JSON.stringify(req.body, null, 2));
    console.log('[DEPLOYMENT ROUTE] Extracted fleetName:', req.body.fleetName);
    
    const { deviceId, fleetName } = req.body;
    const csvFile = req.file;

    console.log('[DEPLOYMENT ROUTE] After destructuring - fleetName:', fleetName);

    if (!deviceId || !fleetName) {
      return res.status(400).json({ error: 'deviceId and fleetName are required' });
    }

    // Get Balena token from secure server-side storage
    const balenaToken = balenaTokenManager.getToken();
    if (!balenaToken) {
      console.error('[DEPLOYMENT ROUTE] Balena token not available');
      return res.status(503).json({ error: 'Balena token not configured on server. Set BALENA_API_TOKEN environment variable.' });
    }

    if (!csvFile) {
      console.error('[DEPLOYMENT ROUTE] No CSV file provided');
      return res.status(400).json({ error: 'CSV file is required' });
    }

    // Parse CSV
    const services = [];
    await new Promise((resolve, reject) => {
      Readable.from([csvFile.buffer.toString()])
        .pipe(csv())
        .on('data', (row) => {
          services.push(row);
        })
        .on('error', reject)
        .on('end', resolve);
    });

    if (services.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    // Call deployer service
    const result = await deployServices({
      balenaToken,
      deviceId,
      fleetName,
      services,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Record deployment in state
    const deployment = stateManager.addDeployment({
      deviceId,
      services: services.map(s => s.name || s.service),
      expectedJsonFiles: services.map(s => s.jsonOutput || `${s.name || s.service}_*.json`),
    });

    if (!deployment) {
      return res.status(500).json({ error: 'Failed to record deployment' });
    }

    res.json({
      success: true,
      deploymentId: deployment.id,
      message: `Deployment initiated for device ${deviceId}`,
      services: services.length,
    });

  } catch (err) {
    console.error('Deployment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deployment/device-info
// Get device information by querying Balena API
// This finds the device UUID for the current device running this service
router.get('/device-info', async (req, res) => {
  try {
    // Get Balena token
    const balenaToken = balenaTokenManager.getToken();
    if (!balenaToken) {
      return res.status(503).json({ error: 'Balena API token not configured' });
    }

    // Get device hostname from environment (set by Balena)
    const deviceHostname = process.env.BALENA_DEVICE_NAME_AT_INIT || process.env.HOSTNAME || '';
    const fleetName = process.env.BALENA_APP_NAME || '';

    if (!deviceHostname) {
      return res.status(503).json({ error: 'Cannot determine device hostname. Must be running on Balena.' });
    }

    console.log(`[DEVICE-INFO] Looking up device with hostname: ${deviceHostname}`);

    // Query Balena API for devices
    const axios = require('axios');
    const balenaApiUrl = 'https://api.balena-cloud.com/v7/device';
    const response = await axios.get(balenaApiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${balenaToken}`
      }
    });

    const devices = response.data.d || [];
    console.log(`[DEVICE-INFO] Found ${devices.length} devices in Balena API`);

    // Find device by hostname
    const device = devices.find(d => d.device_name === deviceHostname || d.uuid === deviceHostname);

    if (!device) {
      console.error(`[DEVICE-INFO] Device not found with hostname: ${deviceHostname}`);
      console.log(`[DEVICE-INFO] Available devices: ${devices.map(d => d.device_name || d.uuid).join(', ')}`);
      return res.status(404).json({ error: `Device not found in Balena API (hostname: ${deviceHostname})` });
    }

    console.log(`[DEVICE-INFO] Found device: ${device.uuid} (${device.device_name})`);

    res.json({
      deviceId: device.id,  // Internal Balena device ID
      deviceUuid: device.uuid,  // Full UUID
      deviceName: device.device_name,
      fleetName,
      environment: process.env.NODE_ENV || 'unknown'
    });
  } catch (err) {
    console.error('[DEVICE-INFO] Error fetching device info:', err.message);
    res.status(500).json({ error: `Failed to fetch device info: ${err.message}` });
  }
});

// GET /api/deployment/:deploymentId
// Get deployment details
router.get('/:deploymentId', (req, res) => {
  try {
    const deployment = stateManager.getDeployment(req.params.deploymentId);

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json(deployment);
  } catch (err) {
    console.error('Error fetching deployment:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
