const balenaTokenManager = require('./balenaTokenManager');
const wattmoreClient = require('./wattmoreClient');
const configGenerator = require('./configGenerator');
const { deployServices } = require('./deployer');
const BalenaApiHelper = require('./balenaApiHelper');

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
   * Trigger a redeploy using the same cloud deployment flow as Configure
   * Returns { success: boolean, deploymentId?: string, commandId?: string, message: string }
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

      // Trigger deployment using the same cloud flow as Configure
      console.log('[RedeployHelper] Initiating cloud deployment...');
      const deployResult = await deployServices({
        balenaToken,
        deviceId: deviceInfo.deviceUuid,
        fleetName: deviceInfo.fleetName,
        services: deploymentConfig.services,
        environmentVariables: deploymentConfig.environmentVariables
      });

      if (!deployResult.success) {
        console.error(`[RedeployHelper] Deployment failed: ${deployResult.error}`);
        return {
          success: false,
          message: `Deployment failed: ${deployResult.error}`
        };
      }

      console.log('[RedeployHelper] ✓ Redeploy triggered successfully');
      return {
        success: true,
        deploymentId: deployResult.deploymentId,
        commandId: deployResult.commandId,
        message: deployResult.message || 'Redeploy initiated. The latest software will be pulled from EC2 and deployed to your device. This typically takes 10-15 minutes.'
      };
    } catch (error) {
      console.error(`[RedeployHelper] Error triggering redeploy: ${error.message}`);
      return {
        success: false,
        message: `Error triggering redeploy: ${error.message}`
      };
    }
  }
}

module.exports = RedeployHelper;
