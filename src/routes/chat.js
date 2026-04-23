const express = require('express');
const llmClient = require('../services/llmClientNode');

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

  try {
    const answer = await llmClient.query(question);
    res.json({ answer });
  } catch (error) {
    console.error('[Chat API] Error:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

module.exports = router;
