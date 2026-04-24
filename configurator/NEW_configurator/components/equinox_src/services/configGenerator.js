const hardwareConfigLoader = require('./hardwareConfigLoader');

class ConfigGenerator {
  constructor() {
    // Core services that are always enabled
    this.coreServices = ['heartbeat', 'combine', 'postgres'];
  }

  /**
   * Generate complete deployment configuration
   * Takes Wattmore project data and hardware profiles, outputs ready-to-deploy config
   */
  async generateConfig(projectData) {
    try {
      console.log(`[ConfigGenerator] Generating config for: ${projectData.name}`);

      // Determine which services to enable based on hardware
      const enabledServices = this.determineServices(projectData);

      // Merge hardware profiles with site-specific data
      const environmentVariables = this.mergeEnvironmentVariables(projectData, enabledServices);

      const config = {
        fleetName: projectData.fleetName,
        services: enabledServices,
        environmentVariables: environmentVariables,
        metadata: {
          projectName: projectData.name,
          siteId: projectData.uuids?.siteUuid || '',
          edgeId: projectData.uuids?.edgeUuid || '',
          meterUuid: projectData.uuids?.meterUuid || '',
          systemType: projectData.systemType,
          generatedAt: new Date().toISOString(),
          sourceHardware: this.extractHardwareSummary(projectData)
        }
      };

      console.log(`[ConfigGenerator] Generated config with services:`, enabledServices);
      return config;
    } catch (error) {
      console.error('[ConfigGenerator] Error generating config:', error);
      throw error;
    }
  }

  /**
   * Determine which services should be enabled based on detected hardware
   */
  determineServices(projectData) {
    const services = new Set(this.coreServices);

    // Add meter service if meter exists
    if (projectData.hardware.meters && projectData.hardware.meters.length > 0) {
      services.add('meter');
    }

    // Add inverter service if inverters exist
    if (projectData.hardware.inverters && projectData.hardware.inverters.length > 0) {
      services.add('inverter');
    }

    // Add weather service if weather stations exist
    if (projectData.hardware.weatherStations && projectData.hardware.weatherStations.length > 0) {
      services.add('weather');
    }

    // Add tracker service if trackers exist
    if (projectData.hardware.trackers && projectData.hardware.trackers.length > 0) {
      services.add('tracker');
    }

    // Add camera service if cameras exist
    if (projectData.hardware.cameras && projectData.hardware.cameras.length > 0) {
      services.add('camera');
    }

    // Add recloser service if reclosers exist
    if (projectData.hardware.reclosers && projectData.hardware.reclosers.length > 0) {
      services.add('recloser');
    }

    return Array.from(services);
  }

  /**
   * Merge hardware-specific environment variables with site-specific configuration
   */
  mergeEnvironmentVariables(projectData, enabledServices) {
    const envVars = {};

    // Add site-level UUIDs
    if (projectData.uuids?.siteUuid) {
      envVars['SITE_UUID'] = projectData.uuids.siteUuid;
    }
    if (projectData.uuids?.edgeUuid) {
      envVars['EDGE_UUID'] = projectData.uuids.edgeUuid;
    }

    // Add configuration details
    if (projectData.configuration) {
      if (projectData.configuration.siteId) {
        envVars['SITE_ID'] = projectData.configuration.siteId;
      }
      if (projectData.configuration.edgeId) {
        envVars['EDGE_ID'] = projectData.configuration.edgeId;
      }
      if (projectData.configuration.timezone) {
        envVars['TIMEZONE'] = projectData.configuration.timezone;
      }
      if (projectData.configuration.voltage) {
        envVars['SITE_VOLTAGE'] = projectData.configuration.voltage;
      }
      if (projectData.configuration.ctCount) {
        envVars['CT_COUNT'] = String(projectData.configuration.ctCount);
      }
    }

    // Add hardware-specific environment variables
    // Meters
    if (enabledServices.includes('meter') && projectData.hardware.meters.length > 0) {
      const meter = projectData.hardware.meters[0];
      const meterProfile = hardwareConfigLoader.getProfile(meter.model);

      if (meterProfile) {
        // Add hardware profile variables
        Object.assign(envVars, meterProfile.environmentVariables);
        // Override with site-specific meter details
        if (meter.serialNumber) {
          envVars['METER_SERIAL_NUMBER'] = meter.serialNumber;
        }
        if (meter.ctPhaseCount) {
          envVars['METER_CT_PHASE_COUNT'] = String(meter.ctPhaseCount);
        }
        if (meter.ctType) {
          envVars['METER_CT_TYPE'] = meter.ctType;
        }
      } else {
        console.warn(`[ConfigGenerator] No hardware profile found for meter: ${meter.model}`);
        // Still add basic meter info
        envVars['METER_MODEL'] = meter.model;
        if (meter.serialNumber) {
          envVars['METER_SERIAL_NUMBER'] = meter.serialNumber;
        }
      }

      // Add meter UUID if available
      if (projectData.uuids?.meterUuid) {
        envVars['METER_UUID'] = projectData.uuids.meterUuid;
      }
    }

    // Inverters
    if (enabledServices.includes('inverter') && projectData.hardware.inverters.length > 0) {
      projectData.hardware.inverters.forEach((inverter, index) => {
        const prefix = projectData.hardware.inverters.length > 1 ? `INV${index + 1}_` : 'INVERTER_';
        envVars[`${prefix}MODEL`] = inverter.model;
        if (inverter.commsType) {
          envVars[`${prefix}COMMS_TYPE`] = inverter.commsType;
        }
        if (inverter.uuid) {
          envVars[`${prefix}UUID`] = inverter.uuid;
        }
      });
    }

    // Weather Stations
    if (enabledServices.includes('weather') && projectData.hardware.weatherStations.length > 0) {
      projectData.hardware.weatherStations.forEach((ws, index) => {
        const prefix = projectData.hardware.weatherStations.length > 1 ? `WS${index + 1}_` : 'WEATHER_STATION_';
        envVars[`${prefix}TYPE`] = ws.type;
        if (ws.uuid) {
          envVars[`${prefix}UUID`] = ws.uuid;
        }
      });
    }

    // Trackers
    if (enabledServices.includes('tracker') && projectData.hardware.trackers.length > 0) {
      projectData.hardware.trackers.forEach((tracker, index) => {
        const prefix = `TRACKER${index + 1}_`;
        envVars[`${prefix}MODEL`] = tracker.model;
        if (tracker.commsType) {
          envVars[`${prefix}COMMS_TYPE`] = tracker.commsType;
        }
        if (tracker.uuid) {
          envVars[`${prefix}UUID`] = tracker.uuid;
        }
      });
    }

    return envVars;
  }

  /**
   * Extract a summary of detected hardware for metadata
   */
  extractHardwareSummary(projectData) {
    const summary = {};

    if (projectData.hardware.meters.length > 0) {
      summary.meters = projectData.hardware.meters.map(m => m.model);
    }
    if (projectData.hardware.inverters.length > 0) {
      summary.inverters = projectData.hardware.inverters.map(i => i.model);
    }
    if (projectData.hardware.weatherStations.length > 0) {
      summary.weatherStations = projectData.hardware.weatherStations.map(ws => ws.type);
    }
    if (projectData.hardware.trackers.length > 0) {
      summary.trackers = projectData.hardware.trackers.map(t => t.model);
    }

    return summary;
  }
}

module.exports = new ConfigGenerator();
