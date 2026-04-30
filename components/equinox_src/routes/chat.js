const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const llmClient = require('../services/llmClientNode');
const BalenaApiHelper = require('../services/balenaApiHelper');
const balenaTokenManager = require('../services/balenaTokenManager');

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
  let csvFile;
  try {
    csvFile = req.file;
    console.log('[Chat API] Environment variables upload endpoint called');

    if (!csvFile) {
      console.log('[Chat API] No CSV file provided');
      return res.status(400).json({ error: 'CSV file is required' });
    }

    // Lazy load token on demand - allows token to be loaded from secure storage even in Monitor mode
    console.log('[Chat API] Loading Balena token...');
    const balenaToken = await balenaTokenManager.ensureToken();
    console.log(`[Chat API] Token available: ${!!balenaToken}`);
    
    if (!balenaToken) {
      return res.status(503).json({ error: 'Balena token not configured on server' });
    }

    // Get device UUID from environment (set by Balena supervisor)
    const deviceUuid = process.env.BALENA_DEVICE_UUID;
    console.log(`[Chat API] Device UUID: ${deviceUuid}`);
    
    if (!deviceUuid) {
      return res.status(400).json({ error: 'Device UUID not available. This endpoint must run on a Balena device.' });
    }

    // Parse CSV
    console.log('[Chat API] Parsing CSV file...');
    const variables = {};
    await new Promise((resolve, reject) => {
      Readable.from([csvFile.buffer.toString()])
        .pipe(csv())
        .on('data', (row) => {
          const key = Object.keys(row)[0];
          const value = Object.values(row)[0];
          if (key && value) {
            variables[key] = value;
            console.log(`[Chat API] Parsed: ${key}=${value}`);
          }
        })
        .on('error', reject)
        .on('end', resolve);
    });

    console.log(`[Chat API] Parsed ${Object.keys(variables).length} variables`);
    
    if (Object.keys(variables).length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has no valid KEY,VALUE pairs' });
    }

    // Apply environment variables via Balena API
    console.log('[Chat API] Applying variables via Balena API...');
    const balenaHelper = new BalenaApiHelper(balenaToken);
    const results = await balenaHelper.setDeviceEnvVars(deviceUuid, variables);
    console.log(`[Chat API] Applied ${results.length} variables successfully`);

    return res.json({
      variablesSet: results.length,
      appliedVariables: Object.keys(variables),
      message: `Successfully applied ${results.length} environment variable(s). Changes will take effect after service restart.`
    });
  } catch (error) {
    console.error('[Chat API] Caught error:', error.message || error);
    console.error('[Chat API] Error type:', error.constructor.name);
    console.error('[Chat API] Stack:', error.stack);
    
    // Always return valid JSON error response
    try {
      if (!res.headersSent) {
        return res.status(500).json({ error: `Failed to process upload: ${error.message || 'Unknown error'}` });
      }
    } catch (responseError) {
      console.error('[Chat API] Failed to send error response:', responseError.message);
    }
  }
});

module.exports = router;
