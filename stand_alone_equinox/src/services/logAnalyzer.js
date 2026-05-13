const Docker = require('dockerode');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const ERROR_KEYWORDS = ['error', 'exception', 'fatal', 'critical', 'traceback'];
const WARNING_KEYWORDS = ['warning', 'warn', 'deprecated'];

/**
 * Analyze Docker logs for a deployment
 * @param {Object} deployment - Deployment record from state
 * @returns {Promise<Array>} Array of flagged errors
 */
async function analyzeDeploymentLogs(deployment) {
  const errors = [];

  try {
    if (!deployment.services || deployment.services.length === 0) {
      return errors;
    }

    // Get all running containers
    const containers = await docker.listContainers();

    // Filter containers that match deployed services
    const relevantContainers = containers.filter(container => {
      const containerName = container.Names?.[0]?.replace(/^\//, '') || '';
      return deployment.services.some(service => 
        containerName.includes(service) || container.Image.includes(service)
      );
    });

    // Analyze logs for each container
    for (const container of relevantContainers) {
      const containerErrors = await analyzeContainerLogs(container);
      errors.push(...containerErrors);
    }

  } catch (err) {
    console.error(`Error analyzing logs for deployment ${deployment.id}:`, err);
  }

  return errors;
}

/**
 * Analyze logs for a specific container
 * @param {Object} container - Docker container
 * @returns {Promise<Array>} Array of flagged errors
 */
async function analyzeContainerLogs(container) {
  const errors = [];

  try {
    const containerInstance = docker.getContainer(container.Id);
    
    // Get logs from last 1 hour
    const logStream = await containerInstance.logs({
      stdout: true,
      stderr: true,
      follow: false,
      timestamps: true,
      tail: 1000 // Last 1000 lines
    });

    const logs = logStream.toString('utf8');
    const lines = logs.split('\n');

    for (const line of lines) {
      // Check for ERROR level logs
      if (line.match(/\[ERROR\]|\bERROR\b|ERROR:/i)) {
        errors.push({
          service: container.Names?.[0]?.replace(/^\//, '') || container.Id.substring(0, 12),
          level: 'ERROR',
          message: line.substring(0, 200) // Truncate long lines
        });
      }
      // Check for WARNING level logs
      else if (line.match(/\[WARNING\]|\bWARN(ING)?\b|WARNING:/i)) {
        errors.push({
          service: container.Names?.[0]?.replace(/^\//, '') || container.Id.substring(0, 12),
          level: 'WARNING',
          message: line.substring(0, 200)
        });
      }
    }

  } catch (err) {
    console.error(`Error reading logs for container:`, err);
  }

  return errors;
}

module.exports = {
  analyzeDeploymentLogs,
  analyzeContainerLogs
};
