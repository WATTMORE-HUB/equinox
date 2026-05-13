/**
 * Response Formatter for Equinox Chat
 * Generates suggestion buttons, capabilities menu, and response variants
 */

/**
 * Build a suggestion response when input is ambiguous
 * Returns { answer, suggestions }
 */
function buildSuggestionResponse(question, suggestions) {
  if (!suggestions || suggestions.length === 0) {
    return {
      answer: `I'm not quite sure what you mean. Try \"what can you do?\" to see all available commands.`,
      suggestions: null
    };
  }

  const suggestion = suggestions[0];
  return {
    answer: `I think you mean: "${suggestion.label}"`,
    suggestions: [
      {
        label: suggestion.label,
        action: suggestion.action,
        type: 'suggestion'
      }
    ]
  };
}

/**
 * Build the full capabilities menu
 * Returns { answer, suggestions }
 */
function buildCapabilitiesMenu() {
  const buttons = [
    { label: 'System Health', action: 'system_health', category: 'Status' },
    { label: 'List Containers', action: 'list_containers', category: 'Status' },
    { label: 'Check Errors', action: 'check_errors', category: 'Status' },
    { label: 'Check Warnings', action: 'check_warnings', category: 'Status' },
    { label: 'Check Memory Usage', action: 'check_memory', category: 'Resources' },
    { label: 'Check CPU Usage', action: 'check_cpu', category: 'Resources' },
    { label: 'View Latest /tracker', action: 'get_latest_file_tracker', category: 'Data' },
    { label: 'View Latest /meter', action: 'get_latest_file_meter', category: 'Data' },
    { label: 'View Latest /inverter', action: 'get_latest_file_inverter', category: 'Data' },
    { label: 'View Latest /weather', action: 'get_latest_file_weather', category: 'Data' },
    { label: 'View Latest /recloser', action: 'get_latest_file_recloser', category: 'Data' },
    { label: 'Check Data Uploads', action: 'check_data_flow', category: 'Data' },
    { label: 'Redeploy', action: 'redeploy', category: 'Deployment' },
    { label: 'Update Environment Variables', action: 'environment_variables', category: 'Deployment' }
  ];

  return {
    answer: `Here's what I can do:`,
    suggestions: buttons.map((btn) => ({
      label: btn.label,
      action: btn.action,
      type: 'capability',
      category: btn.category
    }))
  };
}

/**
 * Build a two-strike fallback response with capabilities menu
 * Shows when user has failed to parse input twice in a row
 */
function buildTwoStrikeResponse() {
  return buildCapabilitiesMenu();
}

/**
 * Get a response variant for a given intent
 * Adds variety to repeated queries
 */
function getResponseVariant(intent, index = 0) {
  const variants = {
    system_health: [
      'Pulling up your full system report...',
      'Let me check your system health...',
      'Generating system health report...'
    ],
    list_containers: [
      'Checking running containers...',
      'Here are your active containers...',
      'Let me list the running services...'
    ],
    check_errors: [
      'Searching for errors...',
      'Here are any recent errors...',
      'Let me check for problems...'
    ],
    check_warnings: [
      'Checking for warnings...',
      'Here are any recent warnings...',
      'Let me search for warnings...'
    ],
    check_memory: [
      'Checking memory usage...',
      'Here\'s your memory status...',
      'Let me pull up memory stats...'
    ],
    check_cpu: [
      'Checking CPU usage...',
      'Here\'s your CPU status...',
      'Let me pull up CPU stats...'
    ],
    get_latest_file: [
      'Fetching latest data...',
      'Pulling the most recent file...',
      'Let me get that for you...'
    ],
    check_data_flow: [
      'Checking data freshness...',
      'Analyzing data uploads...',
      'Let me check the Timestream data...'
    ],
    redeploy: [
      'Preparing redeploy...',
      'Starting deployment...',
      'Pulling latest code...'
    ],
    environment_variables: [
      'Ready to update environment variables...',
      'Let\'s update the configuration...',
      'Preparing environment variable upload...'
    ]
  };

  if (!variants[intent]) {
    return 'Processing your request...';
  }

  return variants[intent][index % variants[intent].length];
}

/**
 * Build context-aware follow-up text
 * Uses session state to reference prior interactions
 */
function buildContextualFollowUp(priorIntent, currentIntent) {
  const followUps = {
    'system_health->check_errors': 'Based on your system health report, I found errors.',
    'system_health->check_warnings': 'Based on your system health report, I found warnings.',
    'check_errors->check_warnings': 'No additional warnings beyond those errors.',
    'check_memory->check_cpu': 'Here\'s the CPU usage you asked for.',
    'check_cpu->check_memory': 'Here\'s the memory usage you asked for.'
  };

  const key = `${priorIntent}->${currentIntent}`;
  return followUps[key] || null;
}

/**
 * Format error recovery message with next suggestions
 */
function buildErrorRecoveryMessage(errorType, context = {}) {
  const messages = {
    parse_failed: {
      message: `I couldn't parse that timespan. Please try: "5 minutes", "10 minutes", "30 minutes", or "1 hour".`,
      suggestion: 'check_data_flow'
    },
    file_not_found: {
      message: `I couldn't find that file. Available directories: /tracker, /meter, /inverter, /weather, /recloser.`,
      suggestion: 'get_latest_file'
    },
    no_data: {
      message: `No data found for that query.`,
      suggestion: 'system_health'
    },
    timeout: {
      message: `The request took too long. Please try again.`,
      suggestion: null
    }
  };

  const config = messages[errorType] || messages.no_data;
  return {
    answer: config.message,
    suggestions: config.suggestion
      ? [
          {
            label: `Try Again`,
            action: config.suggestion,
            type: 'recovery'
          }
        ]
      : null
  };
}

/**
 * Format a response with optional detail breakdown
 * For use with structured responses
 */
function formatStructuredResponse(summary, details = null) {
  const parts = [summary];
  if (details) {
    if (Array.isArray(details)) {
      parts.push('');
      parts.push(...details);
    } else if (typeof details === 'string') {
      parts.push('');
      parts.push(details);
    }
  }
  return parts.join('\n');
}

module.exports = {
  buildSuggestionResponse,
  buildCapabilitiesMenu,
  buildTwoStrikeResponse,
  getResponseVariant,
  buildContextualFollowUp,
  buildErrorRecoveryMessage,
  formatStructuredResponse
};
