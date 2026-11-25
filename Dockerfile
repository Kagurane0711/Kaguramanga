FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install --global bun@1.4.4

COPY package.json bun.lock* ./
RUN bun install

COPY . .

ENV NODE_ENV=production

RUN npm run build

EXPOSE 10000

CMD ["bun", "run", "server.ts"]