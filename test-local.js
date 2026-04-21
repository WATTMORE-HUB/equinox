#!/usr/bin/env node

/**
 * Local test script to validate the LLM deployment system
 * Tests state management, file I/O, and basic server setup
 */

const stateManager = require('./src/stateManager');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('🧪 Running local tests...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: State file initialization
  console.log('Test 1: State file initialization');
  try {
    stateManager.initializeStateFile();
    const stateExists = fs.existsSync(stateManager.STATE_FILE_PATH);
    if (stateExists) {
      console.log('✓ State file created successfully\n');
      passed++;
    } else {
      console.log('✗ State file not created\n');
      failed++;
    }
  } catch (err) {
    console.log(`✗ Error: ${err.message}\n`);
    failed++;
  }

  // Test 2: Read state
  console.log('Test 2: Read state');
  try {
    const state = stateManager.readState();
    if (state && state.deployments && state.config) {
      console.log('✓ State read successfully');
      console.log(`  - Deployments: ${state.deployments.length}`);
      console.log(`  - Config: logCheckInterval=${state.config.logCheckInterval}ms\n`);
      passed++;
    } else {
      console.log('✗ State structure invalid\n');
      failed++;
    }
  } catch (err) {
    console.log(`✗ Error: ${err.message}\n`);
    failed++;
  }

  // Test 3: Add deployment
  console.log('Test 3: Add deployment');
  try {
    const deployment = stateManager.addDeployment({
      deviceId: 'test-device-123',
      services: ['service1', 'service2'],
      expectedJsonFiles: ['service1_*.json', 'service2_*.json']
    });

    if (deployment && deployment.id && deployment.timestamp) {
      console.log('✓ Deployment added successfully');
      console.log(`  - ID: ${deployment.id}`);
      console.log(`  - Services: ${deployment.services.join(', ')}`);
      console.log(`  - Status: ${deployment.status}\n`);
      passed++;
    } else {
      console.log('✗ Deployment object invalid\n');
      failed++;
    }
  } catch (err) {
    console.log(`✗ Error: ${err.message}\n`);
    failed++;
  }

  // Test 4: Get deployments
  console.log('Test 4: Get deployments');
  try {
    const deployments = stateManager.getDeployments();
    if (deployments && deployments.length > 0) {
      console.log('✓ Deployments retrieved successfully');
      console.log(`  - Count: ${deployments.length}\n`);
      passed++;
    } else {
      console.log('✗ No deployments found\n');
      failed++;
    }
  } catch (err) {
    console.log(`✗ Error: ${err.message}\n`);
    failed++;
  }

  // Test 5: Add error to deployment
  console.log('Test 5: Add error to deployment');
  try {
    const deployments = stateManager.getDeployments();
    if (deployments.length > 0) {
      const deploymentId = deployments[0].id;
      const updated = stateManager.addErrorToDeployment(deploymentId, {
        message: 'Test error message',
        source: 'test'
      });

      if (updated && updated.errorLog && updated.errorLog.length > 0) {
        console.log('✓ Error added successfully');
        console.log(`  - Error count: ${updated.errorLog.length}`);
        console.log(`  - Last error: ${updated.errorLog[updated.errorLog.length - 1].message}\n`);
        passed++;
      } else {
        console.log('✗ Error not added\n');
        failed++;
      }
    }
  } catch (err) {
    console.log(`✗ Error: ${err.message}\n`);
    failed++;
  }

  // Test 6: Get active validation deployments
  console.log('Test 6: Get active validation deployments');
  try {
    const activeDeployments = stateManager.getActiveValidationDeployments();
    console.log('✓ Active validation deployments retrieved');
    console.log(`  - Count: ${activeDeployments.length}\n`);
    passed++;
  } catch (err) {
    console.log(`✗ Error: ${err.message}\n`);
    failed++;
  }

  // Test 7: Update last log check
  console.log('Test 7: Update last log check');
  try {
    const result = stateManager.updateLastLogCheck();
    if (result) {
      const state = stateManager.readState();
      console.log('✓ Last log check updated');
      console.log(`  - Time: ${new Date(state.lastLogCheck).toISOString()}\n`);
      passed++;
    } else {
      console.log('✗ Failed to update\n');
      failed++;
    }
  } catch (err) {
    console.log(`✗ Error: ${err.message}\n`);
    failed++;
  }

  // Summary
  console.log('═'.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log(`📁 State file: ${stateManager.STATE_FILE_PATH}`);
  
  if (failed === 0) {
    console.log('\n✅ All tests passed! System is ready for deployment.');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failed} test(s) failed. Review the errors above.`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
