const express = require('express');

const stateManager = require('../stateManager');

const router = express.Router();

// GET /api/status/deployments
// Get all deployments
router.get('/deployments', (req, res) => {
  try {
    const deployments = stateManager.getDeployments();
    res.json({
      count: deployments.length,
      deployments,
    });
  } catch (err) {
    console.error('Error fetching deployments:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/status/deployment/:deploymentId
// Get deployment status and errors
router.get('/deployment/:deploymentId', (req, res) => {
  try {
    const deployment = stateManager.getDeployment(req.params.deploymentId);

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    const now = Date.now();
    const inValidationWindow = deployment.validationEndTime && deployment.validationEndTime > now;

    res.json({
      ...deployment,
      inValidationWindow,
      validationTimeRemaining: inValidationWindow ? deployment.validationEndTime - now : 0,
    });
  } catch (err) {
    console.error('Error fetching deployment status:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/status/errors/:deploymentId
// Get error log for deployment
router.get('/errors/:deploymentId', (req, res) => {
  try {
    const deployment = stateManager.getDeployment(req.params.deploymentId);

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json({
      deploymentId: req.params.deploymentId,
      errorCount: deployment.errorLog?.length || 0,
      errors: deployment.errorLog || [],
    });
  } catch (err) {
    console.error('Error fetching errors:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/status/state
// Get entire state (for debugging)
router.get('/state', (req, res) => {
  try {
    const state = stateManager.readState();
    res.json(state);
  } catch (err) {
    console.error('Error fetching state:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
