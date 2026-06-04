# Use a lightweight Node.js image
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy server, configuration and client source files
COPY server.js ./
COPY index.html ./
COPY styles/ ./styles/
COPY src/ ./src/

# Expose default Google Cloud Run port
EXPOSE 8080

# Configure environment defaults
ENV PORT=8080
ENV NODE_ENV=production

# Start the application server
CMD ["node", "server.js"]
