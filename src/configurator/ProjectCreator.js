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
