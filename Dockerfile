FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production 

COPY static ./static
COPY src ./src

# config file and certs needs to be mapped as a docker volume
ENV CONFIG_FILE=/app/config.jsonc

CMD [ "bun", "start" ]
