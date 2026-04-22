const axios = require('axios');
const path = require('path');

// Configuration for deployment method
const USE_CLOUD = process.env.USE_CLOUD === 'true';
const CLOUD_API_URL = process.env.CLOUD_API_URL; // API Gateway endpoint
const BALENA_API_URL = 'https://api.balena-cloud.com';

let ProjectCreator = null;

function getProjectCreator() {
  if (!ProjectCreator) {
    ProjectCreator = require('../configurator/ProjectCreator');
  }
  return ProjectCreator;
}

/**
 * Deploy via Cloud (EC2 + SSM via Lambda/API Gateway)
 */
async function deployViaCloud(options) {
  const { balenaToken, deviceId, fleetName, services } = options;
  
  try {
    if (!CLOUD_API_URL) {
      throw new Error('CLOUD_API_URL not configured');
    }

    // Convert services to CSV format
    const csvHeader = 'name,service\n';
    const csvRows = services.map(s => {
      const name = typeof s === 'string' ? s : (s.name || s.service);
      const service = typeof s === 'string' ? s : (s.service || s.name);
      return `${name},${service}`;
    }).join('\n');
    const csvData = csvHeader + csvRows;
    
    // Encode as base64
    const csvBase64 = Buffer.from(csvData).toString('base64');
    
    // Get status callback URL from environment or construct from device UUID
    let statusCallbackUrl = process.env.STATUS_CALLBACK_URL;
    if (!statusCallbackUrl && process.env.BALENA_DEVICE_UUID) {
      const deviceUuid = process.env.BALENA_DEVICE_UUID;
      statusCallbackUrl = `https://${deviceUuid}.balena-devices.com/api/status/callback`;
    }
    if (!statusCallbackUrl) {
      statusCallbackUrl = `http://localhost:3000/api/status/callback`; // fallback for local dev
    }
    
    // Call API Gateway (which triggers Lambda → EC2 via SSM)
    console.log('[DEPLOYER] Sending deployment request to cloud API...');
    console.log('[DEPLOYER] fleetName value before POST:', fleetName);
    
    const requestBody = {
      deploymentId: `deploy_${deviceId.substring(0, 8)}_${Date.now()}`,
      balenaToken,
      deviceId,
      fleetName,
      csvData: csvBase64,
      statusCallbackUrl
    };
    
    console.log('[DEPLOYER] Full request body:', JSON.stringify(requestBody, (k, v) => k === 'csvData' ? 'BASE64...' : v, 2));
    
    const response = await axios.post(CLOUD_API_URL, requestBody);
    
    const commandId = response.data.commandId || response.data.taskId;
    console.log(`✓ Cloud deployment started: ${commandId}`);
    
    return {
      success: true,
      deploymentId: response.data.deploymentId,
      commandId: commandId,
      message: response.data.message,
      status: 'running'
    };
  } catch (err) {
    console.error('Cloud deployment error:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Deploy services to a device via Balena
 * @param {Object} options - { balenaToken, deviceId, services }
 * @returns {Promise<{success: boolean, error?: string, projectPath?: string}>}
 */
async function deployServices(options) {
  const { balenaToken, deviceId, fleetName, services } = options;

  try {
    // Validate inputs
    if (!balenaToken || !deviceId || !services || services.length === 0) {
      return {
        success: false,
        error: 'Invalid deployment parameters'
      };
    }

    // If cloud API is configured, use cloud-based deployment
    if (USE_CLOUD && CLOUD_API_URL) {
      console.log('Using cloud-based deployment (EC2 + SSM)...');
      return await deployViaCloud(options);
    }

    // Otherwise, use local deployment
    console.log('Using local deployment...');
    
    // Verify device exists
    console.log(`Verifying device ${deviceId}...`);
    const deviceCheckResponse = await axios.get(
      `${BALENA_API_URL}/v6/device?$filter=uuid%20eq%20'${deviceId}'`,
      {
        headers: {
          'Authorization': `Bearer ${balenaToken}`
        }
      }
    );

    if (deviceCheckResponse.data.d.length === 0) {
      return {
        success: false,
        error: `Device ${deviceId} not found`
      };
    }

    const device = deviceCheckResponse.data.d[0];
    console.log(`✓ Device verified: ${device.device_name}`);

    // Extract service names from the services array
    const serviceNames = services
      .map(s => (typeof s === 'string' ? s : s.name || s.service))
      .filter(Boolean);

    console.log(`Services to deploy: ${serviceNames.join(', ')}`);

    // Generate project using existing ProjectCreator logic
    const projectName = `deploy_${deviceId.substring(0, 8)}_${Date.now()}`;
    const Creator = getProjectCreator();
    const creator = new Creator();
    
    console.log(`Creating project ${projectName}...`);
    const projectResult = await creator.createProject(projectName, serviceNames);

    if (!projectResult.success) {
      return {
        success: false,
        error: `Failed to create project: ${projectResult.error}`
      };
    }

    console.log(`✓ Project created at: ${projectResult.projectPath}`);
    console.log(`✓ Services: ${projectResult.services.join(', ')}`);
    console.log(`\n📝 Next step: Run 'balena push ${device.device_name}' from the project directory`);
    console.log(`   Project path: ${projectResult.projectPath}`);

    return {
      success: true,
      projectPath: projectResult.projectPath,
      services: projectResult.services,
      deviceName: device.device_name,
      message: `Project ready. User must run: balena push ${device.device_name}`
    };

  } catch (err) {
    console.error('Deployment error:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
  deployServices
};
