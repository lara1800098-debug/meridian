# Meridian — one image for web + worker. Build: docker compose build
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
# poppler-utils + tesseract (Arabic & English) = local OCR for scanned tenders; nothing leaves the server
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client ca-certificates poppler-utils tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci
# Headless Chromium for server-side branded PDFs (talks only to this app)
RUN npx playwright install --with-deps chromium

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production
COPY --from=deps /ms-playwright /ms-playwright
RUN npx -y playwright@1.65.1 install-deps chromium && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3000
CMD ["npm", "start"]
