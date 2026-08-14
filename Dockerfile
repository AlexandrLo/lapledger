# syntax=docker/dockerfile:1
FROM node:26-alpine

# Kept in sync by hand with the `packageManager` field in package.json.
ARG PNPM_VERSION=11.21.0

ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app

# /app is covered by a bind mount at run time and inherits the host user's
# ownership, so only the paths outside it need preparing here. Docker seeds a
# fresh named volume from the ownership of the image directory it is mounted
# over, which is what lets the unprivileged `node` user write to the pnpm
# metadata cache declared in compose.yaml.
RUN mkdir -p "$PNPM_HOME" /home/node/.cache/pnpm \
 && chown -R node:node /app /home/node

USER node

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
