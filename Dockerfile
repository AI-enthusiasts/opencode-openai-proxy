FROM oven/bun:1

WORKDIR /app

# Copy package files and local dependencies first for better layer caching
COPY package.json bun.lock ./
COPY tarquinen-opencode-auth-provider-0.1.7.tgz ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Default port
ENV PORT=8080

EXPOSE 8080

CMD ["bun", "run", "start"]
