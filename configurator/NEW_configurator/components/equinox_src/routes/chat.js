const express = require('express');
const multer = require('multer');
const llmClient = require('../services/llmClientNode');
const balenaTokenManager = require('../services/balenaTokenManager');
const { applyEnvironmentVariablesFromCSV } = require('../utils/envVarHelper');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
 * Upload and apply environment variables from CSV
 * POST /api/chat/upload-env-variables
 * Body: FormData with csvFile
 * Response: { variablesSet: number, appliedVariables: object, errors?: string[] }
 */
router.post('/upload-env-variables', upload.single('csvFile'), async (req, res) => {
  const csvFile = req.file;
  
  console.log('[Chat API] Environment variables upload endpoint called');

  if (!csvFile) {
    console.log('[Chat API] No CSV file provided');
    return res.status(400).json({ error: 'CSV file is required' });
  }

  try {
    // Lazy load token on demand - allows token to be loaded from secure storage even in Monitor mode
    const balenaToken = await balenaTokenManager.ensureToken();
    if (!balenaToken) {
      return res.status(503).json({ error: 'Balena token not configured on server' });
    }

    // Get device UUID from environment (set by Balena supervisor)
    const deviceUuid = process.env.BALENA_DEVICE_UUID;
    if (!deviceUuid) {
      return res.status(400).json({ error: 'Device UUID not available. This endpoint must run on a Balena device.' });
    }
    // Apply environment variables via Balena API
    console.log('[Chat API] Applying variables via Balena API...');
    const result = await applyEnvironmentVariablesFromCSV(csvFile.buffer, balenaToken, deviceUuid);

    console.log(`[Chat API] Successfully applied ${result.count} variables`);
    res.json({
      variablesSet: result.count,
      appliedVariables: result.appliedVariables,
      message: `Successfully applied ${result.count} environment variable(s). Changes will take effect after service restart.`
    });
  } catch (error) {
    console.error('[Chat API] Error uploading env variables:', error.message);
    console.error('[Chat API] Stack trace:', error.stack);
    // Make sure we always return valid JSON
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to apply environment variables: ${error.message}` });
    }
  }
});

module.exports = router;
