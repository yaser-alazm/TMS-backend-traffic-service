FROM node:20-alpine

# Install necessary packages
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production=false

# Copy source code and configuration
COPY . .

# Build the application
RUN npm run build

# Clean up dev dependencies for production
RUN npm prune --production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Change ownership and switch user
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expose port
EXPOSE 4004

# Environment variables
ENV NODE_ENV=production
ENV PORT=4004

# Start the application
CMD ["node", "dist/main.js"]
