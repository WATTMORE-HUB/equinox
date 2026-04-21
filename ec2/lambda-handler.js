/**
 * Lambda Handler for Cloud-Based Deployment
 * Triggered by API call from CM4 dashboard
 * Sends command to EC2 instance via AWS Systems Manager
 * 
 * Expected event body:
 * {
 *   "deploymentId": "deploy_...",
 *   "balenaToken": "...",
 *   "deviceId": "...",
 *   "csvData": "base64-encoded-csv",
 *   "statusCallbackUrl": "http://cm4-ip/api/deployment/status"
 * }
 */

const AWS = require('aws-sdk');

const ssm = new AWS.SSM();

const EC2_INSTANCE_ID = process.env.EC2_INSTANCE_ID;
const REPO_PATH = process.env.REPO_PATH || '/home/ec2-user/enform-llm-deployment';

async function validateInput(body) {
  const required = ['deploymentId', 'balenaToken', 'deviceId', 'csvData', 'statusCallbackUrl'];
  const missing = required.filter(field => !body[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  // Validate base64 CSV
  try {
    Buffer.from(body.csvData, 'base64').toString('utf8');
  } catch (err) {
    throw new Error('csvData must be valid base64');
  }
  
  return body;
}

async function sendSSMCommand(params) {
  try {
    if (!EC2_INSTANCE_ID) {
      throw new Error('EC2_INSTANCE_ID environment variable not set');
    }
    
    // Build the deployment runner command
    const command = [
      'cd',
      REPO_PATH,
      '&&',
      'node',
      'ec2/runner.js'
    ].join(' ');
    
    const ssmParams = {
      InstanceIds: [EC2_INSTANCE_ID],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        command: [command],
        workingDirectory: [REPO_PATH]
      },
      Environment: {
        DEPLOYMENT_ID: params.deploymentId,
        BALENA_TOKEN: params.balenaToken,
        DEVICE_ID: params.deviceId,
        CSV_DATA: params.csvData,
        STATUS_CALLBACK_URL: params.statusCallbackUrl,
        ENFORM_REPO_PATH: REPO_PATH
      }
    };
    
    console.log('Sending SSM command to instance:', EC2_INSTANCE_ID);
    
    const response = await ssm.sendCommand(ssmParams).promise();
    
    if (!response.Command) {
      throw new Error('Failed to send SSM command');
    }
    
    const command_id = response.Command.CommandId;
    console.log('SSM Command sent:', command_id);
    
    return {
      commandId: command_id,
      commandStatus: response.Command.Status || 'PENDING',
      instanceId: EC2_INSTANCE_ID
    };
  } catch (err) {
    throw new Error(`Failed to send SSM command: ${err.message}`);
  }
}

async function handler(event, context) {
  console.log('Lambda handler invoked with event:', JSON.stringify(event));
  
  try {
    // Parse request body
    let body;
    if (typeof event.body === 'string') {
      body = JSON.parse(event.body);
    } else {
      body = event.body;
    }
    
    // Validate input
    const params = await validateInput(body);
    
    // Send SSM command to EC2 instance
    const commandResult = await sendSSMCommand(params);
    
    // Return success response
    return {
      statusCode: 202, // Accepted - async processing
      body: JSON.stringify({
        success: true,
        message: 'Deployment command sent to EC2 instance',
        deploymentId: params.deploymentId,
        commandId: commandResult.commandId,
        instanceId: commandResult.instanceId,
        status: commandResult.commandStatus,
        note: 'Check status via the deployment status endpoint'
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
