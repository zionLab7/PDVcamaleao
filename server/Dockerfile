# --- Build Stage ---
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files and Prisma schema
COPY package.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDeps for build)
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source code and build
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and Prisma schema
COPY package.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm install --omit=dev

# Generate Prisma client in production stage
RUN npx prisma generate

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3001

# Run migrations, seed with compiled JS, then start server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/seed.js || true && node dist/index.js"]
