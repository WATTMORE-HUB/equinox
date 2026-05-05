const fs = require('fs');
const path = require('path');

// On CM4, this will be mounted at /collect_data
const COLLECT_DATA_PATH = process.env.COLLECT_DATA_PATH || path.join(__dirname, '../../collect_data');

/**
 * Validate data files for a deployment
 * @param {Object} deployment - Deployment record from state
 * @returns {Promise<Object>} Validation result with allFilesPresent and missingFiles
 */
async function validateDeploymentData(deployment) {
  const result = {
    allFilesPresent: true,
    missingFiles: [],
    foundFiles: []
  };

  try {
    if (!deployment.expectedJsonFiles || deployment.expectedJsonFiles.length === 0) {
      return result;
    }

    // Check if collect_data directory exists
    if (!fs.existsSync(COLLECT_DATA_PATH)) {
      result.allFilesPresent = false;
      result.missingFiles = deployment.expectedJsonFiles;
      console.warn(`collect_data path does not exist: ${COLLECT_DATA_PATH}`);
      return result;
    }

    // Read all files in collect_data
    const files = fs.readdirSync(COLLECT_DATA_PATH);
    const now = Date.now();

    // Check each expected file pattern
    for (const expectedPattern of deployment.expectedJsonFiles) {
      const matchingFiles = findMatchingFiles(expectedPattern, files);

      if (matchingFiles.length === 0) {
        result.allFilesPresent = false;
        result.missingFiles.push(expectedPattern);
      } else {
        // Check if files are fresh (modified within last 60 seconds)
        const isFresh = matchingFiles.some(filename => {
          const filepath = path.join(COLLECT_DATA_PATH, filename);
          try {
            const stat = fs.statSync(filepath);
            return (now - stat.mtimeMs) < 60000; // Fresh within 1 minute
          } catch {
            return false;
          }
        });

        if (isFresh) {
          result.foundFiles.push(...matchingFiles);
        } else {
          // Files exist but are stale
          result.allFilesPresent = false;
          result.missingFiles.push(`${expectedPattern} (stale)`);
        }
      }
    }

  } catch (err) {
    console.error(`Error validating data for deployment ${deployment.id}:`, err);
    result.allFilesPresent = false;
  }

  return result;
}

/**
 * Find files matching a pattern (supports * wildcards)
 * @param {String} pattern - File pattern (e.g., "windspeed_*.json")
 * @param {Array} files - List of files to search
 * @returns {Array} Matching files
 */
function findMatchingFiles(pattern, files) {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);

  return files.filter(file => regex.test(file));
}

module.exports = {
  validateDeploymentData,
  findMatchingFiles
};
