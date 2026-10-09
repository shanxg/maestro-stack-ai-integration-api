# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production stage (lightweight final image)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
# 🔥 Copy the compiled output and GraphQL schema files required by the API at runtime.
COPY --from=builder /app/dist ./dist
COPY src/graphql/schema.graphql ./src/graphql/schema.graphql
EXPOSE 3000
CMD ["node", "dist/server.js"]