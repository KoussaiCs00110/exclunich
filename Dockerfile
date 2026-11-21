FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S absentia && adduser -S absentia -G absentia
COPY --from=build --chown=absentia:absentia /app/.next/standalone ./
COPY --from=build --chown=absentia:absentia /app/.next/static ./.next/static
COPY --from=build --chown=absentia:absentia /app/public ./public
USER absentia
EXPOSE 3000
CMD ["node", "server.js"]
