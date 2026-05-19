FROM node:18-alpine

WORKDIR /app

# Install Python 3 for register_test.py
RUN apk add --no-cache python3 py3-pip py3-serial && \
    pip install --no-cache-dir --default-timeout=100 minimalmodbus==2.1.1 pymodbus==3.9.2 2>/dev/null || true

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

# Expose port for web UI
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:80/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the server
CMD ["node", "src/start.js"]
