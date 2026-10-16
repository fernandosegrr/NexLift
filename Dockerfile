# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy client files and build
COPY client/package*.json ./client/
RUN cd client && npm install

COPY client/ ./client/
RUN cd client && npm run build

# Copy server files and generate Prisma
COPY server/package*.json ./server/
RUN cd server && npm install

COPY server/ ./server/

# Generate Prisma client in server directory
RUN cd server && npx prisma generate

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built client
COPY --from=builder /app/client/dist ./client/dist

# Copy server with generated Prisma client
COPY --from=builder /app/server ./server

# Expose port (Easypanel will set PORT env var)
EXPOSE 80

WORKDIR /app/server

CMD ["sh", "-c", "npx prisma db push --skip-generate || echo 'prisma db push failed'; npm start"]
