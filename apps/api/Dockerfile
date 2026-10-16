FROM node:22-alpine AS base
RUN corepack enable
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/tsconfig/base.json packages/tsconfig/
COPY packages/api-contracts/package.json packages/api-contracts/
COPY packages/api-contracts/tsconfig.json packages/api-contracts/
COPY packages/api-contracts/src packages/api-contracts/src
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
COPY packages/tsconfig packages/tsconfig
COPY packages/api-contracts packages/api-contracts
COPY apps/api apps/api
RUN pnpm --filter @ecommerce/api-contracts build
RUN DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy pnpm --filter api prisma:generate
RUN pnpm --filter api build

FROM node:22-alpine AS runtime
RUN apk add --no-cache postgresql-client
WORKDIR /repo/apps/api
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=build /repo/apps/api/node_modules ./node_modules
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
