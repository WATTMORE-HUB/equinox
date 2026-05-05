/**
 * Wrapper around the existing ProjectCreator from the configurator tool
 * This file bridges the deployer service to the existing create-project.js logic
 */

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFilePromise = promisify(execFile);

class ProjectCreator {
  constructor() {
    // Paths where create-project.js might be located
    this.configuratorPaths = [
      // Local development path (relative to this project)
      path.join(__dirname, '../../../configurator/NEW_configurator'),
      // Production path on CM4
      '/app/src/configurator',
      // Alternative paths
      path.join(process.cwd(), 'configurator', 'NEW_configurator')
    ];
    
    this.finishedProjectsPath = this.findFinishedProjectsPath();
  }

  findFinishedProjectsPath() {
    // Try to find the finished_projects directory
    const possiblePaths = [
      path.join(__dirname, '../../../configurator/finished_projects'),
      '/app/finished_projects',
      path.join(process.cwd(), 'finished_projects')
    ];

    // Return the first one that exists, or default to a writable location
    for (const p of possiblePaths) {
      try {
        if (require('fs').existsSync(p)) {
          return p;
        }
      } catch (e) {
        // Continue to next path
      }
    }

    // Default to /tmp if nothing else works
    return '/tmp/enform_projects';
  }

  async findCreateProjectJs() {
    for (const basePath of this.configuratorPaths) {
      const createProjectPath = path.join(basePath, 'create-project.js');
      try {
        const stats = require('fs').statSync(createProjectPath);
        if (stats.isFile()) {
          console.log(`Found create-project.js at: ${createProjectPath}`);
          return createProjectPath;
        }
      } catch (e) {
        // Continue to next path
      }
    }

    throw new Error('Could not find create-project.js in any of the expected locations');
  }

  /**
   * Create Equinox Dockerfile in components directory
   */
  async createEquinoxDockerfile(projectPath) {
    try {
      const equinoxDockerfilePath = path.join(projectPath, 'equinox.Dockerfile');
      const equinoxSourcePath = path.join(__dirname, '..', '..');
      const sourceDockerfilePath = path.join(equinoxSourcePath, 'Dockerfile');
      
      // Copy the Equinox Dockerfile
      await require('fs').promises.copyFile(sourceDockerfilePath, equinoxDockerfilePath);
      console.log('[ProjectCreator] Created equinox.Dockerfile');
      
      // Copy Equinox code files
      const filesToCopy = ['package.json', 'package-lock.json', 'public', 'src'];
      
      for (const file of filesToCopy) {
        const src = path.join(equinoxSourcePath, file);
        const dest = path.join(projectPath, 'equinox_' + file);
        
        try {
          const stats = require('fs').statSync(src);
          if (stats.isDirectory()) {
            await this.copyDirectory(src, dest);
          } else {
            await require('fs').promises.copyFile(src, dest);
          }
        } catch (e) {
          console.warn(`[ProjectCreator] Could not copy ${file}: ${e.message}`);
        }
      }
      
      console.log('[ProjectCreator] Copied Equinox code files');
    } catch (err) {
      console.warn(`[ProjectCreator] Warning: Could not create Equinox Dockerfile: ${err.message}`);
    }
  }

  /**
   * Recursively copy a directory
   */
  async copyDirectory(src, dest) {
    const files = await require('fs').promises.readdir(src);
    await require('fs').promises.mkdir(dest, { recursive: true });
    
    for (const file of files) {
      // Skip node_modules and .git
      if (file === 'node_modules' || file === '.git' || file === '.gitignore') continue;
      
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stats = await require('fs').promises.stat(srcPath);
      
      if (stats.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await require('fs').promises.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Add Equinox monitoring/chat service to docker-compose.yml
   */
  async addEquinoxService(projectPath) {
    try {
      const composeFilePath = path.join(projectPath, 'docker-compose.yml');
      const composeContent = await require('fs').promises.readFile(composeFilePath, 'utf-8');
      
      // Equinox service definition
      const equinoxServiceYaml = `  equinox:
    build:
      context: ./equinox
      dockerfile: Dockerfile
    container_name: equinox
    restart: always
    ports:
      - "80:80"
    environment:
      - PORT=80
      - NODE_ENV=production
      - STATE_FILE_PATH=/collect_data/state.json
      - COLLECT_DATA_PATH=/collect_data
      - DOCKER_SOCKET=/var/run/docker.sock
      - LOG_CHECK_INTERVAL=3600000
      - VALIDATION_WINDOW=600000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - collect_data:/collect_data
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:80/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
`;

      // Find the services section and add Equinox
      let modifiedContent = composeContent;
      
      // Simple approach: if it already has equinox, skip
      if (!modifiedContent.includes('equinox:')) {
        // Find where to insert (after the first service definition ends)
        // Insert before 'volumes:' section if it exists
        if (modifiedContent.includes('volumes:')) {
          modifiedContent = modifiedContent.replace('volumes:', equinoxServiceYaml + 'volumes:');
        } else {
          // Append before the end
          modifiedContent = modifiedContent.trim() + '\n' + equinoxServiceYaml;
        }
      }

      await require('fs').promises.writeFile(composeFilePath, modifiedContent, 'utf-8');
      console.log('[ProjectCreator] Added Equinox service to docker-compose.yml');
    } catch (err) {
      console.warn(`[ProjectCreator] Warning: Could not add Equinox service: ${err.message}`);
      // Don't fail the deployment if we can't add Equinox
    }
  }

  /**
   * Create a project with selected services
   * Uses the existing create-project.js via child process to avoid path issues
   */
  async createProject(projectName, selectedServices = []) {
    try {
      const createProjectPath = await this.findCreateProjectJs();
      const servicesList = selectedServices.join(',');

      console.log(`Executing: node ${createProjectPath} ${projectName} ${servicesList}`);

      const { stdout, stderr } = await execFilePromise('node', [
        createProjectPath,
        projectName,
        servicesList
      ]);

      console.log('Project creation output:');
      console.log(stdout);

      if (stderr) {
        console.warn('Warnings:', stderr);
      }

      // Parse the JSON result from the output.
      // create-project.js prints pretty JSON at the end, so capture the full object.
      const lines = stdout.split('\n');
      const jsonStartIndex = lines.findIndex((line) => line.trim().startsWith('{'));

      if (jsonStartIndex === -1) {
        throw new Error('Could not parse project creation result');
      }

      let resultJson = '';
      let braceDepth = 0;
      let foundOpeningBrace = false;

      for (let i = jsonStartIndex; i < lines.length; i++) {
        const line = lines[i];
        resultJson += `${line}\n`;

        for (const char of line) {
          if (char === '{') {
            braceDepth += 1;
            foundOpeningBrace = true;
          } else if (char === '}') {
            braceDepth -= 1;
          }
        }

        if (foundOpeningBrace && braceDepth === 0) {
          break;
        }
      }

      const result = JSON.parse(resultJson.trim());

      // Now add Equinox service to the generated docker-compose.yml
      await this.addEquinoxService(result.projectPath);

      return {
        success: true,
        projectPath: result.projectPath,
        services: result.services
      };

    } catch (error) {
      console.error(`Failed to create project: ${error.message}`);
      throw new Error(`Project creation failed: ${error.message}`);
    }
  }
}

module.exports = ProjectCreator;
