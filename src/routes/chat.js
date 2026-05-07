const express = require('express');
const llmClient = require('../services/llmClientNode');
const redeployHelper = require('../services/redeployHelper');

const router = express.Router();

/**
 * Query the LLM with a question about system health
 * POST /api/chat
 * Body: { question: string }
 * Response: { answer: string }
 */
router.post('/', async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid question' });
  }

  const trimmedQuestion = question.trim();
  if (!trimmedQuestion || trimmedQuestion.length > 500) {
    return res.status(400).json({ error: 'Question must be between 1 and 500 characters' });
  }

  try {
    const answer = await Promise.race([
      llmClient.query(trimmedQuestion),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 35000);
      })
    ]);

    // Check for redeploy request
    if (answer && answer.includes('__EQUINOX_REDEPLOY__')) {
      console.log('[Chat API] Redeploy request detected, initiating deployment...');
      try {
        const deployResult = await redeployHelper.triggerRedeploy();
        return res.json({
          answer: deployResult.message,
          deployment: {
            triggered: deployResult.success,
            deploymentId: deployResult.deploymentId,
            commandId: deployResult.commandId
          }
        });
      } catch (error) {
        console.error('[Chat API] Error triggering redeploy:', error.message);
        return res.status(500).json({ error: `Failed to trigger redeploy: ${error.message}` });
      }
    }

    res.json({ answer });
  } catch (error) {
    console.error('[Chat API] Error:', error.message || error);
    if (error.message === 'Query timeout') {
      return res.status(408).json({ error: 'Query took too long to process. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to process question' });
  }
});

module.exports = router;
