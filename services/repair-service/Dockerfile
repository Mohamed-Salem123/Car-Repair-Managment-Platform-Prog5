FROM node:18-slim

WORKDIR /app

# Install OpenSSL
RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --production

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 8002

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
