const express = require('express');
const llmClient = require('../services/llmClientNode');
const redeployHelper = require('../services/redeployHelper');
const ollamaModelManager = require('../services/ollamaModelManager');

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

    // Check for model download request
    if (answer && answer.includes('__EQUINOX_DOWNLOAD_MODEL__')) {
      console.log('[Chat API] Model download request detected, pulling mistral...');
      try {
        const pullResult = await ollamaModelManager.pullModel('tinyllama');
        return res.json({
          answer: pullResult.message,
          model: {
            triggered: pullResult.success,
            modelName: 'tinyllama',
            status: pullResult.success ? 'completed' : 'failed'
          }
        });
      } catch (error) {
        console.error('[Chat API] Error pulling model:', error.message);
        return res.status(500).json({ error: `Failed to pull model: ${error.message}` });
      }
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

/**
 * Pull a specific Ollama model
 * POST /api/chat/model/pull
 * Body: { modelName: string }
 * Response: { success: boolean, message: string }
 */
router.post('/model/pull', async (req, res) => {
  const { modelName } = req.body;

  if (!modelName || typeof modelName !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid modelName' });
  }

  try {
    console.log(`[Chat API] Pulling model: ${modelName}`);
    const result = await ollamaModelManager.pullModel(modelName);
    
    if (result.success) {
      res.json({
        success: true,
        modelName,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        modelName,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[Chat API] Error pulling model:', error.message);
    res.status(500).json({
      error: `Failed to pull model: ${error.message}`
    });
  }
});

/**
 * List available Ollama models
 * GET /api/chat/models
 * Response: { models: Array }
 */
router.get('/models', async (req, res) => {
  try {
    console.log('[Chat API] Listing available models');
    const result = await ollamaModelManager.listModels();
    
    res.json({
      models: result.models,
      error: result.error || null
    });
  } catch (error) {
    console.error('[Chat API] Error listing models:', error.message);
    res.status(500).json({
      error: `Failed to list models: ${error.message}`
    });
  }
});

/**
 * Check if a specific model is available
 * GET /api/chat/model/:modelName/available
 * Response: { available: boolean, modelName: string }
 */
router.get('/model/:modelName/available', async (req, res) => {
  const { modelName } = req.params;

  try {
    console.log(`[Chat API] Checking if model available: ${modelName}`);
    const available = await ollamaModelManager.isModelAvailable(modelName);
    
    res.json({
      modelName,
      available
    });
  } catch (error) {
    console.error('[Chat API] Error checking model availability:', error.message);
    res.status(500).json({
      error: `Failed to check model availability: ${error.message}`
    });
  }
});

/**
 * Check Ollama service health
 * GET /api/chat/ollama/health
 * Response: { healthy: boolean, message: string }
 */
router.get('/ollama/health', async (req, res) => {
  try {
    console.log('[Chat API] Checking Ollama health');
    const result = await ollamaModelManager.checkHealth();
    
    const statusCode = result.healthy ? 200 : 503;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('[Chat API] Error checking Ollama health:', error.message);
    res.status(500).json({
      healthy: false,
      message: `Error checking health: ${error.message}`
    });
  }
});

module.exports = router;
