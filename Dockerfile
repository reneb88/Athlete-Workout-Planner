FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3001 DB_FILE=/data/ropeworks.db
VOLUME /data
EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
