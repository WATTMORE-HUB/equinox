#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const path = require('path');
const ProjectCreator = require('./create-project');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Create project endpoint
app.post('/api/create-project', async (req, res) => {
    try {
        const { projectName, selectedServices } = req.body;
        
        if (!projectName) {
            return res.status(400).json({ 
                error: 'Project name is required' 
            });
        }

        // Validate project name
        if (!/^[a-zA-Z0-9_-]+$/.test(projectName)) {
            return res.status(400).json({ 
                error: 'Project name can only contain letters, numbers, hyphens, and underscores' 
            });
        }

        console.log(`API: Creating project "${projectName}" with services: ${selectedServices?.join(', ') || 'none'}`);

        const creator = new ProjectCreator();
        const result = await creator.createProject(projectName, selectedServices || []);

        res.json({
            success: true,
            message: `Project "${projectName}" created successfully!`,
            projectPath: result.projectPath,
            services: result.services
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            error: error.message 
        });
    }
});

// Deploy project endpoint
app.post('/api/deploy', async (req, res) => {
    try {
        const { projectPath, appName } = req.body;
        
        if (!projectPath || !appName) {
            return res.status(400).json({ 
                error: 'Project path and app name are required' 
            });
        }

        console.log(`API: Deploying project at "${projectPath}" to app "${appName}"`);

        // Import required modules
        const { spawn } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        
        // Check if project path exists
        const absoluteProjectPath = path.resolve(projectPath);
        if (!fs.existsSync(absoluteProjectPath)) {
            return res.status(400).json({ 
                error: `Project path does not exist: ${absoluteProjectPath}` 
            });
        }
        
        // Check if docker-compose.yml exists
        const dockerComposePath = path.join(absoluteProjectPath, 'docker-compose.yml');
        if (!fs.existsSync(dockerComposePath)) {
            return res.status(400).json({ 
                error: 'docker-compose.yml not found in project directory' 
            });
        }

        // Execute balena push command
        const balenaProcess = spawn('balena', ['push', appName], {
            cwd: absoluteProjectPath,
            stdio: ['inherit', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        balenaProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log('Balena stdout:', data.toString());
        });

        balenaProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log('Balena stderr:', data.toString());
        });

        balenaProcess.on('close', (code) => {
            if (code === 0) {
                console.log('Balena push completed successfully');
            } else {
                console.log(`Balena push exited with code ${code}`);
            }
        });

        // Don't wait for completion, return immediately since balena push takes a long time
        res.json({
            success: true,
            message: `Deployment started for "${appName}"`,
            projectPath: absoluteProjectPath,
            command: `balena push ${appName}`
        });

    } catch (error) {
        console.error('Deployment API Error:', error);
        res.status(500).json({ 
            error: error.message 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
    console.log(`[LAUNCH] EnForm Configurator Server running at http://localhost:${port}`);
    console.log(`📁 Serving static files from: ${__dirname}`);
    console.log(`🎯 API endpoint: http://localhost:${port}/api/create-project`);
    console.log(`\n💡 Open http://localhost:${port}/index.html to use the configurator`);
});

module.exports = app;