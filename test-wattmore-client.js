#!/usr/bin/env node

/**
 * Test script to verify wattmoreClient can connect to Wattmore and fetch project data
 * Usage: node test-wattmore-client.js [projectName]
 */

const wattmoreClient = require('./src/services/wattmoreClient.js');

async function test() {
  const projectName = process.argv[2] || 'test';
  
  console.log('='.repeat(60));
  console.log('Testing Wattmore Client');
  console.log('='.repeat(60));
  console.log(`Project Name: ${projectName}\n`);

  try {
    console.log('1. Testing login...');
    await wattmoreClient.login();
    console.log('✓ Login successful\n');

    console.log(`2. Fetching project: ${projectName}...`);
    const projectData = await wattmoreClient.getProjectByName(projectName);
    console.log('✓ Project data fetched successfully\n');

    console.log('3. Project Data Structure:');
    console.log(JSON.stringify(projectData, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All tests passed!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n✗ Test failed:');
    console.error(error.message);
    process.exit(1);
  }
}

test();
