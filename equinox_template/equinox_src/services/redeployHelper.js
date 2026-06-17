const axios = require('axios');
const balenaTokenManager = require('./balenaTokenManager');
const wattmoreClient = require('./wattmoreClient');
const configGenerator = require('./configGenerator');

/**
 * Helper to trigger redeploy from chat using the same flow as Configure
 * Fetches current device/project info, regenerates services and env vars, then deploys
 */
class RedeployHelper {
  /**
   * Get current device info from Balena environment
   */
  static getDeviceInfo() {
    return {
      deviceUuid: process.env.BALENA_DEVICE_UUID,
      deviceId: process.env.BALENA_DEVICE_ID,
      deviceName: process.env.BALENA_DEVICE_NAME_AT_INIT || process.env.HOSTNAME,
      fleetName: process.env.BALENA_APP_NAME
    };
  }

  /**
   * Validate that we have the necessary info to redeploy
   */
  static validateDeviceInfo(deviceInfo) {
    if (!deviceInfo.deviceUuid) {
      throw new Error('Device UUID not available. Not running on Balena or device identification not configured.');
    }
    if (!deviceInfo.fleetName) {
      throw new Error('Fleet name not available. Cannot determine project to redeploy.');
    }
    return true;
  }

  /**
   * Trigger a redeploy using the same flow as Configure
   * Calls /api/deployment/deploy endpoint to ensure proper env var handling
   * Returns { success: boolean, deploymentId?: string, message: string }
   */
  static async triggerRedeploy() {
    try {
      console.log('[RedeployHelper] Triggering redeploy from chat...');

      // Get device info
      const deviceInfo = this.getDeviceInfo();
      this.validateDeviceInfo(deviceInfo);

      console.log(
        `[RedeployHelper] Device: ${deviceInfo.deviceName} (${deviceInfo.deviceUuid}), Fleet: ${deviceInfo.fleetName}`
      );

      // Get Balena token
      const balenaToken = balenaTokenManager.getToken();
      if (!balenaToken) {
        return {
          success: false,
          message: 'Balena token not available. Cannot trigger deployment.'
        };
      }

      // Fetch project configuration from Wattmore
      let projectData;
      try {
        console.log(`[RedeployHelper] Fetching project data for: ${deviceInfo.fleetName}`);
        projectData = await wattmoreClient.getProjectByName(deviceInfo.fleetName);
        console.log(`[RedeployHelper] ✓ Project data loaded`);
      } catch (err) {
        console.warn(`[RedeployHelper] Could not fetch project data from Wattmore: ${err.message}`);
        // Create minimal project data to proceed
        projectData = {
          name: deviceInfo.fleetName,
          fleetName: deviceInfo.fleetName,
          hardware: {
            meters: [],
            inverters: [],
            weatherStations: [],
            trackers: [],
            cameras: [],
            reclosers: []
          },
          uuids: {}
        };
      }

      // Generate deployment config (services + environment variables)
      console.log('[RedeployHelper] Generating deployment configuration...');
      const deploymentConfig = await configGenerator.generateConfig(projectData);
      console.log(`[RedeployHelper] ✓ Generated config with services: ${deploymentConfig.services.join(', ')}`);

      // Call /api/deployment/deploy endpoint (same as Configure frontend does)
      // This ensures redeploy uses the EXACT same flow as initial configuration
      // and reads env vars that were set during initial deployment
      console.log('[RedeployHelper] Calling /api/deployment/deploy endpoint...');
      
      // Convert services to CSV
      const csvHeader = 'name,service\n';
      const csvRows = deploymentConfig.services.map(s => {
        const name = typeof s === 'string' ? s : (s.name || s.service);
        const service = typeof s === 'string' ? s : (s.service || s.name);
        return `${name},${service}`;
      }).join('\n');
      const csvData = csvHeader + csvRows;
      
      // Create FormData with CSV file
      const FormData = require('form-data');
      const form = new FormData();
      form.append('deviceId', deviceInfo.deviceUuid);
      form.append('fleetName', deviceInfo.fleetName);
      form.append('csvFile', Buffer.from(csvData), 'services.csv');
      
      try {
        const deployResult = await axios.post(
          'http://localhost:3000/api/deployment/deploy',
          form,
          {
            headers: form.getHeaders()
          }
        );
        
        console.log('[RedeployHelper] ✓ Redeploy triggered successfully');
        return {
          success: true,
          deploymentId: deployResult.data.deploymentId,
          message: deployResult.data.message || 'Redeploy initiated. The latest software will be deployed to your device. This typically takes 10-15 minutes.'
        };
      } catch (deployErr) {
        console.error(`[RedeployHelper] Deployment API error: ${deployErr.message}`);
        if (deployErr.response?.data?.error) {
          return {
            success: false,
            message: `Deployment failed: ${deployErr.response.data.error}`
          };
        }
        return {
          success: false,
          message: `Deployment failed: ${deployErr.message}`
        };
      }
    } catch (error) {
      console.error(`[RedeployHelper] Error: ${error.message}`);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }
}

module.exports = RedeployHelper;
