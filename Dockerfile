ARG NODE_IMAGE=node:latest
FROM ${NODE_IMAGE}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .
RUN mkdir -p /app/data /app/syncmatica

CMD ["npm", "start"]
