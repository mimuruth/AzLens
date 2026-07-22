# -----------------------------------------------------------------------------
# mcp-knowledge — container image
# -----------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/build ./build
EXPOSE 3000
USER node
CMD ["node", "build/http.js"]
