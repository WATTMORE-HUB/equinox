const { TimestreamQueryClient, QueryCommand } = require('@aws-sdk/client-timestream-query');

const DB_NAME = 'operateSolarDB-prod';
const TABLES = [
  'electric_metering',
  'recloser_monitoring',
  'single-axis-tracker',
  'solar_inverters',
  'tracker_monitoring',
  'weather_stations'
];

class TimestreamChecker {
  constructor() {
    this.client = null;
    this.siteId = process.env.SITE_ID;
  }

  /**
   * Initialize Timestream client
   */
  ensureClient() {
    if (!this.client) {
      const region = process.env.AWS_REGION || 'us-east-1';
      this.client = new TimestreamQueryClient({
        region,
        // Use explicit Timestream Query endpoint
        endpoint: `https://query-cell1.timestream.${region}.amazonaws.com`
      });
    }
    return this.client;
  }

  /**
   * Check if a row is effectively blank (all non-key values are null)
   */
  isBlankRow(row, keyColumns = ['site_id', 'time', 'measure_name', 'measure_value']) {
    if (!row || Object.keys(row).length === 0) {
      return true;
    }

    // Check if all non-key values are null or empty
    for (const [key, value] of Object.entries(row)) {
      if (!keyColumns.includes(key.toLowerCase())) {
        // If any non-key column has a non-null value, row is not blank
        if (value !== null && value !== undefined && value !== '') {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Parse timespan string to milliseconds
   * Accepts: "5 minutes", "10 mins", "30min", "1 hour", etc.
   */
  parseTimespan(timespanStr) {
    const normalized = timespanStr.toLowerCase().trim();

    // Extract number and unit
    const match = normalized.match(/(\d+)\s*(minute|min|hour|h|second|sec|day|d)?/);
    if (!match) {
      return null;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2] || 'minute';

    const multipliers = {
      second: 1000,
      sec: 1000,
      minute: 60 * 1000,
      min: 60 * 1000,
      hour: 60 * 60 * 1000,
      h: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const multiplier = multipliers[unit];
    return multiplier ? value * multiplier : null;
  }

  /**
   * Query Timestream for the most recent data point for a single table
   */
  async checkTableData(tableName, thresholdMs) {
    try {
      const query = `
        SELECT * FROM "${DB_NAME}"."${tableName}"
        WHERE site_id = '${this.siteId}'
        ORDER BY time DESC
        LIMIT 1
      `;

      const client = this.ensureClient();
      const command = new QueryCommand({ QueryString: query });
      const response = await client.send(command);

      if (!response.Rows || response.Rows.length === 0) {
        return {
          tableName,
          status: 'missing',
          message: 'No data found for this site',
          timestamp: null,
          age: null
        };
      }

      // Parse the response row
      const row = response.Rows[0];
      const cells = row.Data || [];

      // Extract timestamp and data
      let timestamp = null;
      const rowData = {};

      if (response.ColumnInfo) {
        response.ColumnInfo.forEach((col, idx) => {
          const value = cells[idx]?.ScalarValue;
          const colName = col.Name.toLowerCase();
          rowData[colName] = value;

          if (colName === 'time') {
            timestamp = value;
          }
        });
      }

      // Check if row is effectively blank
      if (this.isBlankRow(rowData)) {
        return {
          tableName,
          status: 'blank',
          message: 'Data received but contains only null values',
          timestamp,
          age: null
        };
      }

      // Check freshness
      if (!timestamp) {
        return {
          tableName,
          status: 'error',
          message: 'Could not determine timestamp',
          timestamp: null,
          age: null
        };
      }

      const timestampMs = new Date(timestamp).getTime();
      const nowMs = Date.now();
      const ageMs = nowMs - timestampMs;

      if (ageMs <= thresholdMs) {
        return {
          tableName,
          status: 'fresh',
          message: `Data is current (${this.formatAge(ageMs)} old)`,
          timestamp,
          age: ageMs
        };
      } else {
        return {
          tableName,
          status: 'stale',
          message: `Data is stale (${this.formatAge(ageMs)} old)`,
          timestamp,
          age: ageMs
        };
      }
    } catch (err) {
      console.error(`[TimestreamChecker] Error checking ${tableName}:`, err.message);
      return {
        tableName,
        status: 'error',
        message: `Error querying Timestream: ${err.message}`,
        timestamp: null,
        age: null
      };
    }
  }

  /**
   * Format age in milliseconds to human-readable string
   */
  formatAge(ageMs) {
    if (ageMs < 60000) {
      return `${Math.round(ageMs / 1000)} seconds`;
    } else if (ageMs < 3600000) {
      return `${Math.round(ageMs / 60000)} minutes`;
    } else {
      return `${Math.round(ageMs / 3600000)} hours`;
    }
  }

/**
   * Check all tables for data freshness
   */
  async checkAllTables(thresholdMs) {
    if (!this.siteId) {
      return {
        success: false,
        error: 'SITE_ID environment variable not set. Cannot query Timestream.',
        results: []
      };
    }

    // Check for AWS credentials
    const hasAwsCredentials = Boolean(
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      process.env.AWS_SESSION_TOKEN ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.AWS_PROFILE
    );

    if (!hasAwsCredentials) {
      return {
        success: false,
        error: 'AWS credentials not configured. To enable Timestream queries, set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION environment variables. See docs/TIMESTREAM_IAM_POLICY.md for policy requirements.',
        results: []
      };
    }

    console.log(`[TimestreamChecker] Checking data freshness for site: ${this.siteId}`);

    const results = [];

    for (const tableName of TABLES) {
      const result = await this.checkTableData(tableName, thresholdMs);
      results.push(result);
    }

    return {
      success: true,
      siteId: this.siteId,
      thresholdMs,
      results
    };
  }

  /**
   * Format results for chat response
   */
  formatResults(checkResults) {
    if (!checkResults.success) {
      return `Unable to check data flow: ${checkResults.error}`;
    }

    const { results } = checkResults;
    const lines = [];

    for (const result of results) {
      if (result.status === 'fresh') {
        lines.push(`${result.tableName}: Last upload is ${this.formatAge(result.age)} ago.`);
      } else if (result.status === 'stale') {
        lines.push(`${result.tableName}: Last upload is ${this.formatAge(result.age)} ago (outside threshold).`);
      } else if (result.status === 'blank') {
        lines.push(`${result.tableName}: Data received but contains only null values.`);
      } else if (result.status === 'missing') {
        lines.push(`${result.tableName}: No data found for this site.`);
      } else if (result.status === 'error') {
        lines.push(`${result.tableName}: Error - ${result.message}`);
      }
    }

    return lines.join('\n');
  }
}

module.exports = TimestreamChecker;
