/**
 * Intent Matcher for Equinox Chat
 * Normalizes user input, detects intent, and parses entities with fuzzy matching
 */

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const matrix = Array(bLower.length + 1)
    .fill(null)
    .map(() => Array(aLower.length + 1).fill(0));

  for (let i = 0; i <= aLower.length; i++) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= bLower.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= bLower.length; j++) {
    for (let i = 1; i <= aLower.length; i++) {
      const indicator = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  return matrix[bLower.length][aLower.length];
}

// Calculate similarity score (0 to 1, where 1 is identical)
function similarityScore(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// Find closest match using fuzzy matching
function fuzzyMatch(input, candidates, threshold = 0.6) {
  const scores = candidates.map((candidate) => ({
    candidate,
    score: similarityScore(input.toLowerCase(), candidate.toLowerCase())
  }));
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  return best.score >= threshold ? best : null;
}

// Intent definitions with aliases
const INTENTS = {
  system_health: {
    name: 'system_health',
    aliases: [
      'system_health',
      'how is my system',
      'system doing',
      'overall health',
      'complete picture',
      'full status',
      'everything status',
      'system report',
      'holistic',
      'system status',
      'health check',
      'give me a report',
      'what is my status',
      'how things looking',
      'system overview'
    ]
  },
  list_containers: {
    name: 'list_containers',
    aliases: [
      'what containers are running',
      'list running containers',
      'list containers',
      'list_containers',
      'running services',
      'active containers',
      'what services',
      'containers running',
      'show containers',
      'show me containers',
      'what is running',
      'show services',
      'list services'
    ]
  },
  check_errors: {
    name: 'check_errors',
    aliases: [
      'are there any errors',
      'show me errors',
      'what went wrong',
      'errors',
      'check errors',
      'recent errors',
      'error log',
      'any errors',
      'what failed',
      'got any errors',
      'show errors',
      'did anything fail',
      'something break'
    ]
  },
  check_warnings: {
    name: 'check_warnings',
    aliases: [
      'are there any warnings',
      'show me warnings',
      'any warnings',
      'warnings',
      'check warnings',
      'recent warnings',
      'warn',
      'got any warnings',
      'show warnings',
      'any issues'
    ]
  },
  check_memory: {
    name: 'check_memory',
    aliases: [
      'how much memory',
      'memory usage',
      'memory',
      'ram usage',
      'memory stats',
      'what\'s using memory',
      'memory consumption',
      'memory report',
      'how much ram',
      'ram stats'
    ]
  },
  check_cpu: {
    name: 'check_cpu',
    aliases: [
      'cpu usage',
      'cpu',
      'processor usage',
      'cpu stats',
      'what\'s using cpu',
      'cpu consumption',
      'cpu percent',
      'cpu report',
      'processor stats',
      'how much cpu'
    ]
  },
  get_latest_file: {
    name: 'get_latest_file',
    aliases: [
      'show me latest',
      'latest file',
      'latest data',
      'recent file',
      'what\'s in',
      'show latest',
      'get latest',
      'fetch latest',
      'recent data',
      'last file'
    ]
  },
  check_data_flow: {
    name: 'check_data_flow',
    aliases: [
      'is data being uploaded',
      'is data being pushed',
      'is data being pushed up',
      'data flowing',
      'data reaching',
      'data getting to',
      'check data',
      'check_data_flow',
      'is data uploaded',
      'data flow',
      'cloud upload',
      'is stuff getting up there',
      'is data going up',
      'is data making it',
      'check if data',
      'check data uploads',
      'data freshness',
      'when was data',
      'last data'
    ]
  },
  redeploy: {
    name: 'redeploy',
    aliases: [
      'redeploy',
      'pull latest software',
      'update software',
      'deploy latest',
      'new deployment',
      'push latest',
      'fetch latest code',
      'reload code',
      'restart deployment',
      'deploy',
      'pull latest',
      'update code',
      'restart',
      'reload',
      'new code'
    ]
  },
  environment_variables: {
    name: 'environment_variables',
    aliases: [
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
      'change env',
      'configure env',
      'update config',
      'env config'
    ]
  },
  help: {
    name: 'help',
    aliases: [
      'help',
      'what can you do',
      'what can i ask',
      'what can i use this for',
      'show capabilities',
      'capabilities',
      'commands',
      'guide',
      'tutorial',
      'how do i',
      'help me',
      'show help',
      'available commands',
      'what do you do',
      'what can we do'
    ]
  },
  modbus_test: {
    name: 'modbus_test',
    aliases: [
      'test register',
      'test modbus',
      'modbus test',
      'read register',
      'query register',
      'test hex register',
      'test decimal register',
      'test modbus register',
      'check register',
      'poll register',
      'read modbus',
      'modbus read',
      'modbus query',
      'register test',
      'test a register',
      'query a register',
      'read a register'
    ]
  },
  modbus_write: {
    name: 'modbus_write',
    aliases: [
      'write register',
      'write to register',
      'write modbus',
      'modbus write',
      'set register',
      'set modbus',
      'write hex register',
      'write decimal register',
      'write modbus register',
      'change register',
      'update register',
      'write to modbus',
      'register write',
      'write a register'
    ]
  }
};

/**
 * Match intent from user input
 * Returns { intent, confidence, entities }
 */
function matchIntent(question) {
  const normalized = question.trim().toLowerCase();

  // Check for exact keyword matches first
  for (const [, intentDef] of Object.entries(INTENTS)) {
    for (const alias of intentDef.aliases) {
      if (normalized.includes(alias.toLowerCase())) {
        return {
          intent: intentDef.name,
          confidence: 1.0,
          matched_phrase: alias,
          entities: parseEntities(question, intentDef.name)
        };
      }
    }
  }

  // Fuzzy match against all aliases
  const allAliases = [];
  const aliasToIntent = {};
  for (const [, intentDef] of Object.entries(INTENTS)) {
    for (const alias of intentDef.aliases) {
      allAliases.push(alias);
      aliasToIntent[alias] = intentDef.name;
    }
  }

  const bestMatch = fuzzyMatch(normalized, allAliases, 0.6);
  if (bestMatch) {
    const intentName = aliasToIntent[bestMatch.candidate];
    return {
      intent: intentName,
      confidence: bestMatch.score,
      matched_phrase: bestMatch.candidate,
      entities: parseEntities(question, intentName)
    };
  }

  return {
    intent: null,
    confidence: 0,
    matched_phrase: null,
    entities: {}
  };
}

/**
 * Parse entities from the question based on intent
 */
function parseEntities(question, intent) {
  const entities = {};
  const lower = question.toLowerCase();

  // Parse timespan for data flow checks
  if (intent === 'check_data_flow') {
    const timespan = parseTimespan(question);
    if (timespan) {
      entities.timespan = timespan;
    }
  }

  // Parse directory for file queries
  if (intent === 'get_latest_file') {
    const dirs = ['tracker', 'meter', 'inverter', 'weather', 'recloser'];
    for (const dir of dirs) {
      // Match: /meter, meter, latest meter, etc.
      if (lower.includes(`/${dir}`) || lower.includes(` ${dir}`) || lower.endsWith(dir) || lower.includes(`latest ${dir}`)) {
        entities.directory = dir;
        break;
      }
    }
  }

  // Modbus test parameters are handled by form UI, no extraction needed here

  return entities;
}

/**
 * Parse timespan from question (e.g., "5 minutes", "10 min", "half hour", "5")
 * Returns milliseconds or null
 * Bare numbers default to minutes
 */
function parseTimespan(timespanStr) {
  const normalized = timespanStr.toLowerCase().trim();

  // Handle special cases
  if (normalized.includes('half hour')) return 30 * 60 * 1000;
  if (normalized.includes('quarter hour')) return 15 * 60 * 1000;

  // Extract number and unit
  const match = normalized.match(/(\d+)\s*(minute|min|hour|h|second|sec|day|d)?/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  // If no unit specified, default to minutes
  const unit = match[2] || 'minute';

  const multipliers = {
    second: 1000,
    sec: 1000,
    minute: 60 * 1000,
    min: 60 * 1000,
    hour: 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  const multiplier = multipliers[unit];
  return multiplier ? value * multiplier : null;
}

/**
 * Get suggestions for ambiguous input
 * Returns array of suggested intents with display names
 */
function getSuggestions(question) {
  const result = matchIntent(question);

  if (result.confidence > 0.5 && result.confidence < 0.95) {
    // Suggest the best match and a few alternatives
    const suggestions = [];

    // Add the best match
    const intentConfig = {
      system_health: { label: 'View System Health', action: 'system_health' },
      list_containers: { label: 'List Containers', action: 'list_containers' },
      check_errors: { label: 'Check Errors', action: 'check_errors' },
      check_warnings: { label: 'Check Warnings', action: 'check_warnings' },
      check_memory: { label: 'Check Memory Usage', action: 'check_memory' },
      check_cpu: { label: 'Check CPU Usage', action: 'check_cpu' },
      get_latest_file: { label: 'View Latest Data', action: 'get_latest_file' },
      check_data_flow: { label: 'Check Data Uploads', action: 'check_data_flow' },
      redeploy: { label: 'Redeploy', action: 'redeploy' },
      environment_variables: { label: 'Update Environment Variables', action: 'environment_variables' },
      modbus_test: { label: 'Test Modbus Register', action: 'modbus_test' },
      modbus_write: { label: 'Write Modbus Register', action: 'modbus_write' }
    };

    if (result.intent && intentConfig[result.intent]) {
      suggestions.push({
        label: intentConfig[result.intent].label,
        action: result.intent,
        confidence: result.confidence
      });
    }

    return suggestions;
  }

  return [];
}

module.exports = {
  matchIntent,
  parseTimespan,
  getSuggestions,
  fuzzyMatch,
  similarityScore,
  levenshteinDistance,
  INTENTS
};
