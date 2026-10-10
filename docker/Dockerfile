FROM node:26-trixie-slim

ARG PLAYWRIGHT_VERSION=1.64
ARG MAGICMIRROR_REPO_URL=https://github.com/MagicMirrorOrg/MagicMirror.git
ARG MAGICMIRROR_REPO_REF=v2.38.0
ARG MM_CHECKER_REPO_URL=https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules.git
ARG MM_CHECKER_REPO_REF=main

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV MAGICMIRROR_CHECKER_REPO=/opt/mm-module-checker
ENV MAGICMIRROR_CHECKER_REPO_REF=${MM_CHECKER_REPO_REF}
ENV MAGICMIRROR_SHARED_CHECK_SCRIPT=/opt/mm-tools/magicmirror-check.mjs

WORKDIR /opt/magic_mirror

# The apt steps below keep /var/cache/apt and /var/lib/apt/lists in BuildKit cache mounts, which
# never end up in a layer, so there is nothing to clean up afterwards. The Debian base image ships
# docker-clean, which deletes every downloaded .deb right after installing it and would leave the
# cache mount empty - remove it so local rebuilds reuse the downloads.
RUN rm -f /etc/apt/apt.conf.d/docker-clean

# One apt pass for everything: first the tools needed to add the two upstream repositories, then
# a single install from Debian, GitHub and Google together.
#
# openssh-client is listed explicitly: in Debian it is only a Recommends of git, so
# --no-install-recommends drops it and every SSH remote fails with "cannot run ssh".
#
# GitHub CLI comes from the official upstream repository (not packaged in Debian). Every module
# devcontainer built on this base image works against GitHub (PRs, workflow runs, releases), so
# it belongs here once instead of being installed by each module's own Dockerfile. It authenticates
# itself from the GITHUB_TOKEN that Codespaces/devcontainer injects, so no interactive
# `gh auth login` is needed. Note: that token belongs to a GitHub App installation and cannot
# administer the repository (branch protection returns 403) - use a personal access token for those calls.
#
# google-chrome-stable is the browser Playwright drives (channel: "chrome"); Playwright's own
# browser download stays disabled via PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg && \
    install -d -m 0755 /etc/apt/keyrings && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\n' \
        "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/github-cli.list && \
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-linux.gpg && \
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main\n' \
        "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    wget \
    jq \
    less \
    lsof \
    ripgrep \
    python3 \
    build-essential \
    httpie \
    xdg-utils \
    unzip \
    tzdata \
    gh \
    google-chrome-stable

# Run containers in the timezone the modules are actually used in. The image defaults to UTC,
# which silently breaks date-sensitive modules (WebUntis lessons, CalDAV due dates, library loan
# due dates, ...): dates render as the wrong day between 00:00 and 02:00 local time, and by up to
# two hours off during DST. Every module built on this image targets DACH users, so this is the
# zone effectively all of them run in. Override per container with "containerEnv": { "TZ": "..." }
# in devcontainer.json. Europe/Berlin, not CEST: only the zone name carries the DST rules.
ENV TZ=Europe/Berlin
RUN ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime && echo "$TZ" > /etc/timezone

# The npm steps keep /root/.npm in a cache mount as well, so no `npm cache clean` is needed.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g npm@12

RUN --mount=type=cache,target=/root/.npm \
    git clone --depth=1 --branch "${MAGICMIRROR_REPO_REF}" "${MAGICMIRROR_REPO_URL}" . && \
    if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi && \
    rm -rf /opt/magic_mirror/.git

COPY ./config.js /opt/magic_mirror/config/config.js
COPY ./custom.css /opt/magic_mirror/config/custom.css

WORKDIR /opt/magic_mirror/modules

# Third-party modules bundled with the image. Only runtime dependencies are installed: their
# devDependencies (linters, test tooling, in MMM-Carousel's case even Playwright) are not needed
# to run them.
RUN --mount=type=cache,target=/root/.npm \
    for URL in \
        https://github.com/uxigene/MMM-Cursor.git \
        https://github.com/shbatm/MMM-Carousel.git \
        https://github.com/shbatm/MMM-KeyBindings.git; do \
        DIR="$(basename "$URL" .git)" && \
        git clone --depth=1 "$URL" "$DIR" && \
        if [ -f "$DIR/package-lock.json" ]; then npm --prefix "$DIR" ci --omit=dev --no-audit --no-fund; \
        elif [ -f "$DIR/package.json" ]; then npm --prefix "$DIR" install --omit=dev --no-audit --no-fund; fi \
        || exit 1; \
    done

WORKDIR /opt/magic_mirror

RUN --mount=type=cache,target=/root/.npm \
    npm install -g \
    pm2 \
    "playwright@${PLAYWRIGHT_VERSION}" \
    @playwright/mcp

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    playwright install-deps chromium

RUN --mount=type=cache,target=/root/.npm \
    git clone --depth=1 --branch "${MM_CHECKER_REPO_REF}" "${MM_CHECKER_REPO_URL}" "${MAGICMIRROR_CHECKER_REPO}" && \
    if [ -f "${MAGICMIRROR_CHECKER_REPO}/package-lock.json" ]; then npm --prefix "${MAGICMIRROR_CHECKER_REPO}" ci --no-audit --no-fund; else npm --prefix "${MAGICMIRROR_CHECKER_REPO}" install --no-audit --no-fund; fi

COPY ./docker/scripts/magicmirror-check.mjs /opt/mm-tools/magicmirror-check.mjs

RUN chmod +x /opt/mm-tools/magicmirror-check.mjs

COPY ./docker/ecosystem.config.js /opt/magic_mirror/ecosystem.config.js
COPY ./docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

# VS Code extensions every module devcontainer built on this image should get, baked into the image
# instead of being repeated in each module's devcontainer.json. The Dev Containers spec reads this
# label from the image and merges it with the module's own devcontainer.json - extension lists are
# unioned, so a module only lists what is specific to it. Docker inherits the label into child
# images, so the module Dockerfiles get it just by building FROM this image.
#
# biomejs.biome is included because it is what surfaces Biome's diagnostics inline while editing
# and drives format-on-save; the module .vscode/settings.json files bind the formatter and the
# fixAll/organizeImports code actions to it. It picks up the per-module @biomejs/biome from
# node_modules, so the CLI (`node --run lint`) and the editor stay on the same version and config.
#
# Deliberately not included: ms-azuretools.vscode-containers - it has to be installed on the host
# to open the container in the first place, so it cannot usefully come from inside the image.
#
# Verify after a rebuild:
#   docker inspect --format '{{index .Config.Labels "devcontainer.metadata"}}' ghcr.io/heikogr/mmm-devcontainer:trixie-slim
LABEL devcontainer.metadata='[{"customizations":{"vscode":{"extensions":["actboy168.tasks","vivaxy.vscode-conventional-commits","vstirbu.vscode-mermaid-preview","biomejs.biome","Anthropic.claude-code"]}}}]'

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD curl -fsS http://localhost:8080 >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
