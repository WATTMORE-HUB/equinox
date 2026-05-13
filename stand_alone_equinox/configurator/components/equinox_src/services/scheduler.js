const cron = require('node-cron');

const stateManager = require('../stateManager');
const logAnalyzer = require('./logAnalyzer');
const dataValidator = require('./dataValidator');

let logCheckJob = null;
let validationCheckJob = null;

/**
 * Start background schedulers for log analysis and data validation
 */
function startSchedulers() {
  const state = stateManager.readState();
  if (!state) {
    console.error('Failed to start schedulers - state file unavailable');
    return;
  }

  const logCheckInterval = state.config?.logCheckInterval || 3600000; // 1 hour
  const logCheckCronExpression = '0 * * * *'; // Every hour

  // Hourly log analysis
  logCheckJob = cron.schedule(logCheckCronExpression, async () => {
    console.log(`[${new Date().toISOString()}] Starting hourly log analysis...`);
    try {
      await analyzeLogsForAllDeployments();
      stateManager.updateLastLogCheck();
    } catch (err) {
      console.error('Log analysis error:', err);
    }
  });

  // Data validation check (every 30 seconds during validation windows)
  validationCheckJob = cron.schedule('*/30 * * * * *', async () => {
    try {
      await validateDataForActiveDeployments();
    } catch (err) {
      console.error('Data validation error:', err);
    }
  });

  console.log('Background schedulers started');
  console.log('- Log analysis: every hour');
  console.log('- Data validation: every 30 seconds (during 10-minute validation windows)');
}

/**
 * Stop background schedulers
 */
function stopSchedulers() {
  if (logCheckJob) {
    logCheckJob.stop();
    logCheckJob = null;
  }
  if (validationCheckJob) {
    validationCheckJob.stop();
    validationCheckJob = null;
  }
  console.log('Background schedulers stopped');
}

/**
 * Analyze logs for all active deployments
 */
async function analyzeLogsForAllDeployments() {
  const deployments = stateManager.getDeployments();

  for (const deployment of deployments) {
    try {
      console.log(`Analyzing logs for deployment ${deployment.id}...`);
      const errors = await logAnalyzer.analyzeDeploymentLogs(deployment);

      // Record any new errors
      if (errors && errors.length > 0) {
        for (const error of errors) {
          stateManager.addErrorToDeployment(deployment.id, {
            message: error.message,
            source: error.service,
            level: error.level
          });
        }
        console.log(`Found ${errors.length} errors in ${deployment.id}`);
      }
    } catch (err) {
      console.error(`Error analyzing logs for ${deployment.id}:`, err);
    }
  }
}

/**
 * Validate data for deployments still in validation window
 */
async function validateDataForActiveDeployments() {
  const activeDeployments = stateManager.getActiveValidationDeployments();

  for (const deployment of activeDeployments) {
    try {
      // Only check every minute to avoid excessive I/O
      const lastCheck = deployment.lastValidationCheck || 0;
      if (Date.now() - lastCheck < 60000) {
        continue;
      }

      const validationResult = await dataValidator.validateDeploymentData(deployment);

      if (!validationResult.allFilesPresent) {
        for (const missingFile of validationResult.missingFiles) {
          stateManager.addErrorToDeployment(deployment.id, {
            message: `Expected JSON file not found: ${missingFile}`,
            source: 'data-validator'
          });
        }
      }

      stateManager.updateDeployment(deployment.id, {
        lastValidationCheck: Date.now(),
        validationStatus: validationResult.allFilesPresent ? 'valid' : 'invalid'
      });
    } catch (err) {
      console.error(`Error validating data for ${deployment.id}:`, err);
    }
  }
}

module.exports = {
  startSchedulers,
  stopSchedulers
};
