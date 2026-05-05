const fs = require('fs');
const path = require('path');

/**
 * System Report Generator
 * Aggregates monitoring data into a structured health report
 */
class SystemReportGenerator {
  constructor() {
    this.monitoringCachePath = process.env.MONITORING_CACHE_PATH || '/collect_data/monitoring_cache.json';
  }

  /**
   * Get the cached monitoring data from monitor.py
   */
  getMonitoringCache() {
    try {
      if (fs.existsSync(this.monitoringCachePath)) {
        const content = fs.readFileSync(this.monitoringCachePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('[SystemReportGenerator] Error reading monitoring cache:', error.message);
    }
    return {};
  }

  /**
   * Classify health level based on metric value
   */
  classifyHealthLevel(percent, warningThreshold = 70, criticalThreshold = 90) {
    if (percent >= criticalThreshold) {
      return 'critical';
    } else if (percent >= warningThreshold) {
      return 'warning';
    }
    return 'normal';
  }

  /**
   * Determine overall health status
   */
  determineOverallHealth(metrics) {
    const issues = [];

    if (metrics.cpu_status?.health_level === 'critical') issues.push('critical');
    if (metrics.memory_status?.health_level === 'critical') issues.push('critical');
    if (metrics.storage_status?.health_level === 'critical') issues.push('critical');
    if (metrics.containers.failed_count > 0) issues.push('critical');
    if (metrics.recent_errors.length > 0) issues.push('critical');

    if (metrics.cpu_status?.health_level === 'warning') issues.push('warning');
    if (metrics.memory_status?.health_level === 'warning') issues.push('warning');
    if (metrics.storage_status?.health_level === 'warning') issues.push('warning');
    if (metrics.recent_warnings.length > 0) issues.push('warning');

    if (issues.includes('critical')) {
      return 'critical';
    } else if (issues.includes('warning')) {
      return 'degraded';
    }
    return 'operational';
  }

  /**
   * Format data freshness information
   */
  formatDataFreshness(fileActivity) {
    const freshness = {};

    if (fileActivity) {
      for (const [dirName, activity] of Object.entries(fileActivity)) {
        if (activity.most_recent_age_human) {
          freshness[dirName] = {
            age_seconds: activity.most_recent_age_seconds,
            age_human: activity.most_recent_age_human,
            status: activity.status
          };
        }
      }
    }

    return freshness;
  }

  /**
   * Generate a comprehensive system report
   */
  generateReport() {
    const cache = this.getMonitoringCache();

    // Extract system metrics
    const systemMetrics = cache.system_metrics || {};
    const cpuPercent = systemMetrics.cpu_percent || 0;
    const memoryInfo = systemMetrics.memory || {};
    const storageInfo = systemMetrics.storage || {};
    const temperature = systemMetrics.temperature_celsius;

    // Extract container data
    const containers = cache.containers || {};
    const containerNames = Object.keys(containers);
    const runningContainers = containerNames.filter((name) => {
      const status = containers[name].status || '';
      return status.toLowerCase().includes('up');
    });
    const failedContainers = containerNames.filter((name) => {
      const status = containers[name].status || '';
      return !status.toLowerCase().includes('up');
    });

    // Extract errors and warnings
    const errors = cache.errors_recent || [];
    const warnings = cache.warnings_recent || [];

    // Extract file activity
    const fileActivity = cache.file_activity || {};

    // Build structured report
    const report = {
      timestamp: cache.last_updated || new Date().toISOString(),
      overall_health: '', // Will be calculated below
      summary: {
        system: 'System Health Report',
        generated_at: new Date().toISOString(),
        uptime_check: true
      },

      // System metrics
      cpu_status: {
        percent: cpuPercent,
        health_level: this.classifyHealthLevel(cpuPercent, 75, 90),
        status_text: this.getMetricStatusText('CPU', cpuPercent)
      },

      memory_status: {
        percent: memoryInfo.percent || 0,
        used_gb: memoryInfo.used_gb,
        total_gb: memoryInfo.total_gb,
        health_level: this.classifyHealthLevel(memoryInfo.percent || 0, 70, 90),
        status_text: this.getMetricStatusText(
          'Memory',
          memoryInfo.percent || 0,
          `${memoryInfo.used_gb}GB/${memoryInfo.total_gb}GB`
        )
      },

      storage_status: {
        health_level: 'normal',
        paths: {}
      },

      // Container health
      containers: {
        total_count: containerNames.length,
        running_count: runningContainers.length,
        failed_count: failedContainers.length,
        failed_names: failedContainers,
        running_names: runningContainers,
        details: containers
      },

      // Error tracking
      recent_errors: errors.slice(0, 5), // Top 5 errors
      error_count: errors.length,

      recent_warnings: warnings.slice(0, 5), // Top 5 warnings
      warning_count: warnings.length,

      // Data freshness
      data_freshness: this.formatDataFreshness(fileActivity),
      file_activity: fileActivity,

      // Temperature (if available)
      temperature: temperature
    };

    // Process storage
    for (const [path, usage] of Object.entries(storageInfo)) {
      report.storage_status.paths[path] = {
        percent: usage.percent,
        used_gb: usage.used_gb,
        total_gb: usage.total_gb,
        health_level: this.classifyHealthLevel(usage.percent, 75, 90),
        status_text: this.getMetricStatusText('Storage', usage.percent, `${usage.used_gb}GB/${usage.total_gb}GB`)
      };
    }

    // Determine primary storage health (/) for overall storage status
    if (report.storage_status.paths['/']) {
      report.storage_status.health_level = report.storage_status.paths['/'].health_level;
    }

    // Determine overall health
    report.overall_health = this.determineOverallHealth(report);

    return report;
  }

  /**
   * Get human-readable status text for metrics
   */
  getMetricStatusText(metric, percent, extra = '') {
    let status = `${metric}: ${Math.round(percent)}%`;
    if (extra) {
      status += ` (${extra})`;
    }

    if (percent >= 90) {
      return `${status} - CRITICAL`;
    } else if (percent >= 70) {
      return `${status} - WARNING`;
    }
    return `${status} - OK`;
  }

  /**
   * Get a brief narrative summary for chat
   */
  generateNarrativeSummary(report) {
    const parts = [];

    // Overall status
    if (report.overall_health === 'critical') {
      parts.push('⚠️ Your system is in CRITICAL condition and requires immediate attention.');
    } else if (report.overall_health === 'degraded') {
      parts.push('⚠️ Your system is DEGRADED with some issues detected.');
    } else {
      parts.push('✅ Your system is operating normally.');
    }

    // CPU and Memory
    parts.push(
      `CPU usage is at ${report.cpu_status.percent}%, memory at ${report.memory_status.percent}% (${report.memory_status.used_gb}GB/${report.memory_status.total_gb}GB used).`
    );

    // Storage
    const rootStorage = report.storage_status.paths['/'];
    if (rootStorage) {
      parts.push(`Storage is at ${rootStorage.percent}% capacity.`);
    }

    // Container status
    if (report.containers.failed_count > 0) {
      parts.push(`⚠️ ${report.containers.failed_count} container(s) are not running: ${report.containers.failed_names.join(', ')}.`);
    } else {
      parts.push(`All ${report.containers.running_count} containers are running.`);
    }

    // Errors
    if (report.error_count > 0) {
      parts.push(`Found ${report.error_count} recent error(s).`);
      if (report.recent_errors.length > 0) {
        parts.push(`Latest: ${report.recent_errors[0]}`);
      }
    }

    // Warnings
    if (report.warning_count > 0) {
      parts.push(`Found ${report.warning_count} warning(s) in logs.`);
    }

    // Data freshness
    const freshDirs = Object.keys(report.data_freshness);
    if (freshDirs.length > 0) {
      const freshParts = freshDirs.map((dir) => {
        const age = report.data_freshness[dir].age_human;
        return `${dir}: ${age}`;
      });
      parts.push(`Data freshness: ${freshParts.join(', ')}.`);
    }

    // Temperature
    if (report.temperature) {
      parts.push(`System temperature: ${report.temperature}°C.`);
    }

    return parts.join(' ');
  }
}

module.exports = new SystemReportGenerator();
