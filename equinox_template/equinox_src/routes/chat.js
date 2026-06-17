const express = require('express');
const llmClient = require('../services/llmClientNode');
const redeployHelper = require('../services/redeployHelper');
const intentMatcher = require('../services/intentMatcher');
const responseFormatter = require('../services/responseFormatter');

const router = express.Router();

// Track Timestream check state for follow-up responses
const timestreamCheckState = new Map(); // sessionId -> { awaitingTimespan: true, expiresAt: timestamp }
// Track failed parse attempts per session
const failedAttempts = new Map(); // sessionId -> { count, lastAttempt, expiresAt }
// Track conversation context for follow-ups
const conversationContext = new Map(); // sessionId -> { lastIntent, priorResponses, expiresAt }

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
    const sessionKey = sessionId || 'default';
    const now = Date.now();

    // Clean up expired state
    for (const [key, state] of failedAttempts.entries()) {
      if (now > state.expiresAt) {
        failedAttempts.delete(key);
      }
    }
    for (const [key, state] of conversationContext.entries()) {
      if (now > state.expiresAt) {
        conversationContext.delete(key);
      }
    }

    // Check if we're waiting for Timestream timespan from this session
    const checkState = timestreamCheckState.get(sessionKey);
    if (checkState && checkState.awaitingTimespan && Date.now() < checkState.expiresAt) {
      console.log('[Chat API] Processing Timestream timespan response...');
      const TimestreamChecker = require('../services/timestreamChecker');
      const checker = new TimestreamChecker();
      const thresholdMs = checker.parseTimespan(trimmedQuestion);
      
      console.log(`[Chat API] Parsed timespan "${trimmedQuestion}" => ${thresholdMs}ms`);
      
      if (!thresholdMs) {
        console.log('[Chat API] Failed to parse timespan, clearing state and re-asking');
        timestreamCheckState.delete(sessionKey);
        const recovery = responseFormatter.buildErrorRecoveryMessage('parse_failed');
        return res.json(recovery);
      }
      
      timestreamCheckState.delete(sessionKey);
      failedAttempts.delete(sessionKey);
      
      console.log(`[Chat API] Running Timestream check with ${checker.formatAge(thresholdMs)} threshold`);
      try {
        const checkResults = await checker.checkAllTables(thresholdMs);
        const formattedResults = checker.formatResults(checkResults);
        conversationContext.set(sessionKey, {
          lastIntent: 'check_data_flow',
          priorResponses: [formattedResults],
          expiresAt: now + 10 * 60 * 1000
        });
        return res.json({ answer: formattedResults });
      } catch (err) {
        console.error('[Chat API] Timestream check failed:', err.message, err.stack);
        return res.json({ answer: `Error checking data freshness: ${err.message}` });
      }
    }

    // Match intent from input
    const intentResult = intentMatcher.matchIntent(trimmedQuestion);
    console.log(`[Chat API] Intent match: ${intentResult.intent} (confidence: ${intentResult.confidence.toFixed(2)})`);

    // If high confidence match, route to handler
    if (intentResult.confidence >= 0.95 && intentResult.intent) {
      failedAttempts.delete(sessionKey); // Clear failed attempts on success
      return handleIntent(intentResult, sessionKey, res, trimmedQuestion);
    }

    // If medium confidence, show suggestion
    if (intentResult.confidence >= 0.6 && intentResult.intent) {
      const suggestions = intentMatcher.getSuggestions(trimmedQuestion);
      if (suggestions.length > 0) {
        failedAttempts.delete(sessionKey);
        const response = responseFormatter.buildSuggestionResponse(trimmedQuestion, suggestions);
        return res.json(response);
      }
    }

    // Low confidence or no match - track failed attempt
    let attempts = failedAttempts.get(sessionKey) || { count: 0, expiresAt: now + 5 * 60 * 1000 };
    attempts.count += 1;
    attempts.lastAttempt = trimmedQuestion;
    failedAttempts.set(sessionKey, attempts);
    
    console.log(`[Chat API] Failed parse attempt ${attempts.count} for session ${sessionKey}`);

    // After 2 failed attempts, show capabilities menu
    if (attempts.count >= 2) {
      console.log('[Chat API] Two failed attempts, showing capabilities menu');
      failedAttempts.delete(sessionKey);
      const response = responseFormatter.buildTwoStrikeResponse();
      return res.json(response);
    }

    // First failed attempt - show suggestion with nearby matches
    const suggestions = intentMatcher.getSuggestions(trimmedQuestion);
    const response = responseFormatter.buildSuggestionResponse(trimmedQuestion, suggestions);
    return res.json(response);
  } catch (error) {
    console.error('[Chat API] Error:', error.message || error);
    if (error.message === 'Query timeout') {
      return res.status(408).json({ error: 'Query took too long to process. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to process question' });
  }
});

/**
 * Route intent to appropriate handler
 */
async function handleIntent(intentResult, sessionKey, res, trimmedQuestion) {
  const intent = intentResult.intent;
  console.log(`[Chat API] Handling intent: ${intent}`);

  // Help/capabilities request
  if (intent === 'help') {
    const response = responseFormatter.buildCapabilitiesMenu();
    return res.json(response);
  }

  // For system health, return full system report
  if (intent === 'system_health') {
    const answer = await llmClient.query('how is my system');
    conversationContext.set(sessionKey, {
      lastIntent: intent,
      priorResponses: [answer],
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    return res.json({ answer });
  }

  // For data flow, ask for timespan if not provided in entities
  if (intent === 'check_data_flow') {
    if (intentResult.entities.timespan) {
      // Has timespan - execute directly
      const TimestreamChecker = require('../services/timestreamChecker');
      const checker = new TimestreamChecker();
      const checkResults = await checker.checkAllTables(intentResult.entities.timespan);
      const formattedResults = checker.formatResults(checkResults);
      conversationContext.set(sessionKey, {
        lastIntent: intent,
        priorResponses: [formattedResults],
        expiresAt: Date.now() + 10 * 60 * 1000
      });
      return res.json({ answer: formattedResults });
    } else {
      // No timespan - ask for it
      timestreamCheckState.set(sessionKey, {
        awaitingTimespan: true,
        expiresAt: Date.now() + 5 * 60 * 1000
      });
      return res.json({
        answer: `Within what time span should the data be fresh? Please specify: 5 minutes, 10 minutes, 30 minutes, or 1 hour.`
      });
    }
  }

  // For file requests with directory specified
  if (intent === 'get_latest_file') {
    if (intentResult.entities.directory) {
      const dir = intentResult.entities.directory;
      const answer = await llmClient.query(`show me latest /${dir}`);
      conversationContext.set(sessionKey, {
        lastIntent: intent,
        priorResponses: [answer],
        expiresAt: Date.now() + 10 * 60 * 1000
      });
      return res.json({ answer });
    } else {
      // No directory specified - ask for it
      return res.json({
        answer: 'Which data would you like to see? (tracker, meter, inverter, weather, recloser)'
      });
    }
  }

  // Handle modbus test - show form UI
  if (intent === 'modbus_test') {
    // Return marker that tells frontend to show modbus test form
    const formMarker = '__EQUINOX_MODBUS_FORM__';
    const answer = formMarker;
    conversationContext.set(sessionKey, {
      lastIntent: intent,
      priorResponses: [answer],
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    console.log('[Chat API] Returning modbus form UI marker');
    return res.json({ answer });
  }

  // Handle modbus write - show write form UI
  if (intent === 'modbus_write') {
    // Return marker that tells frontend to show modbus write form
    const writeFormMarker = '__EQUINOX_MODBUS_WRITE_FORM__';
    const answer = writeFormMarker;
    conversationContext.set(sessionKey, {
      lastIntent: intent,
      priorResponses: [answer],
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    console.log('[Chat API] Returning modbus write form UI marker');
    return res.json({ answer });
  }

  // Route other intents through llmClient with keyword-rich questions
  const intentToQuestion = {
    system_health: 'how is my system',
    list_containers: 'what containers are running',
    check_errors: 'show me errors',
    check_warnings: 'show me warnings',
    check_memory: 'how much memory',
    check_cpu: 'cpu usage',
    check_data_flow: 'check data uploads',
    modbus_test: 'test register',
    redeploy: 'redeploy',
    environment_variables: 'environment variables'
  };
  
  const queryQuestion = intentToQuestion[intent] || trimmedQuestion;
  const answer = await llmClient.query(queryQuestion);
  conversationContext.set(sessionKey, {
    lastIntent: intent,
    priorResponses: [answer],
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  // Check for special markers
  if (answer && answer.includes('__EQUINOX_REDEPLOY__')) {
    console.log('[Chat API] Redeploy request detected');
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

  return res.json({ answer });
}

module.exports = router;
