const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const stateManager = require('../stateManager');
const { deployServices } = require('../services/deployer');
const hardwareConfigLoader = require('../services/hardwareConfigLoader');
const wattmoreClient = require('../services/wattmoreClient');
const configGenerator = require('../services/configGenerator');

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
// Body: { balenaToken, deviceId, fleetName, csvFile }
router.post('/deploy', upload.single('csvFile'), async (req, res) => {
  try {
    console.log('[DEPLOYMENT ROUTE] req.body:', JSON.stringify(req.body, null, 2));
    console.log('[DEPLOYMENT ROUTE] Extracted fleetName:', req.body.fleetName);
    
    const { balenaToken, deviceId, fleetName } = req.body;
    const csvFile = req.file;

    console.log('[DEPLOYMENT ROUTE] After destructuring - fleetName:', fleetName);

    if (!balenaToken || !deviceId || !fleetName) {
      return res.status(400).json({ error: 'balenaToken, deviceId, and fleetName are required' });
    }

    if (!csvFile) {
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
