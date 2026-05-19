FROM node:18-alpine

WORKDIR /app

# Copy Equinox package files (renamed to avoid conflicts with other services)
COPY equinox_package.json package.json
COPY equinox_package-lock.json package-lock.json

# Install production dependencies only
RUN npm ci --only=production

# Copy Equinox application code (renamed directories in components)
COPY equinox_src src
COPY equinox_public public

# Copy hardware profiles for configuration loader
COPY hardware_profiles hardware_profiles

# Make Python dependency installer executable
RUN chmod +x /app/src/install-python-deps.sh

# Expose port for web UI
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:80/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Install Python packages on startup before starting the server
CMD ["/bin/sh", "-c", "/app/src/install-python-deps.sh && node src/start.js"]
