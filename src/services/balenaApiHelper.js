const axios = require('axios');

const BALENA_API_URL = 'https://api.balena-cloud.com';

/**
 * Helper to interact with Balena API for device configuration
 */
class BalenaApiHelper {
  constructor(token) {
    this.token = token;
    this.client = axios.create({
      baseURL: BALENA_API_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get device by UUID
   */
  async getDevice(deviceUuid) {
    try {
      const response = await this.client.get(
        `/v7/device?$filter=uuid%20eq%20'${deviceUuid}'`
      );

      if (response.data.d && response.data.d.length > 0) {
        return response.data.d[0];
      }
      throw new Error(`Device ${deviceUuid} not found`);
    } catch (err) {
      console.error('[BalenaApiHelper] Error getting device:', err.message);
      throw err;
    }
  }

  /**
   * Get all environment variables for a device
   */
  async getDeviceEnvVars(deviceId) {
    try {
      const response = await this.client.get(
        `/v7/device_environment_variable?$filter=device%20eq%20${deviceId}`
      );
      return response.data.d || [];
    } catch (err) {
      console.error('[BalenaApiHelper] Error getting device env vars:', err.message);
      throw err;
    }
  }

  /**
   * Set environment variable on device
   * Creates new or updates existing
   */
  async setDeviceEnvVar(deviceId, name, value) {
    try {
      // First check if var exists
      const envVars = await this.getDeviceEnvVars(deviceId);
      const existing = envVars.find(v => v.env_var_name === name);

      if (existing) {
        // Update existing
        console.log(`[BalenaApiHelper] Updating env var ${name}...`);
        await this.client.patch(
          `/v7/device_environment_variable(${existing.id})`,
          { value }
        );
      } else {
        // Create new
        console.log(`[BalenaApiHelper] Creating env var ${name}...`);
        await this.client.post('/v7/device_environment_variable', {
          device: deviceId,
          env_var_name: name,
          value
        });
      }

      console.log(`✓ Set ${name}=${value.substring(0, 20)}...`);
      return true;
    } catch (err) {
      console.error(`[BalenaApiHelper] Error setting env var ${name}:`, err.message);
      throw err;
    }
  }

  /**
   * Set multiple environment variables on device
   * deviceId can be either UUID or internal ID
   */
  async setDeviceEnvVars(deviceIdOrUuid, envVars) {
    try {
      // Check if this is a UUID (long string with dashes or alphanumeric)
      // or an internal ID (numeric)
      let deviceId = deviceIdOrUuid;
      if (isNaN(deviceIdOrUuid)) {
        // It's likely a UUID, need to get the internal ID
        const device = await this.getDevice(deviceIdOrUuid);
        deviceId = device.id;
      }
      
      const results = [];
      for (const [name, value] of Object.entries(envVars)) {
        if (value) {  // Skip empty values
          await this.setDeviceEnvVar(deviceId, name, value);
          results.push({ name, success: true });
        }
      }
      return results;
    } catch (err) {
      console.error('[BalenaApiHelper] Error setting multiple env vars:', err.message);
      throw err;
    }
  }

  /**
   * Configure device for monitor mode (Phase B)
   * Sets all required environment variables for monitoring/chat/IoT publishing
   */
  async configureForMonitorMode(deviceUuid, config = {}) {
    try {
      // Get device first to get internal device ID
      const device = await this.getDevice(deviceUuid);
      const deviceId = device.id;

      console.log(`[BalenaApiHelper] Configuring device ${deviceUuid} for monitor mode...`);

      // Build environment variables
      const envVars = {
        'EQUINOX_MODE': 'monitor',
        'MONITORING_INTERVAL': config.monitoringInterval || '300',
        'IOT_PUBLISH_ENABLED': config.iotEnabled ? 'true' : 'false',
      };

      // Add IoT variables if enabled
      if (config.iotEnabled && config.iotConfig) {
        const iot = config.iotConfig;
        Object.assign(envVars, {
          'AWSENDPOINT': iot.endpoint || '',
          'THINGNAME': iot.thingName || '',
          'CERT_NAME': iot.certName || 'device.crt',
          'KEY_NAME': iot.keyName || 'private.key',
          'CA_1_NAME': iot.caName || 'ca.crt',
          'CERT': iot.cert || '',
          'KEY': iot.key || '',
          'CA_1': iot.ca || '',
          'SITE': iot.siteId || '',
          'EDGE_ID': iot.edgeId || '',
          'BALENA_DEVICE_UUID': deviceUuid,
          'IOT_TOPIC': iot.topic || 'operate/device_reports',
        });
      }

      // Set all environment variables
      const results = await this.setDeviceEnvVars(deviceId, envVars);
      console.log(`✓ Configured ${results.length} environment variables for monitor mode`);

      return {
        success: true,
        deviceId,
        deviceUuid,
        variablesSet: results.length,
        message: `Device configured for monitor mode. Environment variables will take effect after service restart.`
      };
    } catch (err) {
      console.error('[BalenaApiHelper] Error configuring for monitor mode:', err.message);
      throw err;
    }
  }
}

module.exports = BalenaApiHelper;
