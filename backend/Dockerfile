FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
ENV NODE_ENV=production
EXPOSE 4000
# `prisma db push` is idempotent — it creates the SQLite file if it doesn't exist yet.
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
