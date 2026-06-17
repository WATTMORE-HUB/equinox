FROM node:18-alpine

WORKDIR /app

# Install Python and dependencies
RUN apk add --no-cache python3 py3-pip

# Copy Equinox package files (both package.json and package-lock.json)
COPY equinox_package.json package.json
COPY equinox_package-lock.json package-lock.json

# Install production dependencies only
RUN npm ci --only=production

# Install Python dependencies for Modbus
RUN pip3 install --break-system-packages --no-cache-dir minimalmodbus==2.1.1 pymodbus==3.9.2 pyserial==3.5

# Copy Equinox application code
COPY equinox_src ./src
COPY equinox_public ./public
COPY equinox_configurator ./configurator

# Expose port 3000 for Equinox
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application on port 3000
CMD ["node", "src/start.js"]
