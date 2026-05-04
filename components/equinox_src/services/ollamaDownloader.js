/**
 * Ollama Model Downloader
 * Ensures mistral model is available before chat queries
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://ollama:11434';
const OLLAMA_MODEL = 'mistral';
const logger = console;

let modelDownloadInProgress = false;
let modelDownloadPromise = null;

/**
 * Check if mistral model is available
 */
async function checkModelAvailable() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      timeout: 5000
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    const models = data.models || [];
    return models.some(m => m.name && m.name.includes('mistral'));
  } catch (error) {
    logger.debug('[Ollama Downloader] Error checking models:', error.message);
    return false;
  }
}

/**
 * Download mistral model using Ollama HTTP API
 */
async function downloadModel() {
  logger.info('[Ollama Downloader] Starting mistral model download via API...');

  const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: OLLAMA_MODEL,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama pull API returned ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  logger.info(`[Ollama Downloader] Pull response: ${JSON.stringify(data)}`);
  logger.info('[Ollama Downloader] Mistral model download complete');
  return true;
}

/**
 * Ensure mistral model is available (download if needed)
 * Only runs once, subsequent calls wait for the first to complete
 */
async function ensureModelAvailable() {
  // If download already in progress, wait for it
  if (modelDownloadInProgress) {
    logger.debug('[Ollama Downloader] Model download already in progress, waiting...');
    return modelDownloadPromise;
  }
  
  // Check if model is already available
  const available = await checkModelAvailable();
  if (available) {
    logger.info('[Ollama Downloader] Mistral model is available');
    return true;
  }
  
  // Start download
  modelDownloadInProgress = true;
  modelDownloadPromise = downloadModel()
    .catch(error => {
      logger.error('[Ollama Downloader] Failed to download model:', error);
      throw error;
    })
    .finally(() => {
      modelDownloadInProgress = false;
    });
  
  return modelDownloadPromise;
}

module.exports = {
  ensureModelAvailable,
  checkModelAvailable
};
