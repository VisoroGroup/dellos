# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci

# Install client dependencies
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy source
COPY server/ ./server/
COPY client/ ./client/

# Build client
RUN cd client && npm run build

# Build server
RUN cd server && npx tsc

# Production stage
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/src ./server/src
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/client/dist ./client/dist

RUN cd server && npm ci --omit=dev && npm install tsx

EXPOSE 8080
CMD ["node", "server/dist/app.js"]
