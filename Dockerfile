ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

COPY package.json package-lock.json ./
RUN HTTP_PROXY="$HTTP_PROXY" HTTPS_PROXY="$HTTPS_PROXY" NO_PROXY="$NO_PROXY" \
    http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY" no_proxy="$NO_PROXY" \
    npm ci --omit=dev && npm cache clean --force

COPY . .
RUN mkdir -p /app/data /app/syncmatica

CMD ["npm", "start"]
