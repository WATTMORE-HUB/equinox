/**
 * Two-tier chat client for Equinox
 * Tier 1: Fast fallback for simple questions (< 100ms)
 * Tier 2: Ollama LLM for complex questions
 */

const fs = require('fs');
const path = require('path');

// Cache path for monitoring data
const MONITORING_CACHE_PATH = '/collect_data/monitoring_cache.json';

// Ollama configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://ollama:11434';
const OLLAMA_MODEL = 'mistral';
const OLLAMA_TIMEOUT = 5000;

function loadMonitoringCache() {
  try {
    if (fs.existsSync(MONITORING_CACHE_PATH)) {
      const data = fs.readFileSync(MONITORING_CACHE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[LLM Client] Error loading cache:', error);
  }
  
  return {
    containers: {},
    errors_recent: [],
    warnings_recent: []
  };
}

function isSimpleQuestion(question) {
  const simple_keywords = ['how many', 'count', 'running', 'health', 'status', 'memory', 'cpu', 'error', 'warning', 'log'];
  const lower = question.toLowerCase();
  return simple_keywords.some(keyword => lower.includes(keyword));
}

function generateFallbackResponse(question) {
  const cache = loadMonitoringCache();
  const questionLower = question.toLowerCase();
  const containers = cache.containers || {};
  const errors = cache.errors_recent || [];
  const warnings = cache.warnings_recent || [];

  if (questionLower.includes('health') || questionLower.includes('status')) {
    if (!errors.length && !warnings.length) {
      return `[OK] System is healthy. ${Object.keys(containers).length} containers running.`;
    } else {
      return `[WARN] System has issues: ${errors.length} errors, ${warnings.length} warnings`;
    }
  }

  if (questionLower.includes('container') || questionLower.includes('service')) {
    const names = Object.keys(containers).join(', ');
    return `Currently running ${Object.keys(containers).length} containers: ${names || 'none'}`;
  }

  if (questionLower.includes('memory') || questionLower.includes('ram')) {
    let response = 'Memory Usage:\n';
    for (const [name, data] of Object.entries(containers)) {
      response += `  ${name}: ${data.memory_usage || 'N/A'} (${data.memory_percent || 'N/A'})\n`;
    }
    return response;
  }

  if (questionLower.includes('cpu') || questionLower.includes('processor')) {
    let response = 'CPU Usage:\n';
    for (const [name, data] of Object.entries(containers)) {
      response += `  ${name}: ${data.cpu_percent || 'N/A'}\n`;
    }
    return response;
  }

  if (questionLower.includes('error') || questionLower.includes('log')) {
    if (errors.length > 0) {
      let response = `Found ${errors.length} errors:\n\n`;
      errors.slice(0, 5).forEach((e, i) => {
        response += `[ERROR ${i + 1}] ${e}\n`;
      });
      return response.trim();
    } else if (warnings.length > 0) {
      let response = `No errors detected, but found ${warnings.length} warnings:\n\n`;
      warnings.slice(0, 3).forEach((w, i) => {
        response += `[WARN ${i + 1}] ${w}\n`;
      });
      return response.trim();
    } else {
      return 'No recent errors or warnings detected.';
    }
  }

  return `System overview: ${Object.keys(containers).length} containers running. Errors: ${errors.length}, Warnings: ${warnings.length}`;
}

function constructContext() {
  const cache = loadMonitoringCache();
  
  let context = 'Current System Status:\n';
  const containers = cache.containers || {};
  context += `Containers Running: ${Object.keys(containers).length}\n`;
  
  if (Object.keys(containers).length > 0) {
    context += '\nContainer Details:\n';
    for (const [name, data] of Object.entries(containers)) {
      const status = data.status || 'unknown';
      const cpu = data.cpu_percent || 'N/A';
      const mem = data.memory_percent || 'N/A';
      context += `  - ${name}: ${status} (CPU: ${cpu}, Memory: ${mem})\n`;
    }
  }
  
  const errors = cache.errors_recent || [];
  if (errors.length > 0) {
    context += `\nRecent Errors (${errors.length}):\n`;
    errors.slice(0, 5).forEach(e => {
      context += `  - ${e}\n`;
    });
  }
  
  const warnings = cache.warnings_recent || [];
  if (warnings.length > 0) {
    context += `\nRecent Warnings (${warnings.length}):\n`;
    warnings.slice(0, 5).forEach(w => {
      context += `  - ${w}\n`;
    });
  }
  
  return context;
}

async function queryOllama(question, context) {
  try {
    console.log('[LLM Client] Querying Ollama...');
    
    const prompt = `You are a helpful system monitoring assistant. Based on the following system status, answer the user's question concisely.\n\nSystem Status:\n${context}\n\nUser Question: ${question}\n\nAnswer:`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
    
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.7
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.warn('[LLM Client] Ollama API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.response || null;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('[LLM Client] Ollama query timed out');
    } else {
      console.warn('[LLM Client] Ollama query failed:', error.message);
    }
    return null;
  }
}

async function query(question) {
  try {
    if (isSimpleQuestion(question)) {
      console.log('[LLM Client] Using fallback for simple question');
      return generateFallbackResponse(question);
    }
    
    console.log('[LLM Client] Using Ollama for complex question');
    const context = constructContext();
    const ollamaResponse = await queryOllama(question, context);
    
    if (ollamaResponse) {
      return ollamaResponse.trim();
    }
    
    console.log('[LLM Client] Ollama unavailable, using fallback');
    return generateFallbackResponse(question);
  } catch (error) {
    console.error('[LLM Client] Error:', error);
    return generateFallbackResponse(question);
  }
}

module.exports = {
  query,
  generateFallbackResponse,
  constructContext,
  loadMonitoringCache,
  isSimpleQuestion
};
