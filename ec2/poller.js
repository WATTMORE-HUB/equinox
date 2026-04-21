#!/usr/bin/env node

/**
 * EC2 Deployment Poller
 * Runs periodically on EC2 instance
 * Polls S3 for pending deployments and executes them
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const AWS = require('aws-sdk');

const execFileAsync = promisify(execFile);

const S3_BUCKET = process.env.S3_BUCKET;
const REPO_PATH = process.env.REPO_PATH || path.join(process.env.HOME, 'equinox');
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '60000'); // 60 seconds default

const s3 = new AWS.S3();

async function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

async function getPendingDeployments() {
  try {
    if (!S3_BUCKET) {
      throw new Error('S3_BUCKET environment variable not set');
    }

    await log('Checking for pending deployments...');

    const listParams = {
      Bucket: S3_BUCKET,
      Prefix: 'deployments/pending/'
    };

    const result = await s3.listObjectsV2(listParams).promise();

    if (!result.Contents || result.Contents.length === 0) {
      await log('No pending deployments found');
      return [];
    }

    await log(`Found ${result.Contents.length} pending deployment(s)`);
    return result.Contents.map(item => item.Key);
  } catch (err) {
    await log(`Error listing deployments: ${err.message}`, 'error');
    return [];
  }
}

async function getDeploymentRequest(s3Key) {
  try {
    const getParams = {
      Bucket: S3_BUCKET,
      Key: s3Key
    };

    const result = await s3.getObject(getParams).promise();
    const deploymentRequest = JSON.parse(result.Body.toString('utf8'));

    return deploymentRequest;
  } catch (err) {
    throw new Error(`Failed to get deployment from S3: ${err.message}`);
  }
}

async function executeDeployment(deploymentRequest) {
  const { deploymentId, balenaToken, deviceId, csvData } = deploymentRequest;

  try {
    await log(`Executing deployment ${deploymentId} for device ${deviceId}`);

    // Run the runner script with environment variables
    const env = {
      ...process.env,
      DEPLOYMENT_ID: deploymentId,
      BALENA_TOKEN: balenaToken,
      DEVICE_ID: deviceId,
      CSV_DATA: csvData,
      ENFORM_REPO_PATH: REPO_PATH
    };

    const { stdout, stderr } = await execFileAsync('node', ['ec2/runner.js'], {
      cwd: REPO_PATH,
      env,
      timeout: 5 * 60 * 1000 // 5 minute timeout
    });

    await log(`Deployment ${deploymentId} completed successfully`);
    await log(`Output: ${stdout}`);

    return { success: true, output: stdout };
  } catch (err) {
    await log(`Deployment ${deploymentId} failed: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

async function moveToCompleted(s3Key, success) {
  try {
    const deploymentId = path.basename(s3Key, '.json');
    const newPrefix = success ? 'deployments/completed/' : 'deployments/failed/';
    const newKey = newPrefix + path.basename(s3Key);

    // Copy to new location
    await s3.copyObject({
      Bucket: S3_BUCKET,
      CopySource: `${S3_BUCKET}/${s3Key}`,
      Key: newKey
    }).promise();

    // Delete from pending
    await s3.deleteObject({
      Bucket: S3_BUCKET,
      Key: s3Key
    }).promise();

    const status = success ? 'completed' : 'failed';
    await log(`Moved deployment ${deploymentId} to ${status}`);
  } catch (err) {
    await log(`Error moving deployment: ${err.message}`, 'error');
  }
}

async function pollOnce() {
  try {
    const pendingKeys = await getPendingDeployments();

    for (const s3Key of pendingKeys) {
      try {
        const deploymentRequest = await getDeploymentRequest(s3Key);
        const result = await executeDeployment(deploymentRequest);
        await moveToCompleted(s3Key, result.success);
      } catch (err) {
        await log(`Error processing ${s3Key}: ${err.message}`, 'error');
        // Leave in pending for retry
      }
    }
  } catch (err) {
    await log(`Fatal error in poll: ${err.message}`, 'error');
  }
}

async function start() {
  await log(`EC2 Deployment Poller started (interval: ${POLL_INTERVAL}ms)`);
  await log(`S3 Bucket: ${S3_BUCKET}`);
  await log(`Repository Path: ${REPO_PATH}`);

  // Poll immediately, then at intervals
  await pollOnce();

  setInterval(pollOnce, POLL_INTERVAL);
}

// Run if executed directly
if (require.main === module) {
  start().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { pollOnce, getDeploymentRequest, executeDeployment };
