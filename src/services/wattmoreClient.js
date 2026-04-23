const axios = require('axios');

class WattmoreClient {
  constructor() {
    // Wattmore Vercel app URLs
    this.appBaseUrl = 'https://solar-configurator-lime.vercel.app';
    this.configureUrl = 'https://wattmore.com/configure';
    // Authentication credentials
    this.username = process.env.WATTMORE_USERNAME || 'equinox';
    this.password = process.env.WATTMORE_PASSWORD || '3qu!n0x!';
    this.authToken = process.env.WATTMORE_AUTH_TOKEN;
    // Axios instance with proper headers
    this.client = axios.create({
      withCredentials: true
    });
  }

  /**
   * Login to Wattmore via Vercel API
   * Must be called before making authenticated requests
   */
  async login() {
    try {
      console.log('[WattmoreClient] Logging in as:', this.username);
      
      const loginUrl = `${this.appBaseUrl}/api/auth`;
      const response = await this.client.post(loginUrl, {
        username: this.username,
        password: this.password
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data.token) {
        this.authToken = response.data.token;
        console.log('[WattmoreClient] Successfully logged in');
        return true;
      }
      
      throw new Error('No token received from login endpoint');
    } catch (error) {
      console.error('[WattmoreClient] Login failed:', error.message);
      throw error;
    }
  }

  /**
   * Fetch and parse a Wattmore project by name
   * Returns structured project object with fleet name, hardware, UUIDs, and configuration
   */
  async getProjectByName(projectName) {
    try {
      console.log(`[WattmoreClient] Fetching project: ${projectName}`);
      
      // Ensure we're logged in
      if (!this.authToken) {
        await this.login();
      }
      
      // Fetch the Wattmore configuration page
      const response = await this.fetchWattmorePage(projectName);
      
      // Parse the HTML response to extract project data
      const projectData = this.parseProjectPage(response);
      
      if (!projectData) {
        throw new Error(`Project "${projectName}" not found or failed to parse`);
      }
      
      console.log(`[WattmoreClient] Successfully fetched project: ${projectName}`);
      return projectData;
    } catch (error) {
      console.error('[WattmoreClient] Error fetching project:', error.message);
      throw error;
    }
  }

  /**
   * Fetch the Wattmore systems list and find a specific project by name
   */
  async fetchWattmorePage(projectName) {
    try {
      const apiUrl = `${this.appBaseUrl}/api/installed-systems`;
      
      const headers = {};
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await this.client.get(apiUrl, { headers });
      
      // Find the project by projectName
      const systems = Array.isArray(response.data) ? response.data : response.data.systems || [];
      const project = systems.find(s => s.projectName === projectName);
      
      if (!project) {
        throw new Error(`Project "${projectName}" not found in installed systems`);
      }
      
      return project;
    } catch (error) {
      throw new Error(`Failed to fetch project data: ${error.message}`);
    }
  }

  /**
   * Parse project data from Wattmore response (JSON API format)
   */
  parseProjectPage(data) {
    // Data should already be a parsed object from axios
    if (typeof data === 'object' && data !== null) {
      return this.parseJSONResponse(data);
    }

    // If it's a string, try to parse as JSON
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return this.parseJSONResponse(parsed);
    } catch (e) {
      console.error('[WattmoreClient] Failed to parse project data:', e.message);
      return null;
    }
  }

  /**
   * Parse JSON API response from Wattmore
   * Handles the actual Wattmore installed-systems API format
   */
  parseJSONResponse(data) {
    try {
      // Extract meter information
      const meterHardware = data.meter ? [{
        model: data.meter.manufacturer || 'Unknown',
        serialNumber: data.meter.serialNumber || '',
        ctPhaseCount: data.meter.ctPhaseCount || 0,
        ctType: data.meter.ctType || ''
      }] : [];

      // Convert inverters array to proper format
      const invertersHardware = (data.inverters || []).map(inv => ({
        model: inv.mfgModel || 'Unknown',
        commsType: inv.commsType || '',
        uuid: inv.uuid || ''
      }));

      // Convert weather stations
      const weatherStationsHardware = (data.weatherStations || []).map(ws => ({
        type: ws.type || 'Unknown',
        uuid: ws.uuid || ''
      }));

      // Convert trackers
      const trackersHardware = (data.trackers || []).map(t => ({
        model: t.mfgModel || 'Unknown',
        commsType: t.commsType || '',
        uuid: t.uuid || ''
      }));

      const project = {
        name: data.projectName || '',
        fleetName: data.projectName || '',
        hardware: {
          meters: meterHardware,
          inverters: invertersHardware,
          trackers: trackersHardware,
          weatherStations: weatherStationsHardware,
          cameras: data.cameras || [],
          reclosers: data.reclosers || []
        },
        configuration: {
          timezone: data.timezone || 'UTC',
          voltage: data.siteVoltage || '480V',
          ctCount: data.meter?.ctPhaseCount || 0,
          siteId: data.uuids?.site || '',
          edgeId: data.uuids?.edge || '',
          feederSize: data.feederSize || '',
          feederType: data.feederType || '',
          coordinates: {
            latitude: null,
            longitude: null
          }
        },
        uuids: {
          siteUuid: data.uuids?.site || '',
          edgeUuid: data.uuids?.edge || '',
          meterUuid: data.uuids?.meter || ''
        },
        systemType: data.systemType || 'DAS',
        rawData: data
      };

      return project;
    } catch (error) {
      console.error('[WattmoreClient] Error parsing JSON response:', error);
      return null;
    }
  }


  /**
   * Get all available projects
   * Useful for populating dropdown selectors
   */
  async listProjects() {
    try {
      const headers = {};
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const apiUrl = this.baseUrl.replace('/configure', '/api/projects');
      const response = await axios.get(apiUrl, { headers });
      return response.data.projects || [];
    } catch (error) {
      console.error('[WattmoreClient] Error listing projects:', error.message);
      return [];
    }
  }
}

module.exports = new WattmoreClient();
