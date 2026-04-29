/**
 * Node.js wrapper for Python LLM client
 * Communicates via HTTP to the llm_client service
 */

const fs = require('fs');
const path = require('path');

// Cache path for monitoring data
const MONITORING_CACHE_PATH = '/collect_data/monitoring_cache.json';

// Supported data directories for file viewing
const SUPPORTED_DIRECTORIES = {
  'tracker': '/collect_data/tracker',
  'meter': '/collect_data/meter',
  'inverter': '/collect_data/inverter',
  'weather': '/collect_data/weather',
  'recloser': '/collect_data/recloser'
};

const FILE_CONTENT_MARKER = '__EQUINOX_FILE_CONTENT__';
const FILE_BODY_MARKER = '__EQUINOX_FILE_BODY__';

/**
 * Load the latest monitoring cache
 */
function loadMonitoringCache() {
  try {
    if (fs.existsSync(MONITORING_CACHE_PATH)) {
      const data = fs.readFileSync(MONITORING_CACHE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[LLM Client Node] Error loading cache:', error);
  }
  
  return {
    containers: {},
    errors_recent: [],
    warnings_recent: []
  };
}

/**
 * Generate a rule-based response (fallback)
 */
function generateFallbackResponse(question) {
  const cache = loadMonitoringCache();
  const questionLower = question.toLowerCase();
  const containers = cache.containers || {};
  const errors = cache.errors_recent || [];
  const warnings = cache.warnings_recent || [];

  // Health check
  if (questionLower.includes('health') || questionLower.includes('status')) {
    if (!errors.length && !warnings.length) {
      return `✓ System is healthy. ${Object.keys(containers).length} containers running.`;
    } else {
      return `⚠ System has issues: ${errors.length} errors, ${warnings.length} warnings`;
    }
  }

  // Container count
  if (questionLower.includes('container') || questionLower.includes('service')) {
    const names = Object.keys(containers).join(', ');
    return `Currently running ${Object.keys(containers).length} containers: ${names || 'none'}`;
  }

  // Memory check
  if (questionLower.includes('memory') || questionLower.includes('ram')) {
    let response = 'Memory Usage:\n';
    for (const [name, data] of Object.entries(containers)) {
      response += `  ${name}: ${data.memory_usage || 'N/A'} (${data.memory_percent || 'N/A'})\n`;
    }
    return response;
  }

  // CPU check
  if (questionLower.includes('cpu') || questionLower.includes('processor')) {
    let response = 'CPU Usage:\n';
    for (const [name, data] of Object.entries(containers)) {
      response += `  ${name}: ${data.cpu_percent || 'N/A'}\n`;
    }
    return response;
  }

  // Errors
  if (questionLower.includes('error')) {
    if (errors.length > 0) {
      return `Found ${errors.length} errors:\n${errors.slice(0, 3).join('\n')}`;
    } else {
      return 'No recent errors detected.';
    }
  }

  // Default response
  return `System overview: ${Object.keys(containers).length} containers running. Errors: ${errors.length}, Warnings: ${warnings.length}`;
}

/**
 * Construct context string from monitoring data
 */
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

/**
 * Query the LLM
 * Since we're in Node.js, we'll use the fallback mechanism for now
 * In production, this could call a Python service or HTTP endpoint
 */
async function query(question) {
  try {
    // For now, use intelligent fallback
    // In a full implementation, this would call ollama via HTTP
    // E.g., const response = await fetch('http://ollama:11434/api/generate', {...})
    
    const context = constructContext();
    const isSensibleQuestion = ['health', 'status', 'container', 'memory', 'cpu', 'error', 'warning', 'logs'].some(
      keyword => question.toLowerCase().includes(keyword)
    );
    
    if (!isSensibleQuestion) {
      // Still try to be helpful
      return generateFallbackResponse(question);
    }
    
    // Generate smart response based on context
    return generateFallbackResponse(question);
  } catch (error) {
    console.error('[LLM Client Node] Error:', error);
    return generateFallbackResponse(question);
  }
}

module.exports = {
  query,
  generateFallbackResponse,
  constructContext,
  loadMonitoringCache
};
