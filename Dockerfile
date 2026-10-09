FROM node:22-slim

# The board's chat runs the Claude Code CLI with your own Claude login (mounted at runtime, see compose.yaml).
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} && npm cache clean --force

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY lib ./lib
COPY public ./public

# data and photos live outside the image; create the mount points owned by the unprivileged user
RUN mkdir -p /app/data /app/uploads /claude && chown -R node:node /app/data /app/uploads /claude
USER node
ENV NODE_ENV=production PORT=3000 HOME=/home/node CLAUDE_CONFIG_DIR=/claude DISABLE_AUTOUPDATER=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/auth').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
