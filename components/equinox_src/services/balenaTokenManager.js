const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

class BalenaTokenManager {
  constructor() {
    this.token = null;
    this.loadedFrom = null;
  }

  hasAwsCredentials() {
    return Boolean(
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      process.env.AWS_SESSION_TOKEN ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.AWS_PROFILE
    );
  }

  /**
   * Load Balena token from secure storage
   * Tries (in order): BALENA_API_TOKEN env var, S3 bucket, secure config file, .env file
   */
  async loadToken() {
    if (this.token) {
      console.log('[BalenaTokenManager] Token already loaded');
      return this.token;
    }

    try {
      // Try environment variable first (most secure for containerized deployments)
      if (process.env.BALENA_API_TOKEN) {
        this.token = process.env.BALENA_API_TOKEN;
        this.loadedFrom = 'environment variable';
        console.log('[BalenaTokenManager] Loaded token from BALENA_API_TOKEN env var');
        return this.token;
      }

      // Try S3 bucket
      const s3Bucket = process.env.EQUINOX_TOKEN_BUCKET;
      const s3Key = process.env.EQUINOX_TOKEN_KEY || 'balena-api-token.json';
      if (s3Bucket && this.hasAwsCredentials()) {
        try {
          console.log(`[BalenaTokenManager] Attempting to fetch token from S3: s3://${s3Bucket}/${s3Key}`);
          const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
          const command = new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key });
          const response = await s3Client.send(command);
          
          // Convert stream to string
          let bodyString = '';
          for await (const chunk of response.Body) {
            bodyString += chunk instanceof Uint8Array 
              ? Buffer.from(chunk).toString('utf-8')
              : chunk;
          }
          
          const config = JSON.parse(bodyString);
          if (config.token) {
            this.token = config.token;
            this.loadedFrom = `S3 (s3://${s3Bucket}/${s3Key})`;
            console.log('[BalenaTokenManager] Loaded token from S3 bucket');
            
            // Persist to local secure config so it's available even if AWS creds are unavailable later
            try {
              const configDir = '/etc/equinox';
              const configPath = path.join(configDir, 'balena-token.json');
              if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
              }
              fs.writeFileSync(configPath, JSON.stringify({ token: this.token }), {
                mode: 0o600
              });
              console.log('[BalenaTokenManager] Persisted token to secure config file for future use');
            } catch (persistError) {
              console.warn(`[BalenaTokenManager] Warning: Failed to persist token locally: ${persistError.message}`);
              // Don't fail the load - token is still available in memory
            }
            
            return this.token;
          }
        } catch (s3Error) {
          console.warn(`[BalenaTokenManager] Failed to fetch token from S3: ${s3Error.message}`);
        }
      } else if (s3Bucket) {
        console.warn('[BalenaTokenManager] Skipping S3 token lookup because AWS credentials are not configured in the container');
      }

      // Fallback: try secure config file
      const configPath = path.join('/etc/equinox', 'balena-token.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.token) {
          this.token = config.token;
          this.loadedFrom = 'secure config file';
          console.log('[BalenaTokenManager] Loaded token from secure config file');
          return this.token;
        }
      }

      // If running in development, try .env file (NEVER use in production)
      if (process.env.NODE_ENV !== 'production') {
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf-8');
          const tokenMatch = envContent.match(/BALENA_API_TOKEN=(.+)/);
          if (tokenMatch) {
            this.token = tokenMatch[1].trim();
            this.loadedFrom = '.env file (development only)';
            console.log('[BalenaTokenManager] Loaded token from .env file');
            return this.token;
          }
        }
      }

      console.warn('[BalenaTokenManager] No Balena API token found. Configure via: BALENA_API_TOKEN env var, S3 bucket with AWS credentials, or /etc/equinox/balena-token.json');
      return null;
    } catch (error) {
      console.error('[BalenaTokenManager] Error loading token:', error.message);
      return null;
    }
  }

  /**
   * Get the loaded token
   * Synchronously returns cached token or null
   * Call loadToken() first to fetch from S3/files
   */
  getToken() {
    if (!this.token) {
      console.warn('[BalenaTokenManager] Token not yet loaded. Call loadToken() first.');
    }
    return this.token;
  }

  /**
   * Async method to ensure token is loaded from S3/files
   * This handles lazy loading - if token isn't cached, it will try to load again
   * This is important for cases where AWS credentials become available after startup
   */
  async ensureToken() {
    if (!this.token) {
      console.log('[BalenaTokenManager] Token not cached, attempting to load...');
      await this.loadToken();
      if (this.token) {
        console.log(`[BalenaTokenManager] Successfully loaded token from ${this.loadedFrom}`);
      } else {
        console.warn('[BalenaTokenManager] Token still unavailable after load attempt');
      }
    }
    return this.token;
  }

  /**
   * Check if token is loaded
   */
  isLoaded() {
    return this.token !== null;
  }

  /**
   * Get info about where token was loaded from
   */
  getSourceInfo() {
    return this.loadedFrom || 'not loaded';
  }

  /**
   * Create a secure config file (for setup purposes)
   * IMPORTANT: This is only for setup - in production, use env vars
   */
  static createSecureConfigFile(token) {
    try {
      const configDir = '/etc/equinox';
      const configPath = path.join(configDir, 'balena-token.json');

      // Create directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
      }

      // Write config file with restricted permissions
      const config = { token };
      fs.writeFileSync(configPath, JSON.stringify(config), {
        mode: 0o600 // Read/write for owner only
      });

      console.log(`[BalenaTokenManager] Secure config file created at ${configPath}`);
      console.log('[BalenaTokenManager] File permissions set to 0600 (owner read/write only)');
      return true;
    } catch (error) {
      console.error('[BalenaTokenManager] Error creating secure config file:', error.message);
      return false;
    }
  }
}

module.exports = new BalenaTokenManager();
