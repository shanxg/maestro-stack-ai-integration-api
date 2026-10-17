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
# 🔥 Copy the compiled output, the only files the API needs at runtime.
COPY --from=builder /app/dist ./dist
# The /ai/chat system prompt (issue #59): AIService reads it at start-up and the API refuses to
# start without it, so it ships next to dist/ (src/ai/promptFile.ts looks for ../../prompts/).
COPY --from=builder /app/prompts/chat-system.md ./prompts/chat-system.md
# Drop root privileges: the official image ships an unprivileged 'node' user.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]