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

// Supported data directories for file viewing (Equinox Monitor)
const SUPPORTED_DIRECTORIES = {
  'tracker': '/collect_data/tracker',
  'meter': '/collect_data/meter',
  'inverter': '/collect_data/inverter',
  'weather': '/collect_data/weather',
  'recloser': '/collect_data/recloser'
};

// Special marker to indicate file content response
const FILE_CONTENT_MARKER = '__EQUINOX_FILE_CONTENT__';
const FILE_BODY_MARKER = '__EQUINOX_FILE_BODY__';

// Special marker to indicate environment variables upload needed
const ENV_UPLOAD_MARKER = '__EQUINOX_ENV_UPLOAD__';

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
  const lower = question.toLowerCase();
  const simplePatterns = [
    /^how many containers\b/,
    /^how many errors\b/,
    /^how many warnings\b/,
    /^count containers\b/,
    /^count errors\b/,
    /^count warnings\b/,
    /^what containers are running\b/,
    /^list running containers\b/,
    /^are there any errors\b/,
    /^are there any warnings\b/
  ];
  return simplePatterns.some((pattern) => pattern.test(lower));
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

function parseRequestedDirectory(question) {
  const lower = question.toLowerCase();

  for (const directoryName of Object.keys(SUPPORTED_DIRECTORIES)) {
    if (lower.includes(`/${directoryName}`) || lower.includes(` ${directoryName}`) || lower.endsWith(directoryName)) {
      return directoryName;
    }
  }

  return null;
}

function isLatestFileQuestion(question) {
  const lower = question.toLowerCase();
  const asksForFile = lower.includes('file') || lower.includes('payload') || lower.includes('json') || lower.includes('contents');
  const asksForLatest = lower.includes('latest') || lower.includes('recent') || lower.includes('newest') || lower.includes('most recent');
  const requestedDirectory = parseRequestedDirectory(question);

  return Boolean(requestedDirectory && asksForFile && asksForLatest);
}

function isSystemHealthQuestion(question) {
  const lower = question.toLowerCase();
  const healthKeywords = [
    'system report',
    'holistic',
    'how is my system',
    'system doing',
    'overall health',
    'complete picture',
    'full status',
    'everything status'
  ];
  return healthKeywords.some(keyword => lower.includes(keyword));
}

function buildSystemHealthResponse() {
  const metadata = JSON.stringify({
    instruction: 'system_health_report',
    description: 'Generate comprehensive system health report'
  });
  return `__EQUINOX_SYSTEM_REPORT__\n${metadata}`;
}

function isEnvironmentVariablesQuestion(question) {
  const lower = question.toLowerCase();
  const envKeywords = [
    'environment variable',
    'env var',
    'env variable',
    'environment variables',
    'env variables',
    'env vars',
    'set variable',
    'set env',
    'update variable',
    'update env',
    'change variable',
    'change env'
  ];
  return envKeywords.some(keyword => lower.includes(keyword));
}

function isModelDownloadQuestion(question) {
  const lower = question.toLowerCase();
  const modelKeywords = [
    'download model',
    'pull model',
    'get model',
    'fetch model',
    'download ollama',
    'pull ollama',
    'install model',
    'load model',
    'download mistral',
    'pull mistral'
  ];
  return modelKeywords.some(keyword => lower.includes(keyword));
}

function isSoftwareUpdateQuestion(question) {
  const lower = question.toLowerCase();
  const updateKeywords = [
    'pull latest software',
    'update software',
    'deploy latest',
    'redeploy',
    'new deployment',
    'push latest',
    'fetch latest code',
    'reload code',
    'restart deployment',
    'deploy new version'
  ];
  return updateKeywords.some(keyword => lower.includes(keyword));
}

function buildSoftwareUpdateResponse() {
  const metadata = JSON.stringify({
    instruction: 'trigger_redeploy',
    description: 'Pull latest software and trigger Balena deployment'
  });
  return `__EQUINOX_REDEPLOY__\n${metadata}`;
}

function buildModelDownloadResponse() {
  const metadata = JSON.stringify({
    instruction: 'download_ollama_model',
    description: 'Download and cache the Ollama mistral model'
  });
  return `__EQUINOX_DOWNLOAD_MODEL__\n${metadata}`;
}

function buildEnvironmentVariablesResponse() {
  const metadata = JSON.stringify({
    instruction: 'upload_environment_variables',
    description: 'Upload a CSV file with environment variables to update'
  });
  return `${ENV_UPLOAD_MARKER}\n${metadata}`;
}

function getLatestFileInfo(directoryPath) {
  try {
    if (!fs.existsSync(directoryPath)) {
      return { error: `I couldn't find ${directoryPath} on this device.` };
    }

    const files = fs.readdirSync(directoryPath)
      .map((name) => {
        const fullPath = path.join(directoryPath, name);
        const stats = fs.statSync(fullPath);
        return { name, fullPath, stats };
      })
      .filter((entry) => entry.stats.isFile())
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

    if (!files.length) {
      return { error: `I couldn't find any files in ${directoryPath}.` };
    }

    return {
      name: files[0].name,
      fullPath: files[0].fullPath,
      modified: files[0].stats.mtime.toISOString()
    };
  } catch (error) {
    return { error: `I couldn't inspect ${directoryPath}: ${error.message}` };
  }
}

function buildFileContentResponse(directoryName) {
  const directoryPath = SUPPORTED_DIRECTORIES[directoryName];
  if (!directoryPath) {
    return `I can only read the latest file in /${Object.keys(SUPPORTED_DIRECTORIES).join(', /')}.`;
  }

  const latestFile = getLatestFileInfo(directoryPath);
  if (latestFile.error) {
    return latestFile.error;
  }

  try {
    const rawContent = fs.readFileSync(latestFile.fullPath, 'utf8');
    let formattedContent = rawContent;

    try {
      formattedContent = JSON.stringify(JSON.parse(rawContent), null, 2);
    } catch (error) {
      formattedContent = rawContent;
    }

    const metadata = JSON.stringify({
      directory: `/${directoryName}`,
      fileName: latestFile.name,
      filePath: latestFile.fullPath,
      modified: latestFile.modified
    });

    return `${FILE_CONTENT_MARKER}\n${metadata}\n${FILE_BODY_MARKER}\n${formattedContent}`;
  } catch (error) {
    return `I found the latest file in /${directoryName}, but I couldn't read it: ${error.message}`;
  }
}

function generateFallbackResponse(question) {
  const cache = loadMonitoringCache();
  const questionLower = question.toLowerCase();
  const containers = cache.containers || {};
  const errors = cache.errors_recent || [];
  const warnings = cache.warnings_recent || [];
  const containerCount = Object.keys(containers).length;

  if (isModelDownloadQuestion(question)) {
    return buildModelDownloadResponse();
  }

  if (isSystemHealthQuestion(question)) {
    return buildSystemHealthResponse();
  }

  if (isEnvironmentVariablesQuestion(question)) {
    return buildEnvironmentVariablesResponse();
  }

  if (isLatestFileQuestion(question)) {
    return buildFileContentResponse(parseRequestedDirectory(question));
  }

  if (questionLower.includes('health') || questionLower.includes('status')) {
    if (!errors.length && !warnings.length) {
      return `I see ${pluralize(containerCount, 'container')} running with no recent errors or warnings. Everything looks good.`;
    }
    const errorText = errors.length > 0 ? `${pluralize(errors.length, 'error')}` : 'no errors';
    const warningText = warnings.length > 0 ? `${pluralize(warnings.length, 'warning')}` : 'no warnings';
    return `${pluralize(containerCount, 'container')} running. I found ${errorText} and ${warningText} in recent activity.`;
  }

  if (questionLower.includes('container') || questionLower.includes('service')) {
    if (!containerCount) {
      return 'No containers are running at the moment.';
    }
    const names = Object.keys(containers).join(', ');
    return `I see ${pluralize(containerCount, 'container')} running: ${names}.`;
  }

  if (questionLower.includes('memory') || questionLower.includes('ram')) {
    if (!containerCount) {
      return 'No containers are running, so I have no memory data to share.';
    }
    const lines = [];
    for (const [name, data] of Object.entries(containers)) {
      const usage = data.memory_usage || 'unavailable';
      const percent = data.memory_percent || 'N/A';
      lines.push(`${name}: ${usage} (${percent})`);
    }
    return `Memory usage: ${lines.join(', ')}`;
  }

  if (questionLower.includes('cpu') || questionLower.includes('processor')) {
    if (!containerCount) {
      return 'No containers are running, so I have no CPU data to share.';
    }
    const cpuData = [];
    for (const [name, data] of Object.entries(containers)) {
      const cpu = data.cpu_percent || 'N/A';
      cpuData.push(`${name}: ${cpu}`);
    }
    return `CPU usage: ${cpuData.join(', ')}`;
  }

  if (questionLower.includes('error') || questionLower.includes('log')) {
    if (errors.length > 0) {
      const lastFiveErrors = errors.slice(-5);
      return formatGroupedMessages(
        `I found ${pluralize(errors.length, 'error')} total. Here are the most recent:`,
        lastFiveErrors,
        'unknown'
      );
    }
    if (warnings.length > 0) {
      const lastFiveWarnings = warnings.slice(-5);
      return formatGroupedMessages(
        `No errors found. I did see ${pluralize(warnings.length, 'warning')} warnings:`,
        lastFiveWarnings,
        'unknown'
      );
    }
    return 'No recent errors or warnings.';
  }

  if (questionLower.includes('warning') || questionLower.includes('warn')) {
    if (warnings.length > 0) {
      const lastFiveWarnings = warnings.slice(-5);
      return formatGroupedMessages(
        `I found ${pluralize(warnings.length, 'warning')} total. Here are the most recent:`,
        lastFiveWarnings,
        'unknown'
      );
    }
    return 'No warnings detected.';
  }

  if (questionLower.includes('file') || questionLower.includes('write') || questionLower.includes('data')) {
    const fileActivity = cache.file_activity || {};
    const activeServices = [];
    const idleServices = [];

    Object.entries(fileActivity).forEach(([service, info]) => {
      if (info.status === 'writing') {
        activeServices.push(`${service} writing (${info.count} new of ${info.total_files} total)`);
      } else if (info.status === 'idle') {
        idleServices.push(`${service} idle (${info.count} files)`);
      }
    });

    if (activeServices.length === 0 && idleServices.length === 0) {
      return 'I don\'t see any monitored data directories at the moment.';
    }

    const parts = [];
    if (activeServices.length > 0) {
      parts.push(`Writing: ${activeServices.join(', ')}`);
    }
    if (idleServices.length > 0) {
      parts.push(`Idle: ${idleServices.join(', ')}`);
    }
    return `File activity: ${parts.join('. ')}.`;
  }

  return `I see ${pluralize(containerCount, 'container')} running with ${pluralize(errors.length, 'error')} and ${pluralize(warnings.length, 'warning')} in recent activity.`;
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

  const fileActivity = cache.file_activity || {};
  const activeDirectories = Object.entries(fileActivity).map(([name, info]) => {
    const status = info.status || 'unknown';
    const freshness = info.most_recent_age_human || 'unknown';
    return `  - ${name}: ${status}, latest file ${freshness}`;
  });

  if (activeDirectories.length > 0) {
    context += '\nMonitored Directories:\n';
    activeDirectories.forEach((line) => {
      context += `${line}\n`;
    });
  }

  context += `\nSupported latest-file directories: ${Object.keys(SUPPORTED_DIRECTORIES).map((dir) => `/${dir}`).join(', ')}\n`;

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
If the user asks for something outside the available data, say so plainly and briefly redirect them to the kinds of questions you can answer, such as:
- container status
- recent errors or warnings
- CPU and memory usage
- file activity in monitored directories
- latest JSON/file contents from supported directories
- full system health reports

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
    console.log(`[LLM Client] query() called with: "${question}"`);
    console.log(`[LLM Client] isSoftwareUpdateQuestion result: ${isSoftwareUpdateQuestion(question)}`);
    console.log(`[LLM Client] isModelDownloadQuestion result: ${isModelDownloadQuestion(question)}`);
    
    // Check for software update requests (highest priority)
    if (isSoftwareUpdateQuestion(question)) {
      console.log('[LLM Client] Software update/redeploy request detected');
      return buildSoftwareUpdateResponse();
    }

    // Check for model download requests (second priority)
    if (isModelDownloadQuestion(question)) {
      console.log('[LLM Client] Model download request detected');
      return buildModelDownloadResponse();
    }

    // Check for environment variables questions (these always use fallback)
    if (isEnvironmentVariablesQuestion(question)) {
      console.log('[LLM Client] Using fallback for environment variables question');
      return generateFallbackResponse(question);
    }

    // Check for system health questions
    if (isSystemHealthQuestion(question)) {
      console.log('[LLM Client] System health question detected');
      return buildSystemHealthResponse();
    }

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
