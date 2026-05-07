const express = require('express');
const llmClient = require('../services/llmClientNode');
const redeployHelper = require('../services/redeployHelper');

const router = express.Router();

// Track Timestream check state for follow-up responses
const timestreamCheckState = new Map(); // sessionId -> { awaitingTimespan: true, expiresAt: timestamp }

/**
 * Query the LLM with a question about system health
 * POST /api/chat
 * Body: { question: string }
 * Response: { answer: string }
 */
router.post('/', async (req, res) => {
  const { question, sessionId } = req.body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid question' });
  }

  const trimmedQuestion = question.trim();
  if (!trimmedQuestion || trimmedQuestion.length > 500) {
    return res.status(400).json({ error: 'Question must be between 1 and 500 characters' });
  }

  try {
    // Check if we're waiting for Timestream timespan from this session
    const sessionKey = sessionId || 'default';
    const checkState = timestreamCheckState.get(sessionKey);
    
    if (checkState && checkState.awaitingTimespan && Date.now() < checkState.expiresAt) {
      console.log('[Chat API] Processing Timestream timespan response...');
      
      // Lazy-load TimestreamChecker only when needed (Monitor mode)
      const TimestreamChecker = require('../services/timestreamChecker');
      const checker = new TimestreamChecker();
      const thresholdMs = checker.parseTimespan(trimmedQuestion);
      
      if (!thresholdMs) {
        return res.json({
          answer: `I couldn't parse that timespan. Please try: "5 minutes", "10 minutes", "30 minutes", or "1 hour".`
        });
      }
      
      // Clean up state and run the check
      timestreamCheckState.delete(sessionKey);
      
      console.log(`[Chat API] Running Timestream check with ${checker.formatAge(thresholdMs)} threshold`);
      const checkResults = await checker.checkAllTables(thresholdMs);
      const formattedResults = checker.formatResults(checkResults);
      
      return res.json({ answer: formattedResults });
    }

    const answer = await Promise.race([
      llmClient.query(trimmedQuestion),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 35000);
      })
    ]);

    // Check for data flow question (ask for timespan)
    const isDataFlowPrompt = answer && typeof answer === 'string' && answer.includes('Within what time span');
    if (isDataFlowPrompt) {
      console.log('[Chat API] Data flow question detected, awaiting timespan response');
      // Set state to expect timespan in next message (expires in 5 minutes)
      timestreamCheckState.set(sessionKey, {
        awaitingTimespan: true,
        expiresAt: Date.now() + 5 * 60 * 1000
      });
      return res.json({ answer });
    }

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
