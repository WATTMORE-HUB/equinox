#!/usr/bin/env node

/**
 * Entry point for the LLM Deployment system
 * Handles initialization and graceful fallback if configurator is not available
 */

const fs = require('fs');
const path = require('path');

// Check if create-project.js is available
const configuratorPaths = [
  // Development path
  path.join(__dirname, '../../../configurator/NEW_configurator/create-project.js'),
  // Production on CM4 (if deployed via the main enform repo)
  '/app/configurator/NEW_configurator/create-project.js',
  // Alternative
  path.join(process.cwd(), 'configurator', 'NEW_configurator', 'create-project.js')
];

let configuratorFound = false;
for (const p of configuratorPaths) {
  if (fs.existsSync(p)) {
    console.log(`[OK] Found configurator at: ${p}`);
    configuratorFound = true;
    break;
  }
}

if (!configuratorFound) {
  console.warn('[WARN]  WARNING: create-project.js not found in expected locations');
  console.warn('   The deployment feature will not work until the configurator is available.');
  console.warn('   Expected locations:');
  configuratorPaths.forEach(p => console.warn(`     - ${p}`));
  console.warn('');
  console.warn('   If deploying standalone, copy the configurator directory to the container.');
  console.warn('   If deploying via balena with the full enform repo, ensure directory structure is correct.');
  console.warn('');
}

// Start the server
console.log('[LAUNCH] Starting LLM Deployment Manager...');
require('./server.js');
