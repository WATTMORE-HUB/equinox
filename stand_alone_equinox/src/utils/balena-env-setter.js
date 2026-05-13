#!/usr/bin/env node

/**
 * Utility script to check and set Balena environment variables
 * Useful for recovery when environment variables didn't populate correctly
 * 
 * Usage:
 *   node balena-env-setter.js check <device-uuid>
 *   node balena-env-setter.js set <device-uuid> <var-name> <var-value>
 *   node balena-env-setter.js set-monitor <device-uuid>
 */

const BalenaApiHelper = require('../services/balenaApiHelper');

const command = process.argv[2];
const deviceUuid = process.argv[3];
const varName = process.argv[4];
const varValue = process.argv[5];

const token = process.env.BALENA_API_TOKEN;

if (!token) {
  console.error('Error: BALENA_API_TOKEN environment variable not set');
  process.exit(1);
}

const helper = new BalenaApiHelper(token);

async function main() {
  try {
    switch (command) {
      case 'check':
        if (!deviceUuid) {
          console.error('Usage: node balena-env-setter.js check <device-uuid>');
          process.exit(1);
        }
        await checkEnvVars(deviceUuid);
        break;

      case 'set':
        if (!deviceUuid || !varName || !varValue) {
          console.error('Usage: node balena-env-setter.js set <device-uuid> <var-name> <var-value>');
          process.exit(1);
        }
        await setEnvVar(deviceUuid, varName, varValue);
        break;

      case 'set-monitor':
        if (!deviceUuid) {
          console.error('Usage: node balena-env-setter.js set-monitor <device-uuid>');
          process.exit(1);
        }
        await setMonitorMode(deviceUuid);
        break;

      default:
        console.log('Balena Environment Variable Utility');
        console.log('');
        console.log('Commands:');
        console.log('  check <device-uuid>              - Check current environment variables');
        console.log('  set <device-uuid> <name> <value> - Set a single environment variable');
        console.log('  set-monitor <device-uuid>        - Configure device for Phase B monitor mode');
        console.log('');
        console.log('Examples:');
        console.log('  node balena-env-setter.js check abc123def456');
        console.log('  node balena-env-setter.js set abc123def456 EQUINOX_MODE monitor');
        console.log('  node balena-env-setter.js set-monitor abc123def456');
        process.exit(0);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function checkEnvVars(uuid) {
  console.log(`Checking environment variables for device: ${uuid}`);
  console.log('');

  try {
    const device = await helper.getDevice(uuid);
    console.log(`Device found: ${device.device_name} (ID: ${device.id})`);
    console.log('');

    const envVars = await helper.getDeviceEnvVars(device.id);
    
    if (envVars.length === 0) {
      console.log('No environment variables set on this device');
    } else {
      console.log(`Found ${envVars.length} environment variables:`);
      console.log('');
      envVars.forEach(env => {
        const value = env.value.length > 50 
          ? env.value.substring(0, 50) + '...' 
          : env.value;
        console.log(`  ${env.env_var_name} = ${value}`);
      });
    }
  } catch (error) {
    console.error(`Failed to check variables: ${error.message}`);
    throw error;
  }
}

async function setEnvVar(uuid, name, value) {
  console.log(`Setting environment variable on device: ${uuid}`);
  console.log(`  Variable: ${name}`);
  console.log(`  Value: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
  console.log('');

  try {
    const device = await helper.getDevice(uuid);
    console.log(`Device found: ${device.device_name}`);

    await helper.setDeviceEnvVar(device.id, name, value);
    console.log('✓ Environment variable set successfully');
    console.log('Note: Services will need to be restarted to pick up the new variable');
  } catch (error) {
    console.error(`Failed to set variable: ${error.message}`);
    throw error;
  }
}

async function setMonitorMode(uuid) {
  console.log(`Configuring device for monitor mode: ${uuid}`);
  console.log('');

  try {
    const device = await helper.getDevice(uuid);
    console.log(`Device found: ${device.device_name}`);
    console.log('');

    const config = {
      monitoringInterval: '300',
      iotEnabled: false
    };

    const result = await helper.configureForMonitorMode(uuid, config);
    console.log('✓ Device configured for monitor mode');
    console.log(`✓ Set ${result.variablesSet} environment variables`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Restart the equinox service');
    console.log('2. Dashboard should now show chat interface instead of configuration');
  } catch (error) {
    console.error(`Failed to configure for monitor mode: ${error.message}`);
    throw error;
  }
}

main();
