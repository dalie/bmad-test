FROM node:22-bookworm-slim AS build

WORKDIR /app

# Install dependencies for native modules and build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY packages/shared/package*.json ./packages/shared/

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production

# Install ffmpeg and dumb-init (for PID 1 signal handling)
RUN apt-get update && apt-get install -y ffmpeg dumb-init && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY packages/shared/package*.json ./packages/shared/

# Copy built node_modules instead of re-installing without build tools
COPY --from=build /app/node_modules ./node_modules

COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/frontend/dist/frontend/browser ./apps/frontend/dist/frontend/browser
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# Create cache directory owned by node before switching user
RUN mkdir -p /mnt/cache && chown node:node /mnt/cache

# Run as non-root user
USER node

EXPOSE 3000

CMD ["dumb-init", "node", "apps/backend/dist/main.js"]
