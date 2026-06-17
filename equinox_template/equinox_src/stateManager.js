const fs = require('fs');
const path = require('path');

// Default state file location (will be /collect_data/state.json on CM4)
const STATE_FILE_PATH = process.env.STATE_FILE_PATH || path.join(__dirname, '../state.json');

// Ensure state file exists
function initializeStateFile() {
  try {
    if (!fs.existsSync(STATE_FILE_PATH)) {
      const initialState = {
        deployments: [],
        lastLogCheck: null,
        config: {
          logCheckInterval: 3600000, // 1 hour in ms
          validationWindow: 600000, // 10 minutes in ms
        }
      };
      fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(initialState, null, 2));
    }
  } catch (err) {
    console.error('Failed to initialize state file:', err);
  }
}

// Read state with simple locking (retry pattern)
function readState() {
  try {
    let retries = 3;
    while (retries > 0) {
      try {
        const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
        return JSON.parse(data);
      } catch (err) {
        if (err.code === 'ENOENT') {
          initializeStateFile();
          retries--;
        } else {
          throw err;
        }
      }
    }
    throw new Error('Failed to read state file after retries');
  } catch (err) {
    console.error('Error reading state:', err);
    return null;
  }
}

// Write state with simple locking (atomic write pattern)
function writeState(state) {
  try {
    const tempPath = STATE_FILE_PATH + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, STATE_FILE_PATH);
    return true;
  } catch (err) {
    console.error('Error writing state:', err);
    return false;
  }
}

// Get all active deployments
function getDeployments() {
  const state = readState();
  if (!state) return [];
  return state.deployments || [];
}

// Add a new deployment
function addDeployment(deploymentData) {
  const state = readState();
  if (!state) return null;

  const deployment = {
    id: generateDeploymentId(),
    timestamp: Date.now(),
    status: 'deployed',
    ...deploymentData,
    validationEndTime: Date.now() + (state.config?.validationWindow || 600000),
    lastLogCheck: Date.now(),
    errorLog: []
  };

  state.deployments.push(deployment);
  if (writeState(state)) {
    return deployment;
  }
  return null;
}

// Update a deployment
function updateDeployment(deploymentId, updates) {
  const state = readState();
  if (!state) return null;

  const deploymentIndex = state.deployments.findIndex(d => d.id === deploymentId);
  if (deploymentIndex === -1) return null;

  state.deployments[deploymentIndex] = {
    ...state.deployments[deploymentIndex],
    ...updates
  };

  if (writeState(state)) {
    return state.deployments[deploymentIndex];
  }
  return null;
}

// Add error to deployment log
function addErrorToDeployment(deploymentId, error) {
  const state = readState();
  if (!state) return null;

  const deployment = state.deployments.find(d => d.id === deploymentId);
  if (!deployment) return null;

  deployment.errorLog.push({
    timestamp: Date.now(),
    message: error.message || error,
    source: error.source || 'unknown'
  });

  if (writeState(state)) {
    return deployment;
  }
  return null;
}

// Get deployment by ID
function getDeployment(deploymentId) {
  const state = readState();
  if (!state) return null;
  return state.deployments.find(d => d.id === deploymentId) || null;
}

// Get deployments still in validation window
function getActiveValidationDeployments() {
  const state = readState();
  if (!state) return [];

  const now = Date.now();
  return state.deployments.filter(d => d.validationEndTime && d.validationEndTime > now);
}

// Update last log check time
function updateLastLogCheck() {
  const state = readState();
  if (!state) return false;

  state.lastLogCheck = Date.now();
  return writeState(state);
}

// Generate unique deployment ID
function generateDeploymentId() {
  return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  initializeStateFile,
  readState,
  writeState,
  getDeployments,
  addDeployment,
  updateDeployment,
  addErrorToDeployment,
  getDeployment,
  getActiveValidationDeployments,
  updateLastLogCheck,
  STATE_FILE_PATH
};
