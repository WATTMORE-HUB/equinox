/**
 * Ollama Model Manager
 * Handles pulling models from Ollama registry and verifying availability
 */
console.log('[OllamaModelManager] Module loaded');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://ollama:11434';
const OLLAMA_PULL_TIMEOUT = 120000; // 2 minutes for model pull

console.log(`[OllamaModelManager] Using Ollama host: ${OLLAMA_HOST}`);

/**
 * Check if a model is available in Ollama
 * @param {string} modelName - Model name to check (e.g., 'mistral', 'phi')
 * @returns {Promise<boolean>} True if model is available
 */
async function isModelAvailable(modelName) {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      console.warn(`[OllamaModelManager] Failed to fetch tags: ${response.status}`);
      return false;
    }

    const data = await response.json();
    const models = data.models || [];
    const modelNames = models.map(m => m.name.split(':')[0]);

    const isAvailable = modelNames.includes(modelName);
    console.log(`[OllamaModelManager] Model '${modelName}' available: ${isAvailable}`);
    return isAvailable;
  } catch (error) {
    console.error(`[OllamaModelManager] Error checking model availability:`, error.message);
    return false;
  }
}

/**
 * Pull a model from Ollama registry
 * @param {string} modelName - Model name to pull (e.g., 'mistral')
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function pullModel(modelName) {
  try {
    console.log(`[OllamaModelManager] Starting pull of model: ${modelName}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_PULL_TIMEOUT);

    const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    console.log(`[OllamaModelManager] Pull request sent for ${modelName}, response status: ${response.status}`);

    if (!response.ok) {
      console.error(`[OllamaModelManager] Pull failed with status ${response.status}`);
      return {
        success: false,
        message: `Failed to pull model: HTTP ${response.status}`
      };
    }

    // Stream the response to track progress
    let lastMessage = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          lastMessage = data.status || '';
          if (lastMessage) {
            console.log(`[OllamaModelManager] Pull status for ${modelName}: ${lastMessage}`);
          }
          if (data.digest) {
            console.log(`[OllamaModelManager] Pull progress: ${lastMessage}`);
          }
        } catch (e) {
          // Not JSON, skip
        }
      }
    }

    console.log(`[OllamaModelManager] Pull complete for ${modelName}`);
    console.log(`[OllamaModelManager] Verifying pulled model: ${modelName}`);

    // Verify model was actually pulled
    const isAvailable = await isModelAvailable(modelName);
    if (isAvailable) {
      console.log(`[OllamaModelManager] Verification succeeded for ${modelName}`);
      return {
        success: true,
        message: `Successfully pulled and verified '${modelName}' model`
      };
    } else {
      console.warn(`[OllamaModelManager] Verification failed for ${modelName}`);
      return {
        success: false,
        message: `Model '${modelName}' was pulled but verification failed`
      };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[OllamaModelManager] Pull timeout for ${modelName}`);
      return {
        success: false,
        message: `Model pull timed out after 2 minutes`
      };
    }
    console.error(`[OllamaModelManager] Error pulling model:`, error.message);
    return {
      success: false,
      message: `Error pulling model: ${error.message}`
    };
  }
}

/**
 * Get list of all available models
 * @returns {Promise<{models: Array, error?: string}>}
 */
async function listModels() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      return {
        models: [],
        error: `Failed to fetch models: HTTP ${response.status}`
      };
    }

    const data = await response.json();
    const models = (data.models || []).map(m => ({
      name: m.name,
      family: m.family,
      modifiedAt: m.modified_at,
      size: m.size
    }));

    return { models };
  } catch (error) {
    console.error(`[OllamaModelManager] Error listing models:`, error.message);
    return {
      models: [],
      error: error.message
    };
  }
}

/**
 * Check Ollama service health
 * @returns {Promise<{healthy: boolean, message: string}>}
 */
async function checkHealth() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      return {
        healthy: true,
        message: 'Ollama is running and responding'
      };
    } else {
      return {
        healthy: false,
        message: `Ollama returned HTTP ${response.status}`
      };
    }
  } catch (error) {
    return {
      healthy: false,
      message: `Ollama is not reachable: ${error.message}`
    };
  }
}

module.exports = {
  isModelAvailable,
  pullModel,
  listModels,
  checkHealth
};
