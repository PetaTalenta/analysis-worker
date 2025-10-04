# Use Node.js 22 Alpine for smaller image size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install dumb-init and netcat for proper signal handling and wait script
RUN apk add --no-cache dumb-init netcat-openbsd

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

ARG INCLUDE_DEV_DEPS=false

# Copy package files
COPY package*.json ./

# Install dependencies
RUN if [ "$INCLUDE_DEV_DEPS" = "true" ]; then \
      npm ci && npm cache clean --force; \
    else \
      npm ci --only=production && npm cache clean --force; \
    fi

# Copy source code
COPY . .

# Copy wait script
COPY ../docker-scripts/wait-for-rabbitmq.sh /usr/local/bin/wait-for-rabbitmq.sh
RUN chmod +x /usr/local/bin/wait-for-rabbitmq.sh

# Create logs directory
RUN mkdir -p logs && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check (for worker process, check if it's running)
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD pgrep -f "node.*worker.js" > /dev/null || exit 1

# Start the application with wait script
ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/wait-for-rabbitmq.sh", "rabbitmq", "npm", "start"]
