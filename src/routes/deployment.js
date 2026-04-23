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

// GET /api/deployment/projects
// List all available projects from Wattmore
router.get('/projects', async (req, res) => {
  try {
    console.log('[Projects] Fetching available projects');
    
    // Ensure wattmore client is authenticated
    if (!wattmoreClient.authToken) {
      console.log('[Projects] No auth token, logging in to Wattmore');
      await wattmoreClient.login();
    }
    
    // Fetch all installed systems from Wattmore (uses authenticated client)
    const axios = require('axios');
    const apiUrl = 'https://solar-configurator-lime.vercel.app/api/installed-systems';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${wattmoreClient.authToken}`
    };
    
    console.log('[Projects] Making authenticated request with token');
    let response;
    try {
      response = await axios.get(apiUrl, { headers });
    } catch (err) {
      // If we get a 401, try logging in again (token may have expired)
      if (err.response?.status === 401) {
        console.log('[Projects] Got 401, retrying login');
        await wattmoreClient.login();
        const newHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${wattmoreClient.authToken}`
        };
        response = await axios.get(apiUrl, { headers: newHeaders });
      } else {
        throw err;
      }
    }
    
    console.log('[Projects] Response status:', response.status);
    const systems = Array.isArray(response.data) ? response.data : response.data.systems || [];
    const projectNames = systems.map(s => s.projectName).filter(Boolean);
    
    console.log('[Projects] Found projects:', projectNames);
    
    res.json({
      success: true,
      projects: projectNames
    });
  } catch (err) {
    console.error('[Projects] Error fetching projects list:', err.message);
    if (err.response) {
      console.error('[Projects] HTTP error status:', err.response.status);
      console.error('[Projects] HTTP error data:', JSON.stringify(err.response.data).substring(0, 200));
    }
    res.status(500).json({ error: `Failed to fetch projects list: ${err.message}` });
  }
});

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
// Get device information from Balena environment variables
// Returns device UUID and fleet name for the current device
router.get('/device-info', (req, res) => {
  try {
    // Get device info from Balena environment (set automatically by Balena)
    const deviceUuid = process.env.BALENA_DEVICE_UUID || '';
    const deviceId = process.env.BALENA_DEVICE_ID || '';
    const deviceName = process.env.BALENA_DEVICE_NAME_AT_INIT || process.env.HOSTNAME || '';
    const fleetName = process.env.BALENA_APP_NAME || '';

    if (!deviceUuid && !deviceId) {
      return res.status(503).json({ error: 'Device not running on Balena or device identification not available' });
    }

    console.log(`[DEVICE-INFO] Device: ${deviceName} (${deviceUuid || deviceId}) in fleet: ${fleetName}`);

    res.json({
      deviceId: deviceId || deviceUuid,
      deviceUuid: deviceUuid,
      deviceName: deviceName,
      fleetName: fleetName,
      environment: process.env.NODE_ENV || 'unknown'
    });
  } catch (err) {
    console.error('[DEVICE-INFO] Error:', err.message);
    res.status(500).json({ error: err.message });
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
