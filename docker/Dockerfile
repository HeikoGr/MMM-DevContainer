## syntax=docker/dockerfile:1.7
FROM node:24-trixie-slim

ARG PLAYWRIGHT_VERSION=1.59
ARG MAGICMIRROR_REPO_URL=https://github.com/MagicMirrorOrg/MagicMirror.git
ARG MAGICMIRROR_REPO_REF=v2.35.0
ARG MM_CHECKER_REPO_URL=https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules.git
ARG MM_CHECKER_REPO_REF=main

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV MAGICMIRROR_CHECKER_REPO=/opt/mm-module-checker
ENV MAGICMIRROR_CHECKER_REPO_REF=${MM_CHECKER_REPO_REF}
ENV MAGICMIRROR_SHARED_CHECK_SCRIPT=/opt/mm-tools/magicmirror-check.mjs

WORKDIR /opt/magic_mirror

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    jq \
    ripgrep \
    python3 \
    ca-certificates \
    build-essential \
    gnupg \
    httpie \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libu2f-udev \
    libvulkan1 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    mkdir -p /etc/apt/keyrings && \
    wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-linux.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y --no-install-recommends google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.npm \
    npm install -g npm@11 && \
    npm cache clean --force

RUN --mount=type=cache,target=/root/.npm \
    git clone --depth=1 --branch "${MAGICMIRROR_REPO_REF}" "${MAGICMIRROR_REPO_URL}" . && \
    if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi && \
    npm cache clean --force && \
    rm -rf /opt/magic_mirror/.git

COPY ./config.js /opt/magic_mirror/config/config.js
COPY ./custom.css /opt/magic_mirror/config/custom.css

RUN update-ca-certificates

WORKDIR /opt/magic_mirror/modules

RUN --mount=type=cache,target=/root/.npm \
    git clone --depth=1 https://github.com/uxigene/MMM-Cursor && \
    if [ -f /opt/magic_mirror/modules/MMM-Cursor/package-lock.json ]; then npm --prefix /opt/magic_mirror/modules/MMM-Cursor ci --omit=dev --no-audit --no-fund; elif [ -f /opt/magic_mirror/modules/MMM-Cursor/package.json ]; then npm --prefix /opt/magic_mirror/modules/MMM-Cursor install --omit=dev --no-audit --no-fund; fi && \
    git clone --depth=1 https://github.com/shbatm/MMM-Carousel.git && \
    if [ -f /opt/magic_mirror/modules/MMM-Carousel/package-lock.json ]; then npm --prefix /opt/magic_mirror/modules/MMM-Carousel ci --no-audit --no-fund; else npm --prefix /opt/magic_mirror/modules/MMM-Carousel install --no-audit --no-fund; fi && \
    git clone --depth=1 https://github.com/shbatm/MMM-KeyBindings.git && \
    if [ -f /opt/magic_mirror/modules/MMM-KeyBindings/package-lock.json ]; then npm --prefix /opt/magic_mirror/modules/MMM-KeyBindings ci --no-audit --no-fund; else npm --prefix /opt/magic_mirror/modules/MMM-KeyBindings install --no-audit --no-fund; fi

WORKDIR /opt/magic_mirror

RUN --mount=type=cache,target=/root/.npm \
    npm install -g \
    pm2 \
    cspell \
    "playwright@${PLAYWRIGHT_VERSION}" \
    @playwright/mcp && \
    npm cache clean --force

RUN --mount=type=cache,target=/root/.npm \
    git clone --depth=1 --branch "${MM_CHECKER_REPO_REF}" "${MM_CHECKER_REPO_URL}" "${MAGICMIRROR_CHECKER_REPO}" && \
    if [ -f "${MAGICMIRROR_CHECKER_REPO}/package-lock.json" ]; then npm --prefix "${MAGICMIRROR_CHECKER_REPO}" ci --no-audit --no-fund; else npm --prefix "${MAGICMIRROR_CHECKER_REPO}" install --no-audit --no-fund; fi && \
    npm cache clean --force

COPY ./docker/scripts/magicmirror-check.mjs /opt/mm-tools/magicmirror-check.mjs

RUN chmod +x /opt/mm-tools/magicmirror-check.mjs

COPY ./docker/ecosystem.config.js /opt/magic_mirror/ecosystem.config.js
COPY ./docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD curl -fsS http://localhost:8080 >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]