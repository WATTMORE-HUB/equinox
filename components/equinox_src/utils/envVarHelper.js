const { Readable } = require('stream');
const csv = require('csv-parser');
const BalenaApiHelper = require('../services/balenaApiHelper');

/**
 * Parse CSV buffer into key-value pairs
 * @param {Buffer} csvBuffer - CSV file buffer
 * @returns {Promise<Object>} - Variables object with KEY: VALUE pairs
 */
async function parseEnvironmentVariablesCSV(csvBuffer) {
  const variables = {};
  
  return new Promise((resolve, reject) => {
    Readable.from([csvBuffer.toString()])
      .pipe(csv())
      .on('data', (row) => {
        const key = Object.keys(row)[0];
        const value = Object.values(row)[0];
        if (key && value) {
          variables[key] = value;
        }
      })
      .on('error', reject)
      .on('end', () => resolve(variables));
  });
}

/**
 * Apply environment variables to a Balena device
 * @param {string} balenaToken - Balena API token
 * @param {string} deviceUuid - Device UUID
 * @param {Object} variables - Variables object { KEY: VALUE }
 * @returns {Promise<Array>} - Array of results from Balena API
 */
async function applyEnvironmentVariablesToDevice(balenaToken, deviceUuid, variables) {
  if (!balenaToken) {
    throw new Error('Balena token is required');
  }
  if (!deviceUuid) {
    throw new Error('Device UUID is required');
  }
  if (!variables || Object.keys(variables).length === 0) {
    throw new Error('No environment variables to apply');
  }
  
  const balenaHelper = new BalenaApiHelper(balenaToken);
  return await balenaHelper.setDeviceEnvVars(deviceUuid, variables);
}

/**
 * Upload and apply environment variables from CSV file
 * Combines parsing and application into one operation
 * @param {Buffer} csvBuffer - CSV file buffer
 * @param {string} balenaToken - Balena API token
 * @param {string} deviceUuid - Device UUID
 * @returns {Promise<Object>} - { appliedVariables: Array, count: number }
 */
async function applyEnvironmentVariablesFromCSV(csvBuffer, balenaToken, deviceUuid) {
  // Parse CSV
  const variables = await parseEnvironmentVariablesCSV(csvBuffer);
  
  if (Object.keys(variables).length === 0) {
    throw new Error('CSV file is empty or has no valid KEY,VALUE pairs');
  }
  
  // Apply to device
  const results = await applyEnvironmentVariablesToDevice(balenaToken, deviceUuid, variables);
  
  return {
    appliedVariables: Object.keys(variables),
    count: results.length
  };
}

module.exports = {
  parseEnvironmentVariablesCSV,
  applyEnvironmentVariablesToDevice,
  applyEnvironmentVariablesFromCSV
};
