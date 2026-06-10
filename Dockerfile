FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends calibre \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml ./
ENV SKIP_CALIBRE_DOWNLOAD=1
RUN pnpm install

COPY . .
RUN pnpm build

RUN mkdir -p uploads/books
VOLUME ["/app/uploads"]

EXPOSE 3000
CMD ["pnpm", "start"]
