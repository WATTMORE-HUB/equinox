// Wattmore Configurator JavaScript

class WattmoreConfigurator {
    constructor() {
        this.bearerToken = '';
        this.deviceId = '';
        this.variables = [];
        this.variableValues = {};
        this.currentVariableIndex = 0;
        this.generatedJSON = [];
        this.apiResults = [];
        
        this.init();
    }

    init() {
        this.loadVariables();
        this.setupEventListeners();
    }

    // Initialize without loading variables (now loaded from file)
    loadVariables() {
        // Variables will be loaded from uploaded file
        this.variables = [];
    }

    setupEventListeners() {
        // Step 1: File upload and device ID
        document.getElementById('variablesFile').addEventListener('change', (e) => {
            this.handleFileUpload(e);
        });
        
        document.getElementById('loadVariablesBtn').addEventListener('click', () => {
            this.handleConfigurationStart();
        });

        document.getElementById('deviceId').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this.canProceed()) {
                this.handleConfigurationStart();
            }
        });
        
        document.getElementById('deviceId').addEventListener('input', () => {
            this.updateStartButton();
        });
        
        document.getElementById('bearerToken').addEventListener('input', () => {
            this.updateStartButton();
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
            if (files.length > 0 && files[0].type === 'text/plain') {
                document.getElementById('variablesFile').files = files;
                this.handleFileUpload({ target: { files: files } });
            }
        });

        // Step 2: Variable navigation
        document.getElementById('prevBtn').addEventListener('click', () => {
            this.navigateVariable(-1);
        });

        document.getElementById('nextBtn').addEventListener('click', () => {
            this.navigateVariable(1);
        });

        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateConfiguration();
        });

        // Global keyboard navigation for variables
        document.addEventListener('keydown', (e) => {
            // Only handle keyboard shortcuts when in variables step
            if (!document.getElementById('variables-step').classList.contains('active')) {
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.currentVariableIndex === this.variables.length - 1) {
                    this.generateConfiguration();
                } else {
                    this.navigateVariable(1);
                }
            } else if (e.key === 'ArrowLeft' && e.ctrlKey) {
                e.preventDefault();
                this.navigateVariable(-1);
            } else if (e.key === 'ArrowRight' && e.ctrlKey) {
                e.preventDefault();
                this.navigateVariable(1);
            }
        });

        // Step 3: Results
        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadConfiguration();
        });
        
        document.getElementById('sendApiBtn').addEventListener('click', () => {
            this.sendViaAPI();
        });
        
        document.getElementById('apiCompleteBtn').addEventListener('click', () => {
            this.startOver();
        });

        document.getElementById('startOverBtn').addEventListener('click', () => {
            this.startOver();
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (file.type !== 'text/plain') {
            alert('Please select a .txt file');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                this.variables = content.trim().split('\n')
                    .map(v => v.trim())
                    .filter(v => v.length > 0)
                    .filter((v, i, arr) => arr.indexOf(v) === i); // Remove duplicates
                
                if (this.variables.length === 0) {
                    alert('The file appears to be empty or contains no valid variable names.');
                    return;
                }
                
                this.updateFileInfo(file.name, this.variables.length);
                this.updateStartButton();
                console.log(`Loaded ${this.variables.length} unique variables from file`);
                
            } catch (error) {
                alert('Error reading file: ' + error.message);
            }
        };
        
        reader.readAsText(file);
    }
    
    updateFileInfo(fileName, variableCount) {
        document.getElementById('fileName').textContent = fileName;
        document.getElementById('variableCount').textContent = variableCount;
        document.getElementById('fileInfo').classList.remove('hidden');
        document.getElementById('fileUploadArea').classList.add('has-file');
        
        const uploadLabel = document.querySelector('.upload-label');
        uploadLabel.textContent = `✓ ${fileName} loaded successfully`;
        
        const uploadHint = document.querySelector('.upload-hint');
        uploadHint.textContent = `${variableCount} variables found`;
    }
    
    canProceed() {
        return this.variables.length > 0 
            && document.getElementById('deviceId').value.trim() !== ''
            && document.getElementById('bearerToken').value.trim() !== '';
    }
    
    updateStartButton() {
        const button = document.getElementById('loadVariablesBtn');
        if (this.canProceed()) {
            button.disabled = false;
        } else {
            button.disabled = true;
        }
    }
    
    handleConfigurationStart() {
        if (!this.canProceed()) {
            if (this.variables.length === 0) {
                alert('Please upload a variables file first.');
            } else if (document.getElementById('bearerToken').value.trim() === '') {
                alert('Please enter your Balena Bearer Token.');
                document.getElementById('bearerToken').focus();
            } else {
                alert('Please enter a Balena UUID.');
                document.getElementById('deviceId').focus();
            }
            return;
        }
        
        const deviceIdInput = document.getElementById('deviceId');
        const bearerTokenInput = document.getElementById('bearerToken');
        this.deviceId = deviceIdInput.value.trim();
        this.bearerToken = bearerTokenInput.value.trim();
        
        this.showLoading();
        
        // Simulate processing time for better UX
        setTimeout(() => {
            this.setupVariableConfiguration();
            this.showVariablesStep();
        }, 500);
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('loadVariablesBtn').disabled = true;
    }

    setupVariableConfiguration() {
        const container = document.getElementById('variablesContainer');
        container.innerHTML = '';
        
        this.variables.forEach((variable, index) => {
            const formHtml = `
                <div class="variable-form" data-index="${index}">
                    <h3>${variable}</h3>
                    <div class="variable-info">
                        Variable ${index + 1} of ${this.variables.length} • <em>Optional - leave blank to skip</em>
                    </div>
                    <div class="form-group">
                        <label for="value_${index}">Value for ${variable} (optional):</label>
                        <input type="text" id="value_${index}" placeholder="Enter value for ${variable} or leave blank to skip">
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', formHtml);
        });

        this.currentVariableIndex = 0;
        this.updateVariableDisplay();
        this.updateProgress();
    }

    showVariablesStep() {
        document.getElementById('device-step').classList.remove('active');
        document.getElementById('device-step').classList.add('hidden');
        document.getElementById('variables-step').classList.remove('hidden');
        document.getElementById('variables-step').classList.add('active');
    }

    navigateVariable(direction) {
        // Save current value
        const currentInput = document.getElementById(`value_${this.currentVariableIndex}`);
        if (currentInput) {
            const value = currentInput.value.trim();
            if (value) {
                this.variableValues[this.variables[this.currentVariableIndex]] = value;
            }
        }

        this.currentVariableIndex += direction;
        
        // Boundary checks
        if (this.currentVariableIndex < 0) {
            this.currentVariableIndex = 0;
        } else if (this.currentVariableIndex >= this.variables.length) {
            this.currentVariableIndex = this.variables.length - 1;
        }

        this.updateVariableDisplay();
        this.updateProgress();
        this.updateNavigationButtons();
    }

    updateVariableDisplay() {
        // Hide all variable forms
        document.querySelectorAll('.variable-form').forEach(form => {
            form.classList.remove('active');
        });

        // Show current variable form
        const currentForm = document.querySelector(`[data-index="${this.currentVariableIndex}"]`);
        if (currentForm) {
            currentForm.classList.add('active');
            
            // Focus on input and restore saved value if exists
            const input = currentForm.querySelector('input');
            const variableName = this.variables[this.currentVariableIndex];
            if (this.variableValues[variableName]) {
                input.value = this.variableValues[variableName];
            }
            setTimeout(() => input.focus(), 100);
        }
    }

    updateProgress() {
        const completedCount = Object.keys(this.variableValues).length;
        const totalCount = this.variables.length;
        const currentPosition = this.currentVariableIndex + 1;
        const percentage = (currentPosition / totalCount) * 100;
        
        document.getElementById('progressFill').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = `${currentPosition} of ${totalCount} (${completedCount} configured)`;
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const generateBtn = document.getElementById('generateBtn');
        
        prevBtn.disabled = this.currentVariableIndex === 0;
        
        if (this.currentVariableIndex === this.variables.length - 1) {
            nextBtn.classList.add('hidden');
            generateBtn.classList.remove('hidden');
        } else {
            nextBtn.classList.remove('hidden');
            generateBtn.classList.add('hidden');
        }
    }

    generateConfiguration() {
        // Save current value
        const currentInput = document.getElementById(`value_${this.currentVariableIndex}`);
        if (currentInput) {
            const value = currentInput.value.trim();
            if (value) {
                this.variableValues[this.variables[this.currentVariableIndex]] = value;
            }
        }

        // Check if user wants to proceed with missing values
        const missingVariables = this.variables.filter(variable => 
            !this.variableValues[variable] || this.variableValues[variable].trim() === ''
        );

        if (missingVariables.length > 0) {
            const proceed = confirm(`${missingVariables.length} variables don't have values and will be skipped.\n\nDo you want to proceed with generating the configuration?\n\nClick OK to proceed or Cancel to continue editing.`);
            if (!proceed) {
                return;
            }
        }

        // Generate JSON only for variables that have values
        this.generatedJSON = this.variables
            .filter(variable => this.variableValues[variable] && this.variableValues[variable].trim() !== '')
            .map(variable => ({
                device: this.deviceId,
                name: variable,
                value: this.variableValues[variable]
            }));

        this.showResultsStep();
    }

    showResultsStep() {
        document.getElementById('variables-step').classList.remove('active');
        document.getElementById('variables-step').classList.add('hidden');
        document.getElementById('results-step').classList.remove('hidden');
        document.getElementById('results-step').classList.add('active');

        // Update summary
        const totalVariables = this.variables.length;
        const configuredVariables = this.generatedJSON.length;
        document.getElementById('totalVariables').textContent = `${configuredVariables} of ${totalVariables}`;
        document.getElementById('deviceIdSummary').textContent = this.deviceId;

        // Show preview (first 5 entries)
        const preview = this.generatedJSON.slice(0, 5);
        document.getElementById('jsonPreview').textContent = JSON.stringify(preview, null, 2);
    }

    downloadConfiguration() {
        const jsonString = JSON.stringify(this.generatedJSON, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'total_variables.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Also save to the directory by creating a download link
        this.saveToDirectory();
    }

    async saveToDirectory() {
        // This creates the file in the download directory
        // For a more integrated approach, you'd need a local server
        console.log('Configuration downloaded as total_variables.json');
        
        // Show success message
        setTimeout(() => {
            alert('Configuration has been downloaded as total_variables.json');
        }, 100);
    }
    
    async sendViaAPI() {
        // Show API progress section
        document.getElementById('apiProgress').classList.remove('hidden');
        
        // Disable buttons during API calls
        document.getElementById('downloadBtn').disabled = true;
        document.getElementById('sendApiBtn').disabled = true;
        
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
        resultItem.innerHTML = `${statusIcon} <strong>${variableName}</strong>: ${message}`;
        
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
        
        // Show completion button and re-enable other buttons
        document.getElementById('apiCompleteBtn').classList.remove('hidden');
        document.getElementById('downloadBtn').disabled = false;
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    startOver() {
        this.bearerToken = '';
        this.deviceId = '';
        this.variables = [];
        this.variableValues = {};
        this.currentVariableIndex = 0;
        this.generatedJSON = [];
        this.apiResults = [];
        
        // Reset UI
        document.getElementById('bearerToken').value = '';
        document.getElementById('deviceId').value = '';
        document.getElementById('variablesFile').value = '';
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('loadVariablesBtn').disabled = true;
        
        // Reset file upload area
        document.getElementById('fileInfo').classList.add('hidden');
        document.getElementById('fileUploadArea').classList.remove('has-file');
        document.querySelector('.upload-label').textContent = 'Choose a .txt file with variable names';
        document.querySelector('.upload-hint').textContent = 'One variable name per line';
        
        // Reset API progress
        document.getElementById('apiProgress').classList.add('hidden');
        document.getElementById('apiCompleteBtn').classList.add('hidden');
        document.getElementById('downloadBtn').disabled = false;
        document.getElementById('sendApiBtn').disabled = false;
        
        // Show first step
        document.getElementById('results-step').classList.remove('active');
        document.getElementById('results-step').classList.add('hidden');
        document.getElementById('device-step').classList.remove('hidden');
        document.getElementById('device-step').classList.add('active');
        
        // Focus on bearer token input
        setTimeout(() => document.getElementById('bearerToken').focus(), 100);
    }
}

// Initialize the configurator when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WattmoreConfigurator();
});
