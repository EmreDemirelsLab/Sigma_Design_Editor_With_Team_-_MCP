FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY scripts/build.mjs ./scripts/build.mjs
COPY apps/assistant ./apps/assistant
RUN node scripts/build.mjs
USER node
EXPOSE 3100
CMD ["node", "apps/assistant/src/server.mjs"]
