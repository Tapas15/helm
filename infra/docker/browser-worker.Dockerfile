FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /app
RUN npm i -g corepack@latest --force && corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY packages ./packages
COPY backend ./backend
COPY frontend ./frontend
COPY infra ./infra
COPY docs ./docs
COPY tests ./tests
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
EXPOSE 8790
CMD ["pnpm","--filter","@helm/browser-worker","exec","tsx","src/index.ts"]
