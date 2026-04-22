/**
 * Lambda Handler for Cloud-Based Deployment
 * Triggered by API call from CM4 dashboard
 * Enqueues deployment request to S3 for EC2 poller to process
 * 
 * Expected event body:
 * {
 *   "deploymentId": "deploy_...",
 *   "balenaToken": "...",
 *   "deviceId": "...",
 *   "csvData": "base64-encoded-csv"
 * }
 */

const AWS = require('aws-sdk');

const s3 = new AWS.S3();

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

async function validateInput(body) {
  console.log('[LAMBDA VALIDATE] Checking required fields in body:', JSON.stringify(body, null, 2));
  
  const required = ['deploymentId', 'balenaToken', 'deviceId', 'fleetName', 'csvData'];
  const missing = required.filter(field => !body[field]);
  
  console.log('[LAMBDA VALIDATE] Required fields:', required);
  console.log('[LAMBDA VALIDATE] Missing fields:', missing);
  console.log('[LAMBDA VALIDATE] body.fleetName value:', body.fleetName);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  // Validate base64 CSV
  try {
    Buffer.from(body.csvData, 'base64').toString('utf8');
  } catch (err) {
    throw new Error('csvData must be valid base64');
  }
  
  console.log('[LAMBDA VALIDATE] Validation passed, returning body');
  return body;
}

async function enqueueToS3(params) {
  try {
    if (!S3_BUCKET) {
      throw new Error('S3_BUCKET environment variable not set');
    }
    
    const deploymentId = params.deploymentId;
    const key = `deployments/pending/${deploymentId}.json`;
    
    console.log(`[LAMBDA] Received params:`, JSON.stringify(params, null, 2));
    console.log(`[LAMBDA] fleetName value: ${params.fleetName}`);
    
    const deploymentRequest = {
      deploymentId,
      balenaToken: params.balenaToken,
      deviceId: params.deviceId,
      fleetName: params.fleetName,
      csvData: params.csvData,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    console.log(`Enqueueing deployment ${deploymentId} to S3 bucket ${S3_BUCKET}`);
    console.log(`[LAMBDA] S3 deploymentRequest fleetName: ${deploymentRequest.fleetName}`);
    
    const s3Params = {
      Bucket: S3_BUCKET,
      Key: key,
      Body: JSON.stringify(deploymentRequest, null, 2),
      ContentType: 'application/json'
    };
    
    await s3.putObject(s3Params).promise();
    
    console.log(`Deployment enqueued at s3://${S3_BUCKET}/${key}`);
    
    return {
      deploymentId,
      status: 'queued',
      s3Key: key,
      message: 'Deployment request enqueued for EC2 processing'
    };
  } catch (err) {
    console.error('S3 Enqueue Error:', err);
    throw new Error(`Failed to enqueue deployment: ${err.message}`);
  }
}

async function handler(event, context) {
  console.log('[LAMBDA HANDLER] Invoked with event:', JSON.stringify(event, null, 2));
  console.log('[LAMBDA HANDLER] event.body type:', typeof event.body);
  console.log('[LAMBDA HANDLER] event.body value:', event.body);
  console.log('[LAMBDA HANDLER] event keys:', Object.keys(event));
  
  try {
    // Parse request body
    let body;
    if (typeof event.body === 'string') {
      console.log('[LAMBDA HANDLER] Parsing string body');
      body = JSON.parse(event.body);
    } else if (typeof event.body === 'object' && event.body) {
      console.log('[LAMBDA HANDLER] Using object body directly');
      body = event.body;
    } else {
      // If no body wrapper, use event directly (direct Lambda invocation)
      console.log('[LAMBDA HANDLER] Using event as body (direct invocation)');
      body = event;
    }
    
    console.log('[LAMBDA HANDLER] Parsed body:', JSON.stringify(body, null, 2));
    
    // Validate input
    const params = await validateInput(body);
    
    // Enqueue deployment to S3 for EC2 poller to process
    const queueResult = await enqueueToS3(params);
    
    // Return success response
    return {
      statusCode: 202, // Accepted - async processing
      body: JSON.stringify({
        success: true,
        message: queueResult.message,
        deploymentId: queueResult.deploymentId,
        status: queueResult.status,
        s3Key: queueResult.s3Key,
        note: 'Deployment enqueued; EC2 poller will process it shortly'
      })
    };
    
  } catch (err) {
    console.error('Error:', err);
    
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
}

module.exports = { handler };
