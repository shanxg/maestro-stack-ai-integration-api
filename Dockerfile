# Estágio de Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Estágio de Produção (Imagem Final Leve)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
# 🔥 CORREÇÃO: Copia a pasta compilada e os esquemas físicos do GraphQL que a API precisa ler em runtime!
COPY --from=builder /app/dist ./dist
COPY src/graphql/schema.graphql ./src/graphql/schema.graphql
EXPOSE 3000
CMD ["node", "dist/server.js"]