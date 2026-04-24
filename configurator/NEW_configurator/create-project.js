#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

class ProjectCreator {
    constructor() {
        this.componentsPath = path.join(__dirname, 'components');
        this.finishedProjectsPath = path.join(__dirname, '..', 'finished_projects');
    }

    async createProject(projectName, selectedServices = []) {
        try {
            console.log(`Creating project: ${projectName}`);
            console.log(`Selected services: ${selectedServices.join(', ')}`);

            // Create project directory
            const projectPath = path.join(this.finishedProjectsPath, projectName);
            await this.ensureDir(projectPath);
            
            // Create src directory
            const srcPath = path.join(projectPath, 'src');
            await this.ensureDir(srcPath);

            // Copy base files
            await this.copyBaseFiles(projectPath);

            // Process services
            const serviceMapping = {
                'camera': 'camera_control',
                'meter': 'meter_collect',
                'inverter': 'inverter_collect',
                'weather': 'weather_collect',
                'windspeed': 'windspeed_collect'
            };

            // Always include these services
            const alwaysIncluded = ['combine', 'heartbeat'];
            const allServiceDirs = [...alwaysIncluded, ...selectedServices.map(s => serviceMapping[s] || s)];

            // Copy service files
            for (const serviceDir of allServiceDirs) {
                await this.copyServiceFiles(serviceDir, projectPath, srcPath, serviceDir === 'camera_control');
            }

            // Always copy Equinox service files (prefixed with equinox_)
            await this.copyEquinoxFiles(projectPath, srcPath);

            // Modify docker-compose.yml to comment out unused services
            await this.modifyDockerCompose(projectPath, selectedServices);

            console.log(`✅ Project '${projectName}' created successfully at: ${projectPath}`);
            
            return {
                success: true,
                projectPath: projectPath,
                services: allServiceDirs
            };

        } catch (error) {
            console.error(`❌ Error creating project: ${error.message}`);
            throw error;
        }
    }

    async ensureDir(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async copyBaseFiles(projectPath) {
        console.log('📋 Copying base files...');
        
        const baseFiles = ['docker-compose.yml', 'license.md', 'requirements.txt'];
        
        for (const file of baseFiles) {
            const sourcePath = path.join(this.componentsPath, file);
            const destPath = path.join(projectPath, file);
            
            try {
                await fs.copyFile(sourcePath, destPath);
                console.log(`  ✓ Copied ${file}`);
            } catch (error) {
                console.error(`  ❌ Failed to copy ${file}: ${error.message}`);
                throw error;
            }
        }
    }

    async copyServiceFiles(serviceDir, projectPath, srcPath, includeTemplates = false) {
        console.log(`🔧 Processing service: ${serviceDir}`);
        
        const sourcePath = path.join(this.componentsPath, serviceDir);
        
        try {
            // Check if source directory exists
            const stats = await fs.stat(sourcePath);
            if (!stats.isDirectory()) {
                console.warn(`  ⚠️ ${serviceDir} is not a directory, skipping`);
                return;
            }

            // Get all files in the service directory
            const files = await fs.readdir(sourcePath, { withFileTypes: true });
            
            for (const file of files) {
                const sourceFilePath = path.join(sourcePath, file.name);
                
                if (file.isFile()) {
                    if (file.name.endsWith('.Dockerfile')) {
                        // Copy Dockerfile to project root
                        const destPath = path.join(projectPath, file.name);
                        await fs.copyFile(sourceFilePath, destPath);
                        console.log(`  ✓ Copied ${file.name} to project root`);
                    } else if (file.name.endsWith('.py')) {
                        // Copy Python files to src directory
                        const destPath = path.join(srcPath, file.name);
                        await fs.copyFile(sourceFilePath, destPath);
                        console.log(`  ✓ Copied ${file.name} to src/`);
                    } else {
                        // Copy other files to project root
                        const destPath = path.join(projectPath, file.name);
                        await fs.copyFile(sourceFilePath, destPath);
                        console.log(`  ✓ Copied ${file.name} to project root`);
                    }
                } else if (file.isDirectory() && file.name === 'templates' && includeTemplates) {
                    // Special handling for templates directory (camera service)
                    const templatesDestPath = path.join(projectPath, 'templates');
                    await this.copyDirectory(sourceFilePath, templatesDestPath);
                    console.log(`  ✓ Copied templates/ directory`);
                }
            }
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`  ⚠️ Service directory ${serviceDir} not found, skipping`);
            } else {
                console.error(`  ❌ Error processing ${serviceDir}: ${error.message}`);
                throw error;
            }
        }
    }

    async copyEquinoxFiles(projectPath, srcPath) {
        console.log(`🔧 Processing service: equinox`);
        
        try {
            // Copy equinox.Dockerfile
            const dockerfileSrc = path.join(this.componentsPath, 'equinox.Dockerfile');
            const dockerfileDest = path.join(projectPath, 'equinox.Dockerfile');
            await fs.copyFile(dockerfileSrc, dockerfileDest);
            console.log(`  ✓ Copied equinox.Dockerfile to project root`);
            
            // Copy equinox_package.json
            const packageSrc = path.join(this.componentsPath, 'equinox_package.json');
            const packageDest = path.join(projectPath, 'equinox_package.json');
            await fs.copyFile(packageSrc, packageDest);
            console.log(`  ✓ Copied equinox_package.json`);
            
            // Copy equinox_package-lock.json
            const lockSrc = path.join(this.componentsPath, 'equinox_package-lock.json');
            const lockDest = path.join(projectPath, 'equinox_package-lock.json');
            await fs.copyFile(lockSrc, lockDest);
            console.log(`  ✓ Copied equinox_package-lock.json`);
            
            // Copy equinox_src directory
            const srcSourcePath = path.join(this.componentsPath, 'equinox_src');
            const srcDestPath = path.join(projectPath, 'equinox_src');
            await this.copyDirectory(srcSourcePath, srcDestPath);
            console.log(`  ✓ Copied equinox_src/`);
            
            // Copy equinox_public directory
            const publicSourcePath = path.join(this.componentsPath, 'equinox_public');
            const publicDestPath = path.join(projectPath, 'equinox_public');
            await this.copyDirectory(publicSourcePath, publicDestPath);
            console.log(`  ✓ Copied equinox_public/`);
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`  ⚠️ Equinox files not found, skipping`);
            } else {
                console.error(`  ❌ Error processing equinox: ${error.message}`);
                throw error;
            }
        }
    }

    async copyDirectory(source, destination) {
        await this.ensureDir(destination);
        
        const files = await fs.readdir(source, { withFileTypes: true });
        
        for (const file of files) {
            const sourcePath = path.join(source, file.name);
            const destPath = path.join(destination, file.name);
            
            if (file.isDirectory()) {
                await this.copyDirectory(sourcePath, destPath);
            } else {
                await fs.copyFile(sourcePath, destPath);
            }
        }
    }

    async modifyDockerCompose(projectPath, selectedServices) {
        console.log('🐳 Modifying docker-compose.yml...');
        
        const dockerComposePath = path.join(projectPath, 'docker-compose.yml');
        
        try {
            let content = await fs.readFile(dockerComposePath, 'utf8');
            
            // Define service mappings
            const serviceToDockerService = {
                'camera': 'video-server',
                'meter': 'operate-meter-collect',
                'inverter': 'operate-inverter-collect',
                'weather': 'operate-weather-collect',
                'windspeed': 'operate-windspeed-collect'
            };
            
            // Services that should always be enabled
            const alwaysEnabled = [
                'operate-combine',
                'operate-heartbeat',
                'postgres',
                'equinox'
            ];
            
            // Get Docker services that should be enabled
            const enabledDockerServices = [
                ...alwaysEnabled,
                ...selectedServices.map(s => serviceToDockerService[s]).filter(Boolean)
            ];
            
            // Comment out services that are not selected
            const allDockerServices = [
                'video-server',
                'operate-register-test',
                'operate-config',
                'operate-heartbeat',
                'operate-meter-collect',
                'operate-inverter-collect',
                'operate-weather-collect',
                'operate-windspeed-collect',
                'operate-combine',
                'postgres',
                'equinox'
            ];
            
            for (const service of allDockerServices) {
                if (!enabledDockerServices.includes(service)) {
                    // Comment out this service
                    content = this.commentOutService(content, service);
                    console.log(`  ✓ Commented out service: ${service}`);
                }
            }
            
            // Write the modified content back
            await fs.writeFile(dockerComposePath, content, 'utf8');
            console.log('  ✓ docker-compose.yml updated');
            
        } catch (error) {
            console.error(`  ❌ Error modifying docker-compose.yml: ${error.message}`);
            throw error;
        }
    }

    commentOutService(content, serviceName) {
        const lines = content.split('\n');
        let inService = false;
        let serviceIndent = 0;
        let result = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Check if this line starts the service we want to comment out
            if (trimmedLine === `${serviceName}:`) {
                inService = true;
                serviceIndent = line.length - line.trimStart().length;
                result.push(`#${line}`);
                continue;
            }
            
            if (inService) {
                const currentIndent = line.length - line.trimStart().length;
                
                // If we hit a line with same or less indentation and it's not empty, we're out of the service
                if (line.trim() !== '' && currentIndent <= serviceIndent) {
                    // Check if this is another service or a top-level key
                    if (trimmedLine.endsWith(':') && !trimmedLine.startsWith('#')) {
                        inService = false;
                    }
                }
                
                if (inService) {
                    result.push(`#${line}`);
                } else {
                    result.push(line);
                }
            } else {
                result.push(line);
            }
        }
        
        return result.join('\n');
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error('Usage: node create-project.js <project-name> [service1,service2,...]');
        console.error('Available services: camera, meter, inverter, weather, windspeed');
        process.exit(1);
    }
    
    const projectName = args[0];
    const selectedServices = args[1] ? args[1].split(',').map(s => s.trim()) : [];
    
    const creator = new ProjectCreator();
    creator.createProject(projectName, selectedServices)
        .then((result) => {
            console.log('\n🎉 Project creation completed successfully!');
            console.log(JSON.stringify(result, null, 2));
        })
        .catch((error) => {
            console.error('\n💥 Project creation failed:', error.message);
            process.exit(1);
        });
}

module.exports = ProjectCreator;