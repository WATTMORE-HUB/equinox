/**
 * Lambda Handler for LLM Deployment Manager
 * Triggered by API call from CM4 dashboard
 * Starts ECS Fargate task to run deployment
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

const ecs = new AWS.ECS();

const ECS_CLUSTER = process.env.ECS_CLUSTER || 'enform-deployments';
const ECS_TASK_DEFINITION = process.env.ECS_TASK_DEFINITION || 'enform-balena-deployer';
const ECS_SUBNETS = (process.env.ECS_SUBNETS || '').split(',').filter(Boolean);
const ECS_SECURITY_GROUPS = (process.env.ECS_SECURITY_GROUPS || '').split(',').filter(Boolean);

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

async function startECSTask(params) {
  try {
    const taskParams = {
      cluster: ECS_CLUSTER,
      taskDefinition: ECS_TASK_DEFINITION,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: ECS_SUBNETS,
          securityGroups: ECS_SECURITY_GROUPS,
          assignPublicIp: 'ENABLED'
        }
      },
      overrides: {
        containerOverrides: [
          {
            name: 'balena-deployer', // Must match container name in task definition
            environment: [
              { name: 'DEPLOYMENT_ID', value: params.deploymentId },
              { name: 'BALENA_TOKEN', value: params.balenaToken },
              { name: 'DEVICE_ID', value: params.deviceId },
              { name: 'CSV_DATA', value: params.csvData },
              { name: 'STATUS_CALLBACK_URL', value: params.statusCallbackUrl }
            ]
          }
        ]
      }
    };
    
    console.log('Starting ECS task with params:', JSON.stringify(taskParams, null, 2));
    
    const response = await ecs.runTask(taskParams).promise();
    
    if (!response.tasks || response.tasks.length === 0) {
      throw new Error('Failed to start ECS task');
    }
    
    const task = response.tasks[0];
    console.log('Task started:', task.taskArn);
    
    return {
      taskArn: task.taskArn,
      taskId: task.taskArn.split('/').pop(),
      status: task.lastStatus || 'PROVISIONING'
    };
  } catch (err) {
    throw new Error(`Failed to start ECS task: ${err.message}`);
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
    
    // Start ECS task
    const taskResult = await startECSTask(params);
    
    // Return success response
    return {
      statusCode: 202, // Accepted - async processing
      body: JSON.stringify({
        success: true,
        message: 'Deployment task started',
        deploymentId: params.deploymentId,
        taskArn: taskResult.taskArn,
        taskId: taskResult.taskId,
        status: taskResult.status,
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
