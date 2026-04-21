#!/usr/bin/env node

/**
 * EC2 Deployment Runner
 * Executed by Lambda via AWS Systems Manager SendCommand
 * 
 * Environment variables expected:
 * - DEPLOYMENT_ID: Unique deployment identifier
 * - BALENA_TOKEN: Balena API authentication token
 * - DEVICE_ID: Target Balena device UUID
 * - CSV_DATA: Base64-encoded CSV service configuration
 * - STATUS_CALLBACK_URL: Webhook URL to report status
 * - ENFORM_REPO_PATH: Path to this repository (default: ~/enform-llm-deployment)
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const AWS = require('aws-sdk');
const { execSync } = require('child_process');

const execFileAsync = promisify(execFile);

const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const BALENA_TOKEN = process.env.BALENA_TOKEN;
const DEVICE_ID = process.env.DEVICE_ID;
const CSV_DATA = process.env.CSV_DATA; // Base64 encoded
const STATUS_CALLBACK_URL = process.env.STATUS_CALLBACK_URL;
const ENFORM_REPO_PATH = process.env.ENFORM_REPO_PATH || path.join(
  process.env.HOME,
  'enform-llm-deployment'
);
const S3_BUCKET = process.env.S3_BUCKET; // Optional: S3 bucket for archival
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Project output directory for generated deployments
const DEPLOYMENTS_DIR = path.join(ENFORM_REPO_PATH, '.deployments');

// Initialize S3 client if bucket is configured
const s3 = S3_BUCKET ? new AWS.S3({ region: AWS_REGION }) : null;

async function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  
  // Send log to callback endpoint if available
  if (STATUS_CALLBACK_URL) {
    try {
      await axios.post(STATUS_CALLBACK_URL, {
        deploymentId: DEPLOYMENT_ID,
        message,
        level,
        timestamp
      });
    } catch (err) {
      console.error(`Failed to send log callback: ${err.message}`);
    }
  }
}

async function reportStatus(status, message) {
  if (!STATUS_CALLBACK_URL) return;
  
  try {
    await axios.post(STATUS_CALLBACK_URL, {
      deploymentId: DEPLOYMENT_ID,
      status,
      message,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`Failed to report status: ${err.message}`);
  }
}

async function validateInputs() {
  const errors = [];
  
  if (!DEPLOYMENT_ID) errors.push('DEPLOYMENT_ID not set');
  if (!BALENA_TOKEN) errors.push('BALENA_TOKEN not set');
  if (!DEVICE_ID) errors.push('DEVICE_ID not set');
  if (!CSV_DATA) errors.push('CSV_DATA not set');
  
  if (errors.length > 0) {
    throw new Error(`Missing environment variables: ${errors.join(', ')}`);
  }
  
  // Verify repository exists
  if (!fs.existsSync(ENFORM_REPO_PATH)) {
    throw new Error(`Repository path not found: ${ENFORM_REPO_PATH}`);
  }
  
  // Verify create-project.js exists
  const createProjectPath = path.join(
    ENFORM_REPO_PATH,
    'src/configurator/ProjectCreator.js'
  );
  if (!fs.existsSync(createProjectPath)) {
    throw new Error(`ProjectCreator not found at ${createProjectPath}`);
  }
}

async function decodeCSV() {
  try {
    const csvContent = Buffer.from(CSV_DATA, 'base64').toString('utf8');
    await log(`CSV decoded: ${csvContent.length} bytes`);
    return csvContent;
  } catch (err) {
    throw new Error(`Failed to decode CSV: ${err.message}`);
  }
}

async function parseCSV(csvContent) {
  try {
    const lines = csvContent.trim().split('\n');
    
    if (lines.length < 2) {
      throw new Error('CSV must have header + at least one service');
    }
    
    const headers = lines[0].split(',').map(h => h.trim());
    const services = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const service = {};
      
      headers.forEach((header, idx) => {
        service[header] = values[idx];
      });
      
      services.push(service);
    }
    
    await log(`Parsed ${services.length} services from CSV`);
    return services;
  } catch (err) {
    throw new Error(`Failed to parse CSV: ${err.message}`);
  }
}

async function createProject(services) {
  const projectName = `deploy_${DEVICE_ID.substring(0, 8)}_${Date.now()}`;
  
  try {
    await log(`Creating project: ${projectName}`);
    
    // Extract service names from parsed CSV
    const serviceNames = services
      .map(s => s.name || s.service)
      .filter(Boolean);
    
    if (serviceNames.length === 0) {
      throw new Error('No valid services found in CSV');
    }
    
    // Use ProjectCreator to generate project
    const ProjectCreator = require(path.join(ENFORM_REPO_PATH, 'src/configurator/ProjectCreator.js'));
    const creator = new ProjectCreator();
    
    const result = await creator.createProject(projectName, serviceNames);
    
    if (!result.success) {
      throw new Error(result.error || 'Project creation failed');
    }
    
    await log(`Project created at: ${result.projectPath}`);
    await log(`Services: ${result.services.join(', ')}`);
    
    return {
      projectPath: result.projectPath,
      services: result.services,
      projectName
    };
  } catch (err) {
    throw new Error(`Project creation failed: ${err.message}`);
  }
}

async function getDeviceName() {
  try {
    await log(`Resolving device name for UUID: ${DEVICE_ID}`);
    
    // Use balena SDK to get device info
    const balena = require('balena-sdk');
    const auth = balena.auth;
    
    // Login with token
    await auth.loginWithToken(BALENA_TOKEN);
    await log('Authenticated with Balena API');
    
    // Get device
    const models = balena.models;
    const devices = await models.device.getAllByApplication(DEVICE_ID);
    
    if (!devices || devices.length === 0) {
      throw new Error(`No devices found for UUID ${DEVICE_ID}`);
    }
    
    const device = devices[0];
    const deviceName = device.device_name;
    
    await log(`Device name resolved: ${deviceName}`);
    return deviceName;
  } catch (err) {
    // Fallback: try using balena CLI instead
    await log(`SDK lookup failed, trying balena CLI: ${err.message}`);
    return await getDeviceNameViaCLI();
  }
}

async function getDeviceNameViaCLI() {
  try {
    // First login
    await log('Authenticating with Balena CLI...');
    await execFileAsync('balena', ['login', '--token', BALENA_TOKEN]);
    
    // Get device info
    const { stdout } = await execFileAsync('balena', ['device', DEVICE_ID]);
    const lines = stdout.split('\n');
    
    // Parse output to find device name
    for (const line of lines) {
      if (line.includes('Device name')) {
        const match = line.match(/Device name\s+(.+)/);
        if (match) {
          const deviceName = match[1].trim();
          await log(`Device name resolved: ${deviceName}`);
          return deviceName;
        }
      }
    }
    
    throw new Error('Could not parse device name from balena CLI output');
  } catch (err) {
    throw new Error(`Failed to resolve device name: ${err.message}`);
  }
}

async function archiveToS3(projectPath, projectName) {
  if (!s3 || !S3_BUCKET) {
    await log('S3 archival not configured, skipping...');
    return null;
  }
  
  try {
    await log(`Archiving project to S3: s3://${S3_BUCKET}/deployments/${projectName}`);
    
    // Create tar.gz of project directory
    const archivePath = path.join(DEPLOYMENTS_DIR, `${projectName}.tar.gz`);
    const cmd = `cd ${path.dirname(projectPath)} && tar -czf ${archivePath} ${path.basename(projectPath)}`;
    execSync(cmd);
    
    await log(`Archive created: ${archivePath}`);
    
    // Upload to S3
    const fileStream = fs.createReadStream(archivePath);
    const s3Key = `deployments/${DEPLOYMENT_ID}/${projectName}.tar.gz`;
    
    const uploadParams = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: fileStream
    };
    
    const s3Result = await s3.upload(uploadParams).promise();
    await log(`Successfully uploaded to S3: ${s3Key}`);
    
    // Clean up local archive (keep project directory for reference)
    fs.unlinkSync(archivePath);
    
    return s3Result.Location;
  } catch (err) {
    await log(`S3 archival failed: ${err.message}`, 'warn');
    // Don't fail the deployment if S3 archival fails
    return null;
  }
}

async function pushToBalena(projectPath, deviceName) {
  try {
    await log(`Pushing to device: ${deviceName}`);
    await log(`Project path: ${projectPath}`);
    
    // Run balena push from project directory
    const { stdout, stderr } = await execFileAsync('balena', ['push', deviceName], {
      cwd: projectPath,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large builds
    });
    
    await log(`Push output:\n${stdout}`);
    
    if (stderr) {
      await log(`Push warnings:\n${stderr}`, 'warn');
    }
    
    await log(`Successfully pushed to device: ${deviceName}`);
    return true;
  } catch (err) {
    throw new Error(`Balena push failed: ${err.message}`);
  }
}

async function run() {
  try {
    await log('EC2 Deployment Runner started');
    await reportStatus('running', 'Deployment started');
    
    // Validate inputs
    await log('Validating inputs...');
    await validateInputs();
    
    // Decode CSV
    await log('Decoding CSV data...');
    const csvContent = await decodeCSV();
    
    // Parse CSV
    await log('Parsing CSV...');
    const services = await parseCSV(csvContent);
    
    // Create project
    await log('Creating balena project...');
    const projectInfo = await createProject(services);
    
    // Resolve device name
    await log('Resolving device name...');
    const deviceName = await getDeviceName();
    
    // Push to balena
    await log('Running balena push...');
    await pushToBalena(projectInfo.projectPath, deviceName);
    
    // Archive to S3 if configured
    await log('Archiving project...');
    const s3Location = await archiveToS3(projectInfo.projectPath, projectInfo.projectName);
    
    // Success
    await log('Deployment completed successfully');
    const message = s3Location 
      ? `Deployment successful. Device: ${deviceName}. Project archived to: ${s3Location}`
      : `Deployment successful. Device: ${deviceName}`;
    await reportStatus('completed', message);
    
    process.exit(0);
  } catch (err) {
    await log(`FATAL: ${err.message}`, 'error');
    await reportStatus('failed', `Deployment failed: ${err.message}`);
    
    process.exit(1);
  }
}

// Run the deployment
run();
