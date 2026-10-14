# Build stage
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# Production stage (lightweight final image)
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps
# 🔥 Copy the compiled output and GraphQL schema files required by the API at runtime.
COPY --from=builder /app/dist ./dist
COPY src/graphql/schema.graphql ./src/graphql/schema.graphql
# Drop root privileges: the official image ships an unprivileged 'node' user.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]