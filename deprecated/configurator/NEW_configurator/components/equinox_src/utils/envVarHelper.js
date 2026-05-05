const { Readable } = require('stream');
const csv = require('csv-parser');
const BalenaApiHelper = require('../services/balenaApiHelper');

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
  return balenaHelper.setDeviceEnvVars(deviceUuid, variables);
}

async function applyEnvironmentVariablesFromCSV(csvBuffer, balenaToken, deviceUuid) {
  const variables = await parseEnvironmentVariablesCSV(csvBuffer);

  if (Object.keys(variables).length === 0) {
    throw new Error('CSV file is empty or has no valid KEY,VALUE pairs');
  }

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
