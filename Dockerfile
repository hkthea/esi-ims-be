# Stage 1: compile TypeScript so the image builds from source
FROM node:18-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: runtime image with production dependencies only
FROM node:18-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY version.json ./version.json
EXPOSE 11611
CMD ["node", "dist/index.js"]
