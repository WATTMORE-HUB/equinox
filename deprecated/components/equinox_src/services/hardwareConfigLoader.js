const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class HardwareConfigLoader {
  constructor() {
    this.manifest = {};
    this.profiles = {};
    this.isLoaded = false;
  }

  /**
   * Load all hardware profiles from the hardware_profiles directory
   * Caches them in memory for fast lookup
   */
  async load() {
    if (this.isLoaded) {
      return;
    }

    try {
      const hardwareProfilesDir = path.join(__dirname, '..', '..', 'hardware_profiles');
      
      // Check if directory exists
      if (!fs.existsSync(hardwareProfilesDir)) {
        console.warn('[HardwareConfigLoader] hardware_profiles directory not found at:', hardwareProfilesDir);
        console.warn('[HardwareConfigLoader] Proceeding with empty profiles (deployment will use defaults)');
        this.isLoaded = true;
        return;
      }
      
      // Load master manifest
      const manifestPath = path.join(hardwareProfilesDir, 'hardware_manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      this.manifest = JSON.parse(manifestContent);

      // Load all CSV files referenced in the manifest
      for (const [modelName, modelConfig] of Object.entries(this.manifest)) {
        const csvPath = path.join(hardwareProfilesDir, modelConfig.csv_file);
        const envVars = await this.loadCSV(csvPath);
        
        // Store profile with all metadata
        this.profiles[modelName] = {
          type: modelConfig.type,
          services: modelConfig.services,
          csvFile: modelConfig.csv_file,
          environmentVariables: envVars
        };
      }

      this.isLoaded = true;
      console.log(`[HardwareConfigLoader] Loaded ${Object.keys(this.profiles).length} hardware profiles`);
    } catch (error) {
      console.error('[HardwareConfigLoader] Failed to load hardware profiles:', error);
      // Don't throw - allow the system to continue without hardware profiles
      // Deployment will use defaults
      this.isLoaded = true;
    }
  }

  /**
   * Load and parse a single CSV file into an object
   * Supports "KEY,VALUE" format (same as demo.csv)
   */
  loadCSV(csvPath) {
    return new Promise((resolve, reject) => {
      const envVars = {};
      
      fs.createReadStream(csvPath)
        .pipe(csv({ headers: false }))
        .on('data', (row) => {
          // CSV parser creates an object like { '0': 'KEY', '1': 'VALUE' }
          const keys = Object.keys(row);
          if (keys.length >= 2) {
            const key = row[keys[0]];
            const value = row[keys[1]];
            envVars[key] = value;
          }
        })
        .on('end', () => {
          resolve(envVars);
        })
        .on('error', reject);
    });
  }

  /**
   * Get hardware profile by model name
   * Returns null if not found
   */
  getProfile(modelName) {
    return this.profiles[modelName] || null;
  }

  /**
   * Get all loaded hardware profiles
   */
  getAllProfiles() {
    return this.profiles;
  }

  /**
   * Get list of available hardware models of a specific type
   */
  getModelsByType(type) {
    return Object.entries(this.profiles)
      .filter(([_, profile]) => profile.type === type)
      .map(([modelName, _]) => modelName);
  }

  /**
   * Check if a hardware model is registered
   */
  hasModel(modelName) {
    return modelName in this.profiles;
  }
}

module.exports = new HardwareConfigLoader();
