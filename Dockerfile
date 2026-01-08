# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy client files and build
COPY client/package*.json ./client/
RUN cd client && npm install

COPY client/ ./client/
RUN cd client && npm run build

# Copy server files
COPY server/package*.json ./server/
RUN cd server && npm install

COPY server/ ./server/

# Copy API for Prisma schema
COPY api/ ./api/
RUN cd api && npm install && npx prisma generate

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built client to the location expected by server (../../client/dist from server/src)
COPY --from=builder /app/client/dist ./client/dist

# Copy server
COPY --from=builder /app/server ./server

# Copy node_modules from api (includes prisma client)
COPY --from=builder /app/api/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=builder /app/api/node_modules/@prisma ./server/node_modules/@prisma

EXPOSE 3001

WORKDIR /app/server

CMD ["npm", "start"]
