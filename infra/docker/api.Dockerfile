FROM node:20-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY packages ./packages
COPY backend ./backend
COPY frontend ./frontend
COPY infra ./infra
COPY docs ./docs
COPY tests ./tests
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
EXPOSE 8787
CMD ["pnpm","--filter","@helm/api","dev"]
