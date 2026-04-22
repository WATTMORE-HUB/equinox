// EnForm CSV Configurator JavaScript

class CSVConfigurator {
    constructor() {
        this.bearerToken = '';
        this.deviceId = '';
        this.variableData = []; // Array of {name, value} objects from CSV
        this.generatedJSON = [];
        this.apiResults = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Step 1: File upload and device ID
        document.getElementById('variablesFile').addEventListener('change', (e) => {
            this.handleCSVUpload(e);
        });
        
        document.getElementById('processBtn').addEventListener('click', () => {
            this.processConfiguration();
        });
        
        document.getElementById('skipVariablesBtn').addEventListener('click', () => {
            this.skipToServiceSelection();
        });

        document.getElementById('deviceId').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this.canProceed()) {
                this.processConfiguration();
            }
        });
        
        document.getElementById('deviceId').addEventListener('input', () => {
            this.updateProcessButton();
        });
        
        document.getElementById('bearerToken').addEventListener('input', () => {
            this.updateProcessButton();
        });
        
        // File upload drag and drop
        const fileUploadArea = document.getElementById('fileUploadArea');
        
        fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.classList.add('dragover');
        });
        
        fileUploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('dragover');
        });
        
        fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0 && this.isCSVFile(files[0])) {
                document.getElementById('variablesFile').files = files;
                this.handleCSVUpload({ target: { files: files } });
            }
        });

        // Step 2: Preview and API
        document.getElementById('editBtn').addEventListener('click', () => {
            this.backToEdit();
        });
        
        document.getElementById('sendApiBtn').addEventListener('click', () => {
            this.sendViaAPI();
        });
        
        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadConfiguration();
        });
        
        document.getElementById('apiCompleteBtn').addEventListener('click', () => {
            this.showResultsStep();
        });

        // Step 3: Results
        document.getElementById('continueToServicesBtn').addEventListener('click', () => {
            this.showServiceSelection();
        });
        
        document.getElementById('startOverBtn').addEventListener('click', () => {
            this.startOver();
        });
        
        document.getElementById('downloadFinalBtn').addEventListener('click', () => {
            this.downloadConfiguration();
        });

        // Step 4: Service Selection
        document.getElementById('projectName').addEventListener('input', () => {
            this.updateCreateProjectButton();
        });
        
        // Service card click handlers
        document.querySelectorAll('.service-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = card.querySelector('.service-checkbox');
                    checkbox.checked = !checkbox.checked;
                }
                this.updateServiceCardState(card);
                this.updateCreateProjectButton();
            });
        });
        
        // Service checkbox handlers
        document.querySelectorAll('.service-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const card = e.target.closest('.service-card');
                this.updateServiceCardState(card);
                this.updateCreateProjectButton();
            });
        });
        
        document.getElementById('backToResultsBtn').addEventListener('click', () => {
            this.backToResults();
        });
        
        document.getElementById('createProjectBtn').addEventListener('click', () => {
            this.createProject();
        });
        
        // Step 5: Project Complete
        document.getElementById('deployToBalenaBtn').addEventListener('click', () => {
            this.showDeploymentStep();
        });
        
        document.getElementById('createAnotherBtn').addEventListener('click', () => {
            this.resetForNewProject();
        });
        
        document.getElementById('finishBtn').addEventListener('click', () => {
            this.startOver();
        });
        
        // Step 6: Deployment
        document.getElementById('balenaAppName').addEventListener('input', () => {
            this.updateDeploymentButton();
        });
        
        document.querySelectorAll('.requirement-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateDeploymentButton();
            });
        });
        
        document.getElementById('backToProjectBtn').addEventListener('click', () => {
            this.backToProject();
        });
        
        document.getElementById('startDeploymentBtn').addEventListener('click', () => {
            this.startDeployment();
        });
        
        // Step 7: Deployment Complete
        document.getElementById('openDashboardBtn').addEventListener('click', () => {
            this.openBalenaDashboard();
        });
        
        document.getElementById('deployAnotherBtn').addEventListener('click', () => {
            this.resetForNewProject();
        });
        
        document.getElementById('finishAllBtn').addEventListener('click', () => {
            this.startOver();
        });
    }

    isCSVFile(file) {
        return file.type === 'text/csv' || 
               file.type === 'application/vnd.ms-excel' || 
               file.name.toLowerCase().endsWith('.csv');
    }

    handleCSVUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!this.isCSVFile(file)) {
            alert('Please select a .csv file');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                this.parseCSV(content, file.name);
                
            } catch (error) {
                alert('Error reading CSV file: ' + error.message);
            }
        };
        
        reader.readAsText(file);
    }
    
    parseCSV(content, fileName) {
        try {
            const lines = content.trim().split('\n');
            this.variableData = [];
            
            const processedNames = new Set(); // Track duplicate names
            
            lines.forEach((line, index) => {
                const trimmedLine = line.trim();
                if (trimmedLine === '') return; // Skip empty lines
                
                // Simple CSV parsing - split by comma and handle basic quoting
                const values = this.parseCSVLine(trimmedLine);
                
                if (values.length < 2) {
                    console.warn(`Line ${index + 1}: Missing value, skipping - "${trimmedLine}"`);
                    return;
                }
                
                const variableName = values[0].trim();
                const variableValue = values[1].trim();
                
                if (variableName === '' || variableValue === '') {
                    console.warn(`Line ${index + 1}: Empty name or value, skipping - "${trimmedLine}"`);
                    return;
                }
                
                // Handle duplicate variable names
                if (processedNames.has(variableName)) {
                    console.warn(`Duplicate variable name found: "${variableName}" - using latest value`);
                    // Remove the previous entry
                    this.variableData = this.variableData.filter(item => item.name !== variableName);
                }
                
                processedNames.add(variableName);
                this.variableData.push({
                    name: variableName,
                    value: variableValue
                });
            });
            
            if (this.variableData.length === 0) {
                alert('The CSV file appears to be empty or contains no valid variable pairs. Please ensure your CSV has the format: variable_name,variable_value');
                return;
            }
            
            this.updateFileInfo(fileName, this.variableData.length);
            this.updateProcessButton();
            console.log(`Loaded ${this.variableData.length} unique variables from CSV file`);
            
        } catch (error) {
            alert('Error parsing CSV file: ' + error.message);
        }
    }
    
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current); // Add the last value
        return values;
    }
    
    updateFileInfo(fileName, variableCount) {
        document.getElementById('fileName').textContent = fileName;
        document.getElementById('variableCount').textContent = variableCount;
        document.getElementById('fileInfo').classList.remove('hidden');
        document.getElementById('fileUploadArea').classList.add('has-file');
        
        const uploadLabel = document.querySelector('.upload-label');
        uploadLabel.textContent = `✓ ${fileName} loaded successfully`;
        
        const uploadHint = document.querySelector('.upload-hint');
        uploadHint.textContent = `${variableCount} variable pairs found`;
    }
    
    canProceed() {
        return this.variableData.length > 0 
            && document.getElementById('deviceId').value.trim() !== ''
            && document.getElementById('bearerToken').value.trim() !== '';
    }
    
    updateProcessButton() {
        const button = document.getElementById('processBtn');
        if (this.canProceed()) {
            button.disabled = false;
        } else {
            button.disabled = true;
        }
    }
    
    processConfiguration() {
        if (!this.canProceed()) {
            if (this.variableData.length === 0) {
                alert('Please upload a CSV file first.');
            } else if (document.getElementById('bearerToken').value.trim() === '') {
                alert('Please enter your Balena Bearer Token.');
                document.getElementById('bearerToken').focus();
            } else {
                alert('Please enter a Balena Device ID.');
                document.getElementById('deviceId').focus();
            }
            return;
        }
        
        const deviceIdInput = document.getElementById('deviceId');
        const bearerTokenInput = document.getElementById('bearerToken');
        this.deviceId = deviceIdInput.value.trim();
        this.bearerToken = bearerTokenInput.value.trim();
        
        this.showLoading();
        
        // Generate JSON configuration from CSV data
        this.generatedJSON = this.variableData.map(variable => ({
            device: this.deviceId,
            name: variable.name,
            value: variable.value
        }));
        
        // Simulate processing time for better UX
        setTimeout(() => {
            this.showPreviewStep();
        }, 500);
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('processBtn').disabled = true;
    }

    showPreviewStep() {
        document.getElementById('device-step').classList.remove('active');
        document.getElementById('device-step').classList.add('hidden');
        document.getElementById('preview-step').classList.remove('hidden');
        document.getElementById('preview-step').classList.add('active');
        
        // Update preview information
        document.getElementById('totalVariablesPreview').textContent = this.variableData.length;
        document.getElementById('deviceIdPreview').textContent = this.deviceId;
        
        // Show CSV preview (first 10 entries)
        this.updateCSVPreview();
    }
    
    updateCSVPreview() {
        const container = document.getElementById('csvPreviewContainer');
        const preview = this.variableData.slice(0, 10);
        
        let html = '<table class="csv-preview-table"><thead><tr><th>Variable Name</th><th>Variable Value</th></tr></thead><tbody>';
        
        preview.forEach(variable => {
            html += `<tr><td>${this.escapeHtml(variable.name)}</td><td>${this.escapeHtml(variable.value)}</td></tr>`;
        });
        
        html += '</tbody></table>';
        
        if (this.variableData.length > 10) {
            html += `<p class="preview-note">... and ${this.variableData.length - 10} more variables</p>`;
        }
        
        container.innerHTML = html;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    backToEdit() {
        document.getElementById('preview-step').classList.remove('active');
        document.getElementById('preview-step').classList.add('hidden');
        document.getElementById('device-step').classList.remove('hidden');
        document.getElementById('device-step').classList.add('active');
        
        // Reset loading state
        document.getElementById('loading').classList.add('hidden');
        this.updateProcessButton();
    }
    
    async sendViaAPI() {
        // Show API progress section
        document.getElementById('apiProgress').classList.remove('hidden');
        
        // Disable buttons during API calls
        document.getElementById('editBtn').disabled = true;
        document.getElementById('sendApiBtn').disabled = true;
        document.getElementById('downloadBtn').disabled = true;
        
        // Initialize progress
        this.apiResults = [];
        const resultsContainer = document.getElementById('apiResults');
        resultsContainer.innerHTML = '<div class="api-result-item api-result-pending">Preparing to send variables...</div>';
        
        const variablesToSend = this.generatedJSON;
        let successCount = 0;
        let errorCount = 0;
        
        // Send each variable via API
        for (let i = 0; i < variablesToSend.length; i++) {
            const variable = variablesToSend[i];
            
            try {
                await this.sendSingleVariable(variable, i);
                successCount++;
            } catch (error) {
                errorCount++;
                this.logAPIResult(variable.name, 'error', error.message);
            }
            
            // Update progress
            this.updateAPIProgress(i + 1, variablesToSend.length);
            
            // Small delay between calls to avoid overwhelming the API
            await this.delay(200);
        }
        
        // Show completion
        this.completeAPIProcess(successCount, errorCount, variablesToSend.length);
    }
    
    async sendSingleVariable(variable, index) {
        const apiUrl = 'https://api.balena-cloud.com/v7/device_environment_variable';
        
        const payload = {
            device: variable.device,
            name: variable.name,
            value: variable.value
        };
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.bearerToken}`
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            this.logAPIResult(variable.name, 'success', 'Variable set successfully');
            return result;
            
        } catch (error) {
            console.error('API call failed for variable:', variable.name, error);
            throw error;
        }
    }
    
    logAPIResult(variableName, status, message) {
        const resultsContainer = document.getElementById('apiResults');
        const resultItem = document.createElement('div');
        resultItem.className = `api-result-item api-result-${status}`;
        
        const statusIcon = status === 'success' ? '✓' : '✗';
        resultItem.innerHTML = `${statusIcon} <strong>${this.escapeHtml(variableName)}</strong>: ${this.escapeHtml(message)}`;
        
        resultsContainer.appendChild(resultItem);
        resultsContainer.scrollTop = resultsContainer.scrollHeight;
    }
    
    updateAPIProgress(current, total) {
        const percentage = (current / total) * 100;
        document.getElementById('apiProgressFill').style.width = `${percentage}%`;
        document.getElementById('apiProgressText').textContent = `${current} of ${total} sent`;
    }
    
    completeAPIProcess(successCount, errorCount, totalCount) {
        // Update progress bar to 100%
        document.getElementById('apiProgressFill').style.width = '100%';
        document.getElementById('apiProgressText').textContent = `Complete: ${successCount} success, ${errorCount} errors`;
        
        // Show completion message
        const resultsContainer = document.getElementById('apiResults');
        const summaryItem = document.createElement('div');
        summaryItem.className = 'api-result-item';
        summaryItem.style.fontWeight = 'bold';
        summaryItem.style.borderTop = '2px solid #28a745';
        summaryItem.style.marginTop = '10px';
        summaryItem.style.paddingTop = '10px';
        
        if (errorCount === 0) {
            summaryItem.className += ' api-result-success';
            summaryItem.innerHTML = `✓ All ${successCount} variables sent successfully!`;
        } else {
            summaryItem.innerHTML = `⚠ ${successCount} successful, ${errorCount} failed out of ${totalCount} total`;
        }
        
        resultsContainer.appendChild(summaryItem);
        
        // Show completion button
        document.getElementById('apiCompleteBtn').classList.remove('hidden');
        
        // Store success count for results page
        this.successCount = successCount;
    }
    
    showResultsStep() {
        document.getElementById('preview-step').classList.remove('active');
        document.getElementById('preview-step').classList.add('hidden');
        document.getElementById('results-step').classList.remove('hidden');
        document.getElementById('results-step').classList.add('active');
        
        // Update results summary
        document.getElementById('successCount').textContent = this.successCount || 0;
        document.getElementById('deviceIdSummary').textContent = this.deviceId;
    }
    
    downloadConfiguration() {
        const jsonString = JSON.stringify(this.generatedJSON, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'csv_variables_config.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Show success message
        setTimeout(() => {
            alert('Configuration has been downloaded as csv_variables_config.json');
        }, 100);
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Service Selection Methods
    skipToServiceSelection() {
        // Skip variable configuration and go directly to service selection
        console.log('Skipping variable configuration - going to service selection');
        
        // Set flag to indicate we skipped variables
        this.skippedVariables = true;
        
        // Hide device step and show service step
        document.getElementById('device-step').classList.remove('active');
        document.getElementById('device-step').classList.add('hidden');
        document.getElementById('service-step').classList.remove('hidden');
        document.getElementById('service-step').classList.add('active');
        
        // Update the back button text since we skipped variables
        document.getElementById('backToResultsBtn').textContent = '← Back to Setup';
        
        // Update step headers since we skipped steps
        document.getElementById('serviceStepHeader').textContent = 'Step 2: Select Services and Create Project';
        document.getElementById('projectCompleteHeader').textContent = 'Step 3: Project Created Successfully!';
        
        // Focus on project name input
        setTimeout(() => document.getElementById('projectName').focus(), 100);
    }
    
    showServiceSelection() {
        document.getElementById('results-step').classList.remove('active');
        document.getElementById('results-step').classList.add('hidden');
        document.getElementById('service-step').classList.remove('hidden');
        document.getElementById('service-step').classList.add('active');
        
        // Update the back button text for normal flow (from results)
        document.getElementById('backToResultsBtn').textContent = '← Back to Results';
        
        // Ensure step headers are correct for normal flow
        document.getElementById('serviceStepHeader').textContent = 'Step 4: Select Services and Create Project';
        document.getElementById('projectCompleteHeader').textContent = 'Step 5: Project Created Successfully!';
        
        // Focus on project name input
        setTimeout(() => document.getElementById('projectName').focus(), 100);
    }
    
    backToResults() {
        document.getElementById('service-step').classList.remove('active');
        document.getElementById('service-step').classList.add('hidden');
        
        if (this.skippedVariables) {
            // If variables were skipped, go back to the initial device step
            document.getElementById('device-step').classList.remove('hidden');
            document.getElementById('device-step').classList.add('active');
        } else {
            // Normal flow - go back to results step
            document.getElementById('results-step').classList.remove('hidden');
            document.getElementById('results-step').classList.add('active');
        }
    }
    
    updateServiceCardState(card) {
        const checkbox = card.querySelector('.service-checkbox');
        if (checkbox.checked) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    }
    
    updateCreateProjectButton() {
        const projectName = document.getElementById('projectName').value.trim();
        const button = document.getElementById('createProjectBtn');
        
        if (projectName === '') {
            button.disabled = true;
        } else {
            button.disabled = false;
        }
    }
    
    getSelectedServices() {
        const selectedServices = [];
        document.querySelectorAll('.service-checkbox:checked').forEach(checkbox => {
            const card = checkbox.closest('.service-card');
            const serviceName = card.dataset.service;
            selectedServices.push(serviceName);
        });
        return selectedServices;
    }
    
    async createProject() {
        const projectName = document.getElementById('projectName').value.trim();
        const selectedServices = this.getSelectedServices();
        
        if (projectName === '') {
            alert('Please enter a project name');
            return;
        }
        
        // Validate project name (basic validation)
        if (!/^[a-zA-Z0-9_-]+$/.test(projectName)) {
            alert('Project name can only contain letters, numbers, hyphens, and underscores');
            return;
        }
        
        // Show progress
        document.getElementById('projectCreationProgress').classList.remove('hidden');
        document.getElementById('createProjectBtn').disabled = true;
        document.getElementById('backToResultsBtn').disabled = true;
        
        try {
            await this.buildProject(projectName, selectedServices);
            this.showProjectComplete(projectName, selectedServices);
        } catch (error) {
            alert('Error creating project: ' + error.message);
            document.getElementById('createProjectBtn').disabled = false;
            document.getElementById('backToResultsBtn').disabled = false;
        }
    }
    
    async buildProject(projectName, selectedServices) {
        this.logProgress('Initializing project creation...', 'info');
        this.updateProjectProgress(10, 'Starting project creation...');
        await this.delay(500);
        
        try {
            // First, try to use the server API if available
            this.logProgress('Connecting to project creation service...', 'info');
            this.updateProjectProgress(20, 'Connecting to server...');
            
            const serverUrl = 'http://localhost:3001';
            
            try {
                // Check if server is running
                const healthResponse = await fetch(`${serverUrl}/api/health`);
                if (!healthResponse.ok) throw new Error('Server not responding');
                
                this.logProgress('Server connected successfully', 'success');
                this.updateProjectProgress(40, 'Creating project via server...');
                
                // Create project via API
                const response = await fetch(`${serverUrl}/api/create-project`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        projectName: projectName,
                        selectedServices: selectedServices
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Server request failed');
                }
                
                const result = await response.json();
                this.logProgress('Project created successfully via server!', 'success');
                this.updateProjectProgress(100, 'Project creation complete!');
                
                // Store project info for display
                this.createdProject = {
                    name: projectName,
                    services: selectedServices,
                    path: result.projectPath || `finished_projects/${projectName}`,
                    serverCreated: true
                };
                
            } catch (serverError) {
                // Server not available, fall back to manual instructions
                this.logProgress('Server not available, providing manual instructions...', 'info');
                this.updateProjectProgress(50, 'Generating manual instructions...');
                
                const servicesParam = selectedServices.length > 0 ? selectedServices.join(',') : '';
                const command = `node create-project.js ${projectName}${servicesParam ? ' ' + servicesParam : ''}`;
                
                this.logProgress('Manual command generated', 'success');
                this.logProgress(`Command: ${command}`, 'info');
                this.updateProjectProgress(100, 'Instructions ready!');
                
                // Store project info for display
                this.createdProject = {
                    name: projectName,
                    services: selectedServices,
                    path: `finished_projects/${projectName}`,
                    command: command,
                    serverCreated: false
                };
            }
            
        } catch (error) {
            this.logProgress(`Error: ${error.message}`, 'error');
            throw error;
        }
    }
    
    logProgress(message, type = 'info') {
        const logContainer = document.getElementById('projectCreationLog');
        const logItem = document.createElement('div');
        logItem.className = `log-item ${type}`;
        logItem.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
        logContainer.appendChild(logItem);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    updateProjectProgress(percentage, text) {
        document.getElementById('projectProgressFill').style.width = `${percentage}%`;
        document.getElementById('projectProgressText').textContent = text;
    }
    
    showProjectComplete(projectName, selectedServices) {
        document.getElementById('service-step').classList.remove('active');
        document.getElementById('service-step').classList.add('hidden');
        document.getElementById('project-complete-step').classList.remove('hidden');
        document.getElementById('project-complete-step').classList.add('active');
        
        // Update project details
        document.getElementById('createdProjectName').textContent = projectName;
        document.getElementById('projectPath').textContent = `finished_projects/${projectName}/`;
        
        // Show the appropriate information based on creation method
        const commandElement = document.getElementById('projectPath');
        
        if (this.createdProject && this.createdProject.serverCreated) {
            // Server created the project
            commandElement.innerHTML = `
                <div style="background: #d4edda; color: #155724; padding: 15px; border-radius: 6px; margin: 10px 0; border: 1px solid #c3e6cb;">
                    <strong>✅ Project created successfully!</strong><br/>
                    Location: <code>${this.createdProject.path}</code>
                </div>
                <small style="color: #666; font-style: italic;">Your project is ready to deploy!</small>
            `;
        } else if (this.createdProject && this.createdProject.command) {
            // Manual creation required
            commandElement.innerHTML = `
                <div style="background: #fff3cd; color: #856404; padding: 15px; border-radius: 6px; margin: 10px 0; border: 1px solid #ffeaa7;">
                    <strong>⚠️ Server not running - Manual creation required</strong><br/>
                    To start the server: <code>npm start</code> or <code>node server.js</code>
                </div>
                <strong>Or run this command manually:</strong><br/>
                <code style="background: #2d3748; color: #e2e8f0; padding: 10px; border-radius: 6px; display: block; margin: 10px 0; font-family: 'Monaco', 'Menlo', monospace;">
                    cd /Users/drb/documents/enform/src/tools/configurator/NEW_configurator<br/>
                    ${this.createdProject.command}
                </code>
                <small style="color: #666; font-style: italic;">Then your project will be created at: finished_projects/${projectName}/</small>
            `;
        } else {
            // Fallback
            commandElement.innerHTML = `
                <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 6px; margin: 10px 0; border: 1px solid #f5c6cb;">
                    <strong>❌ Project creation failed</strong><br/>
                    Please try again or create manually using the command line tool.
                </div>
            `;
        }
        
        // Show included services
        const servicesList = document.getElementById('includedServicesList');
        const serviceNames = {
            'camera': '📸 Camera',
            'meter': '⚡ Meter',
            'inverter': '🔋 Inverter',
            'weather': '🌤️ Weather Station',
            'windspeed': '💨 Windspeed'
        };
        
        // Always include combine and heartbeat
        let servicesHtml = '<span class="service-badge">📊 Combine</span><span class="service-badge">💓 Heartbeat</span>';
        
        selectedServices.forEach(service => {
            if (serviceNames[service]) {
                servicesHtml += `<span class="service-badge">${serviceNames[service]}</span>`;
            }
        });
        
        servicesList.innerHTML = servicesHtml;
    }
    
    resetForNewProject() {
        // Clear project name
        document.getElementById('projectName').value = '';
        
        // Uncheck all services
        document.querySelectorAll('.service-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Remove selected state from cards
        document.querySelectorAll('.service-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // Hide progress and reset
        document.getElementById('projectCreationProgress').classList.add('hidden');
        document.getElementById('projectCreationLog').innerHTML = '';
        document.getElementById('createProjectBtn').disabled = true;
        document.getElementById('backToResultsBtn').disabled = false;
        
        // Go back to service selection
        document.getElementById('project-complete-step').classList.remove('active');
        document.getElementById('project-complete-step').classList.add('hidden');
        document.getElementById('service-step').classList.remove('hidden');
        document.getElementById('service-step').classList.add('active');
        
        // Update back button text based on whether variables were skipped
        if (this.skippedVariables) {
            document.getElementById('backToResultsBtn').textContent = '← Back to Setup';
        } else {
            document.getElementById('backToResultsBtn').textContent = '← Back to Results';
        }
        
        // Focus on project name input
        setTimeout(() => document.getElementById('projectName').focus(), 100);
    }
    
    // Deployment Methods
    showDeploymentStep() {
        // Update step headers based on whether variables were skipped
        if (this.skippedVariables) {
            document.getElementById('deploymentStepHeader').textContent = 'Step 4: Deploy to Balena';
            document.getElementById('deploymentCompleteHeader').textContent = 'Step 5: Deployment Complete!';
        } else {
            document.getElementById('deploymentStepHeader').textContent = 'Step 6: Deploy to Balena';
            document.getElementById('deploymentCompleteHeader').textContent = 'Step 7: Deployment Complete!';
        }
        
        document.getElementById('project-complete-step').classList.remove('active');
        document.getElementById('project-complete-step').classList.add('hidden');
        document.getElementById('deployment-step').classList.remove('hidden');
        document.getElementById('deployment-step').classList.add('active');
        
        // Pre-fill app name with project name if available
        if (this.createdProject && this.createdProject.name) {
            document.getElementById('balenaAppName').value = this.createdProject.name;
        }
        
        // Focus on app name input
        setTimeout(() => document.getElementById('balenaAppName').focus(), 100);
        
        // Update deployment button state
        this.updateDeploymentButton();
    }
    
    backToProject() {
        document.getElementById('deployment-step').classList.remove('active');
        document.getElementById('deployment-step').classList.add('hidden');
        document.getElementById('project-complete-step').classList.remove('hidden');
        document.getElementById('project-complete-step').classList.add('active');
    }
    
    updateDeploymentButton() {
        const appName = document.getElementById('balenaAppName').value.trim();
        const allRequirementsChecked = document.querySelectorAll('.requirement-checkbox:checked').length === 3;
        const button = document.getElementById('startDeploymentBtn');
        
        if (appName !== '' && allRequirementsChecked) {
            button.disabled = false;
        } else {
            button.disabled = true;
        }
    }
    
    async startDeployment() {
        const appName = document.getElementById('balenaAppName').value.trim();
        
        if (!this.createdProject) {
            alert('No project available for deployment');
            return;
        }
        
        // Show progress section
        document.getElementById('deploymentProgress').classList.remove('hidden');
        document.getElementById('startDeploymentBtn').disabled = true;
        document.getElementById('backToProjectBtn').disabled = true;
        
        try {
            await this.executeBalenaPush(appName);
        } catch (error) {
            alert('Deployment failed: ' + error.message);
            document.getElementById('startDeploymentBtn').disabled = false;
            document.getElementById('backToProjectBtn').disabled = false;
        }
    }
    
    async executeBalenaPush(appName) {
        this.logDeployment('Starting Balena deployment...', 'info');
        this.updateDeploymentProgress(10, 'Preparing deployment...');
        await this.delay(1000);
        
        // Show the manual command
        const projectPath = this.createdProject.serverCreated 
            ? this.createdProject.path 
            : `finished_projects/${this.createdProject.name}`;
        
        const deployCommand = `cd ${projectPath} && balena push ${appName}`;
        
        document.getElementById('deploymentCommandDisplay').innerHTML = `
            <div style="margin-bottom: 10px;">Navigate to your project directory and run:</div>
            <div style="background: #1a1a1a; padding: 10px; border-radius: 4px; margin: 10px 0;">
                <div>cd ${projectPath.replace(/.*\//, './')} # or full path: ${projectPath}</div>
                <div>balena push ${appName}</div>
            </div>
            <div style="color: #ffd700; font-size: 0.9rem; margin-top: 10px;">
                ⚠️ Note: This command needs to be run manually in your terminal as browser security prevents automatic execution.
            </div>
        `;
        
        this.updateDeploymentProgress(30, 'Command generated...');
        await this.delay(1000);
        
        try {
            // Try to use the server API to execute the command if available
            const serverUrl = 'http://localhost:3001';
            
            this.logDeployment('Attempting to execute deployment via server...', 'info');
            this.updateDeploymentProgress(50, 'Connecting to deployment service...');
            
            try {
                const response = await fetch(`${serverUrl}/api/deploy`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        projectPath: projectPath,
                        appName: appName
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    this.logDeployment('Deployment started via server!', 'success');
                    this.updateDeploymentProgress(100, 'Deployment initiated!');
                    
                    // Show deployment complete
                    await this.delay(2000);
                    this.showDeploymentComplete(appName);
                    return;
                } else {
                    throw new Error('Server deployment failed');
                }
                
            } catch (serverError) {
                this.logDeployment('Server deployment unavailable, manual execution required', 'warning');
                this.updateDeploymentProgress(80, 'Manual execution required...');
                await this.delay(2000);
                
                this.logDeployment('Please run the command shown above in your terminal', 'info');
                this.updateDeploymentProgress(90, 'Waiting for manual execution...');
                await this.delay(3000);
                
                this.updateDeploymentProgress(100, 'Instructions provided!');
                this.logDeployment('Deployment instructions complete', 'success');
                
                // Give user option to proceed
                const proceed = confirm('Have you successfully run the balena push command in your terminal?\n\nClick OK if the deployment has started, or Cancel to stay on this page.');
                if (proceed) {
                    this.showDeploymentComplete(appName);
                } else {
                    document.getElementById('startDeploymentBtn').disabled = false;
                    document.getElementById('backToProjectBtn').disabled = false;
                }
            }
            
        } catch (error) {
            this.logDeployment(`Deployment error: ${error.message}`, 'error');
            throw error;
        }
    }
    
    logDeployment(message, type = 'info') {
        const logContainer = document.getElementById('deploymentLog');
        const logItem = document.createElement('div');
        logItem.className = `log-item ${type}`;
        logItem.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
        logContainer.appendChild(logItem);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    updateDeploymentProgress(percentage, text) {
        document.getElementById('deploymentProgressFill').style.width = `${percentage}%`;
        document.getElementById('deploymentProgressText').textContent = text;
    }
    
    showDeploymentComplete(appName) {
        document.getElementById('deployment-step').classList.remove('active');
        document.getElementById('deployment-step').classList.add('hidden');
        document.getElementById('deployment-complete-step').classList.remove('hidden');
        document.getElementById('deployment-complete-step').classList.add('active');
        
        // Update deployment details
        document.getElementById('deployedAppName').textContent = appName;
        document.getElementById('appNameInCommand').textContent = appName;
        document.getElementById('appNameInCommand2').textContent = appName;
    }
    
    openBalenaDashboard() {
        // Open Balena Dashboard in a new tab
        window.open('https://dashboard.balena-cloud.com/', '_blank');
    }

    startOver() {
        this.bearerToken = '';
        this.deviceId = '';
        this.variableData = [];
        this.generatedJSON = [];
        this.apiResults = [];
        this.successCount = 0;
        this.skippedVariables = false;
        
        // Reset UI
        document.getElementById('bearerToken').value = '';
        document.getElementById('deviceId').value = '';
        document.getElementById('variablesFile').value = '';
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('processBtn').disabled = true;
        
        // Reset file upload area
        document.getElementById('fileInfo').classList.add('hidden');
        document.getElementById('fileUploadArea').classList.remove('has-file');
        document.querySelector('.upload-label').textContent = 'Choose a .csv file with variable names and values';
        document.querySelector('.upload-hint').textContent = 'Format: variable_name,variable_value (one pair per line)';
        
        // Reset API progress
        document.getElementById('apiProgress').classList.add('hidden');
        document.getElementById('apiCompleteBtn').classList.add('hidden');
        document.getElementById('editBtn').disabled = false;
        document.getElementById('sendApiBtn').disabled = false;
        document.getElementById('downloadBtn').disabled = false;
        
        // Reset service selection
        document.getElementById('projectName').value = '';
        document.querySelectorAll('.service-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.querySelectorAll('.service-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.getElementById('projectCreationProgress').classList.add('hidden');
        document.getElementById('projectCreationLog').innerHTML = '';
        document.getElementById('createProjectBtn').disabled = true;
        document.getElementById('backToResultsBtn').disabled = false;
        
        // Show first step
        document.getElementById('results-step').classList.remove('active');
        document.getElementById('results-step').classList.add('hidden');
        document.getElementById('preview-step').classList.remove('active');
        document.getElementById('preview-step').classList.add('hidden');
        document.getElementById('service-step').classList.remove('active');
        document.getElementById('service-step').classList.add('hidden');
        document.getElementById('project-complete-step').classList.remove('active');
        document.getElementById('project-complete-step').classList.add('hidden');
        document.getElementById('deployment-step').classList.remove('active');
        document.getElementById('deployment-step').classList.add('hidden');
        document.getElementById('deployment-complete-step').classList.remove('active');
        document.getElementById('deployment-complete-step').classList.add('hidden');
        document.getElementById('device-step').classList.remove('hidden');
        document.getElementById('device-step').classList.add('active');
        
        // Reset deployment form
        document.getElementById('balenaAppName').value = '';
        document.querySelectorAll('.requirement-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.getElementById('deploymentProgress').classList.add('hidden');
        document.getElementById('deploymentLog').innerHTML = '';
        document.getElementById('startDeploymentBtn').disabled = true;
        document.getElementById('backToProjectBtn').disabled = false;
        
        // Reset step headers to original
        document.getElementById('serviceStepHeader').textContent = 'Step 4: Select Services and Create Project';
        document.getElementById('projectCompleteHeader').textContent = 'Step 5: Project Created Successfully!';
        
        // Focus on bearer token input
        setTimeout(() => document.getElementById('bearerToken').focus(), 100);
    }
}

// Initialize the configurator when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CSVConfigurator();
});