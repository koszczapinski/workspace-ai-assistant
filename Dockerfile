# Image layout (docs: "Run with Docker Compose" in README.md).
#   deps    all dependencies from the lockfile (dev included: tsx and drizzle are needed to migrate)
#   build   next build with output: 'standalone'
#   migrate target: full node_modules + scripts/ + src/ + db/migrations; runs `npm run db:migrate`
#   runtime target (default): the standalone server only; no dev dependencies, scripts or migrations
# No secrets are copied or set here. Configuration arrives at run time from the Compose environment.

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM deps AS migrate
COPY package.json tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY db ./db
USER node
CMD ["npm", "run", "db:migrate"]

FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
