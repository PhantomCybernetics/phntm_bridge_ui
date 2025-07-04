FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY static /app/static
COPY src /app/src

# needs to be mapped as docker volume if needed
ENV CONFIG_FILE=/app/config.jsonc

USER bun
CMD [ "bun", "start" ]
