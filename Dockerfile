# SiteDoc AI — container image.
# Based on the official Playwright image so the exact Chromium the scanner needs
# is already installed. Pin the tag to the `playwright` package version in
# package.json (currently 1.60.0).

# ---- Build stage ----------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS builder
WORKDIR /app

# Install all deps (incl. dev) for the build. `better-sqlite3` compiles its
# native binding here against this image's toolchain.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage --------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS runner
WORKDIR /app

ENV NODE_ENV=production \
    AUDIT_STORE=sqlite \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Copy the built app and dependencies (node_modules carries the matching
# better-sqlite3 native binary and the playwright runtime).
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# Writable dir for the SQLite DB, audit records, and screenshot artifacts (all
# under .data now), owned by the image's non-root user. Mount a volume at
# /app/.data to persist everything across restarts.
RUN mkdir -p .data && chown -R pwuser:pwuser /app
USER pwuser

EXPOSE 3000
CMD ["npm", "run", "start"]
