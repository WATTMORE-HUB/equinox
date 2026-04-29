/**
 * Two-tier chat client for Equinox
 * Tier 1: Fast fallback for simple questions (< 100ms)
 * Tier 2: Ollama LLM for complex questions
 */

const fs = require('fs');

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
  const simpleKeywords = ['how many', 'count', 'running', 'health', 'status', 'memory', 'cpu', 'error', 'warning', 'log'];
  const lower = question.toLowerCase();
  return simpleKeywords.some(keyword => lower.includes(keyword));
}

function pluralize(count, singular, plural = null) {
  return `${count} ${count === 1 ? singular : (plural || `${singular}s`)}`;
}

function groupMessagesByContainer(messages, fallbackLabel) {
  const grouped = {};

  messages.forEach((message) => {
    const text = String(message || '').trim();
    const containerMatch = text.match(/^\[([^\]]+)\]\s*(.*)$/);
    const container = containerMatch ? containerMatch[1] : fallbackLabel;
    const body = containerMatch ? containerMatch[2].trim() : text;

    if (!grouped[container]) {
      grouped[container] = [];
    }

    grouped[container].push(body || text);
  });

  return grouped;
}

function formatGroupedMessages(intro, messages, fallbackLabel) {
  const grouped = groupMessagesByContainer(messages, fallbackLabel);
  const sections = [intro];

  Object.entries(grouped).forEach(([container, entries]) => {
    sections.push('');
    sections.push(`${container}:`);
    entries.forEach((entry) => {
      sections.push(`  - ${entry}`);
    });
  });

  return sections.join('\n').trim();
}

function generateFallbackResponse(question) {
  const cache = loadMonitoringCache();
  const questionLower = question.toLowerCase();
  const containers = cache.containers || {};
  const errors = cache.errors_recent || [];
  const warnings = cache.warnings_recent || [];
  const containerCount = Object.keys(containers).length;

  if (questionLower.includes('health') || questionLower.includes('status')) {
    if (!errors.length && !warnings.length) {
      return `${pluralize(containerCount, 'container')} running. No recent errors or warnings.`;
    }
    return `${pluralize(containerCount, 'container')} running. ${pluralize(errors.length, 'error')} and ${pluralize(warnings.length, 'warning')} in the latest monitor window.`;
  }

  if (questionLower.includes('container') || questionLower.includes('service')) {
    const names = Object.keys(containers).join(', ');
    if (!containerCount) {
      return 'No containers are running.';
    }
    return `${pluralize(containerCount, 'container')} running: ${names}`;
  }

  if (questionLower.includes('memory') || questionLower.includes('ram')) {
    if (!containerCount) {
      return 'No containers are running.';
    }
    const lines = [`Memory across ${pluralize(containerCount, 'container')}:`];
    for (const [name, data] of Object.entries(containers)) {
      lines.push(`  - ${name}: ${data.memory_usage || 'N/A'} (${data.memory_percent || 'N/A'})`);
    }
    return lines.join('\n');
  }

  if (questionLower.includes('cpu') || questionLower.includes('processor')) {
    if (!containerCount) {
      return 'No containers are running.';
    }
    const lines = [`CPU across ${pluralize(containerCount, 'container')}:`];
    for (const [name, data] of Object.entries(containers)) {
      lines.push(`  - ${name}: ${data.cpu_percent || 'N/A'}`);
    }
    return lines.join('\n');
  }

  if (questionLower.includes('error') || questionLower.includes('log')) {
    if (errors.length > 0) {
      return formatGroupedMessages(
        `I found ${pluralize(errors.length, 'error')}. Here they are, grouped by container:`,
        errors,
        'unattributed'
      );
    }
    if (warnings.length > 0) {
      return formatGroupedMessages(
        `No recent errors. I did find ${pluralize(warnings.length, 'warning')}:`,
        warnings,
        'unattributed'
      );
    }
    return 'No recent errors or warnings detected.';
  }

  if (questionLower.includes('warning') || questionLower.includes('warn')) {
    if (warnings.length > 0) {
      return formatGroupedMessages(
        `I found ${pluralize(warnings.length, 'warning')}. Here they are, grouped by container:`,
        warnings,
        'unattributed'
      );
    }
    return 'No recent warnings detected.';
  }

  if (questionLower.includes('file') || questionLower.includes('write') || questionLower.includes('data')) {
    const fileActivity = cache.file_activity || {};
    const activeServices = [];
    const idleServices = [];

    Object.entries(fileActivity).forEach(([service, info]) => {
      if (info.status === 'writing') {
        activeServices.push(`${service}: ${info.count} new files (${info.total_files} total)`);
      } else if (info.status === 'idle') {
        idleServices.push(`${service}: ${info.count} files (idle)`);
      }
    });

    if (activeServices.length === 0 && idleServices.length === 0) {
      return 'No monitored data directories found on this device.';
    }

    let response = 'Here is the current file activity:';
    if (activeServices.length > 0) {
      response += `\n\nWriting:\n${activeServices.map(s => `  - ${s}`).join('\n')}`;
    }
    if (idleServices.length > 0) {
      response += `\n\nIdle:\n${idleServices.map(s => `  - ${s}`).join('\n')}`;
    }
    return response.trim();
  }

  return `${pluralize(containerCount, 'container')} running. ${pluralize(errors.length, 'error')} and ${pluralize(warnings.length, 'warning')} in the current monitor snapshot.`;
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

    const prompt = `You are a direct system monitoring assistant for Equinox.
Answer strictly from the provided system data.
Use a calm, human, operational tone.
Do not use filler or pleasantries such as "Good question", "Great question", "Happy to help", or "Let me check".
Do not sound like a generic chatbot.
Lead with the finding, not with commentary.
If there are multiple errors or warnings, group them by container when possible.
Prefer formats like:
- "I found 3 errors. Here they are, grouped by container:"
- "5 containers are running. The highest memory usage is ..."
- "No recent errors. I did find 2 warnings:"
Keep the response concise, specific, and tied to the data below.

System Status:
${context}

User Question: ${question}

Answer:`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.4
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
