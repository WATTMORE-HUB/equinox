FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application code
COPY . .

# NOTE: This Dockerfile assumes the following directory structure:
# When deployed via balena, the full enform repo should be available
# If deploying standalone, uncomment the COPY line below and adjust path
# COPY ../../../configurator ./configurator

# Expose port (80 for balena tunnel)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:80/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "src/start.js"]
