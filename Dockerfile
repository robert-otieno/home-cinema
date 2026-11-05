FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@11
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=8094 DATA_DIR=/app/data FFMPEG_PATH=ffmpeg FFPROBE_PATH=ffprobe
EXPOSE 8094
CMD ["node","apps/server/dist/index.js"]
