# syntax=docker/dockerfile:1
FROM node:26-alpine

# Should be kept manually in sync with the `packageManager` in package.json.
ARG PNPM_VERSION=11.21.0

ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

# Prepare non-/app paths for the `node` user's pnpm cache access
RUN mkdir -p "$PNPM_HOME" /home/node/.cache/pnpm \
    && chown -R node:node /app /home/node

USER node

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
