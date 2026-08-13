# syntax=docker/dockerfile:1
FROM node:26-alpine

# Kept in sync by hand with the `packageManager` field in package.json.
ARG PNPM_VERSION=11.21.0

ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

# Docker seeds a fresh named volume from the ownership and contents of the
# image directory it is mounted over. Creating and chowning these paths here is
# what lets the unprivileged `node` user write to the node_modules and pnpm
# store volumes declared in compose.yaml.
RUN mkdir -p /app/node_modules "$PNPM_HOME/store" \
 && chown -R node:node /app "$PNPM_HOME"

USER node

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
