# MagicMirror² DevContainer - Node 22 Alpine Debian
FROM node:22-bookworm-slim

# Set working directory
WORKDIR /opt/magic_mirror

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    python3 \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Update CA certificates
RUN update-ca-certificates

# Install pm2 globally VOR dem Cloning
RUN npm install -g pm2

# Clone MagicMirror
RUN git clone https://github.com/MagicMirrorOrg/MagicMirror.git . && \
    npm install --only=prod && \
    npm install -g --save-dev --save-exact prettier && \
    npm install -g --save-dev --save-exact cspell@latest

RUN mv modules __modules && \
    mv config __config && \
    mkdir workspace && \
    mkdir __css && \
    cp -r css/* __css/

# Copy configuration and startup files
COPY ./docker/ecosystem.config.js ./ecosystem.config.js
COPY ./docker/entrypoint.sh /entrypoint.sh
COPY ./.vscode/tasks_dc.json /opt/magic_mirror/workspace/.vscode/tasks.json

# Make scripts executable
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 8080

# Simple healthcheck to verify that MagicMirror responds on port 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD curl -fsS http://localhost:8080 >/dev/null || exit 1

# Run initialization and PM2
ENTRYPOINT ["/bin/sh", "-c", "/entrypoint.sh && pm2-runtime start /opt/magic_mirror/ecosystem.config.js"]
