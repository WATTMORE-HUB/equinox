/**
 * AWS IoT Core Publisher
 * Handles publishing system reports and monitoring data to AWS IoT Core via MQTT
 * Note: Actual MQTT publishing is handled by Python monitor.py service
 * This module provides the message building logic for Node.js chat endpoints
 */

const fs = require('fs');

const logger = console;

// Configuration from environment variables
const AWS_ENDPOINT = process.env.AWSENDPOINT;
const THING_NAME = process.env.THINGNAME;
const CERT_NAME = process.env.CERT_NAME;
const CERT = process.env.CERT;
const KEY_NAME = process.env.KEY_NAME;
const KEY = process.env.KEY;
const CA_1_NAME = process.env.CA_1_NAME;
const CA_1 = process.env.CA_1;
const IOT_PUBLISH_ENABLED = process.env.IOT_PUBLISH_ENABLED === 'true';
const IOT_TOPIC = process.env.IOT_TOPIC || 'operate/device_reports';

// Ensure /collect_data directory exists
const collectDataDir = '/collect_data';
if (!fs.existsSync(collectDataDir)) {
  fs.mkdirSync(collectDataDir, { recursive: true });
}

class AwsIotPublisher {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.initializeConnection();
  }

  /**
   * Initialize AWS IoT MQTT connection
   */
  initializeConnection() {
    if (!IOT_PUBLISH_ENABLED) {
      logger.debug('[AWS IoT] Publishing disabled');
      return;
    }

    if (!AWS_ENDPOINT || !THING_NAME || !CERT || !KEY || !CA_1) {
      logger.warn('[AWS IoT] Publishing enabled but AWS IoT env vars incomplete');
      return;
    }

    try {
      // Write certificate files to disk
      this.makeCerts();

      // Build AWS IoT client configuration
      const config = {
        host_name: AWS_ENDPOINT,
        region: 'us-east-1',
        client_id: THING_NAME,
        cert: fs.readFileSync(`${collectDataDir}/${CERT_NAME}`),
        key: fs.readFileSync(`${collectDataDir}/${KEY_NAME}`),
        ca: fs.readFileSync(`${collectDataDir}/${CA_1_NAME}`),
        use_websocket: false,
      };

      // Note: aws-iot-device-sdk-v2 is complex; for MVP we'll use mqtt.js or similar
      // For now, we'll implement a simpler version that logs the intent
      logger.info('[AWS IoT] Connection initialized (certificate-based)');
      this.isConnected = true;
    } catch (error) {
      logger.error(`[AWS IoT] Failed to initialize: ${error.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Create AWS IoT certificate files
   */
  makeCerts() {
    try {
      if (CERT && !fs.existsSync(`${collectDataDir}/${CERT_NAME}`)) {
        fs.writeFileSync(`${collectDataDir}/${CERT_NAME}`, CERT);
        logger.info('[AWS IoT] Cert file created');
      }
    } catch (error) {
      logger.debug(`[AWS IoT] Could not write cert: ${error.message}`);
    }

    try {
      if (KEY && !fs.existsSync(`${collectDataDir}/${KEY_NAME}`)) {
        fs.writeFileSync(`${collectDataDir}/${KEY_NAME}`, KEY);
        logger.info('[AWS IoT] Key file created');
      }
    } catch (error) {
      logger.debug(`[AWS IoT] Could not write key: ${error.message}`);
    }

    try {
      if (CA_1 && !fs.existsSync(`${collectDataDir}/${CA_1_NAME}`)) {
        fs.writeFileSync(`${collectDataDir}/${CA_1_NAME}`, CA_1);
        logger.info('[AWS IoT] CA file created');
      }
    } catch (error) {
      logger.debug(`[AWS IoT] Could not write CA: ${error.message}`);
    }
  }

  /**
   * Build AWS IoT message payload
   */
  buildMessage(report, severity, reportType = 'alert') {
    const systemMetrics = report.system_metrics || {};

    const message = {
      siteId: process.env.SITE,
      deviceId: process.env.EDGE_ID,
      edgeId: process.env.BALENA_DEVICE_UUID,
      reportType: reportType,
      reportedAt: Date.now(),
      severity: severity,
      summary: {
        containerCount: report.container_count || 0,
        errorCount: (report.errors_recent || []).length,
        warningCount: (report.warnings_recent || []).length,
        containers: report.containers || {},
        errorsRecent: report.errors_recent || [],
        warningsRecent: report.warnings_recent || [],
      },
    };

    // Add full system metrics for health_report type
    if (reportType === 'health_report') {
      message.systemMetrics = {
        cpu: {
          percent: systemMetrics.cpu_percent,
          status:
            systemMetrics.cpu_percent > 90
              ? 'critical'
              : systemMetrics.cpu_percent > 75
              ? 'warning'
              : 'normal',
        },
        memory: {
          percent: systemMetrics.memory?.percent,
          usedGb: systemMetrics.memory?.used_gb,
          totalGb: systemMetrics.memory?.total_gb,
          status:
            systemMetrics.memory?.percent > 90
              ? 'critical'
              : systemMetrics.memory?.percent > 70
              ? 'warning'
              : 'normal',
        },
        storage: systemMetrics.storage || {},
        temperature: systemMetrics.temperature_celsius,
      };
      message.fileActivity = report.file_activity || {};
    }

    return message;
  }

  /**
   * Publish system report to AWS IoT Core
   */
  async publishSystemReport(report, onDemand = false) {
    if (!IOT_PUBLISH_ENABLED || !this.isConnected) {
      return false;
    }

    try {
      // Determine severity based on system state
      const systemMetrics = report.system_metrics || {};
      const cpuPercent = systemMetrics.cpu_percent || 0;
      const memoryPercent = systemMetrics.memory?.percent || 0;
      const errors = (report.errors_recent || []).length;
      const failedContainers = Object.values(report.containers || {}).filter(
        (c) => c.status && c.status.includes('Exited')
      ).length;

      let severity = 'healthy';
      if (errors > 0 || failedContainers > 0 || cpuPercent > 90 || memoryPercent > 90) {
        severity = 'critical';
      } else if (cpuPercent > 75 || memoryPercent > 70) {
        severity = 'warning';
      }

      const message = this.buildMessage(report, severity, 'health_report');
      const topic = `${IOT_TOPIC}/${process.env.BALENA_DEVICE_UUID || THING_NAME}`;

      // Log the intent (actual publishing would require aws-iot-device-sdk or mqtt.js setup)
      logger.info(
        `[AWS IoT] Would publish ${onDemand ? 'on-demand' : 'scheduled'} report to ${topic}`
      );
      logger.debug(`[AWS IoT] Message: ${JSON.stringify(message).substring(0, 200)}...`);

      return true;
    } catch (error) {
      logger.error(`[AWS IoT] Error publishing system report: ${error.message}`);
      return false;
    }
  }

  /**
   * Publish alert (called when errors/failures detected)
   */
  async publishAlert(report) {
    if (!IOT_PUBLISH_ENABLED || !this.isConnected) {
      return false;
    }

    try {
      const errors = (report.errors_recent || []).length;
      const failedContainers = Object.values(report.containers || {}).filter(
        (c) => c.status && c.status.includes('Exited')
      ).length;

      const severity =
        errors > 0 || failedContainers > 0 ? 'critical' : 'warning';

      const message = this.buildMessage(report, severity, 'alert');
      const topic = `${IOT_TOPIC}/${process.env.BALENA_DEVICE_UUID || THING_NAME}`;

      logger.info(`[AWS IoT] Would publish alert to ${topic}`);
      logger.debug(`[AWS IoT] Alert: ${JSON.stringify(message).substring(0, 200)}...`);

      return true;
    } catch (error) {
      logger.error(`[AWS IoT] Error publishing alert: ${error.message}`);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new AwsIotPublisher();
