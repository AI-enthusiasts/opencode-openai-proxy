FROM oven/bun:1

WORKDIR /app

# Copy package files for better layer caching
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Default port
ENV PORT=8080

EXPOSE 8080

CMD ["bun", "run", "start"]
