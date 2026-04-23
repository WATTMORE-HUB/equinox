#!/usr/bin/env node

/**
 * Test script to verify the full /api/deployment/lookup flow
 * This simulates what the dashboard will do to get deployment config from Wattmore data
 */

const hardwareConfigLoader = require('./src/services/hardwareConfigLoader');
const wattmoreClient = require('./src/services/wattmoreClient');
const configGenerator = require('./src/services/configGenerator');

async function test() {
  const projectName = process.argv[2] || 'OfficeLab';

  console.log('='.repeat(70));
  console.log('Testing /api/deployment/lookup flow');
  console.log('='.repeat(70));
  console.log(`Project: ${projectName}\n`);

  try {
    console.log('1. Loading hardware profiles...');
    await hardwareConfigLoader.load();
    console.log('   ✓ Hardware profiles loaded\n');

    console.log('2. Fetching Wattmore project data...');
    const projectData = await wattmoreClient.getProjectByName(projectName);
    console.log(`   ✓ Project data fetched (${projectData.hardware.meters.length} meter(s))\n`);

    console.log('3. Generating deployment configuration...');
    const deploymentConfig = await configGenerator.generateConfig(projectData);
    console.log('   ✓ Deployment config generated\n');

    console.log('4. Final configuration:');
    console.log(JSON.stringify({
      success: true,
      project: {
        name: projectData.name,
        fleetName: projectData.fleetName,
        systemType: projectData.systemType,
      },
      hardwareDetected: projectData.hardware,
      deployment: deploymentConfig,
    }, null, 2));

    console.log('\n' + '='.repeat(70));
    console.log('✓ All tests passed!');
    console.log('='.repeat(70));
  } catch (error) {
    console.error('\n✗ Test failed:');
    console.error(error.message);
    process.exit(1);
  }
}

test();
