
# MagicMirror (Development)

This repository contains a development setup for MagicMirror using Docker Compose and a VS Code Dev Container.

This README explains how to use the project in Visual Studio Code for module development (working in the `modules` folder), how to mount `css` and `config`, and how to run/manage the server via Docker Compose or the Dev Container.

## Prerequisites

- Docker and Docker Compose (or Docker Compose V2 via `docker compose`).
- Visual Studio Code with the "Remote - Containers" (Dev Containers) extension installed.
- (Optional) VS Code Docker extension for an integrated GUI to manage containers.

## 1) Prepare a module for development

Clone the module(s) you want to develop into the repository `modules/` directory. Example:

```bash
git clone https://github.com/HeikoGr/MMM-Webuntis.git modules/MMM-Webuntis
```

You can add any number of modules under `modules/` and they will be mounted into the container at `/opt/magic_mirror/modules`.

The entrypoint of the container will automatically attempt to install production dependencies for modules that contain a `package.json` (so dependencies like `webuntis` used by `MMM-Webuntis` will be installed inside the container when it starts).

## 2) Open the project in VS Code

Recommended workflow (Dev Container):

1. From the Command Palette (Ctrl+Shift+P) select **Dev Containers: Reopen in Container**. VS Code will build the container (using `compose.yml`), install the recommended extensions, and open the workspace inside the container.

Notes:
- The Dev Container uses the Compose service declared in `compose.yml`. The container is configured to expose port `8080` and mount the workspace folders.

## 3) Starting and stopping (two approaches)

A) From VS Code 

- Use the Dev Containers controls inside VS Code (the status bar/Command Palette) to stop/start the container. When you Reopen in Container VS Code will run the compose service and attach.

B) Directly with Docker Compose (CLI)

```bash
# Build and start (detached)
docker compose -f compose.yml up --build -d

# Stop the service
docker compose -f compose.yml down

# View logs
docker compose -f compose.yml logs -f
```

When running via Docker Compose, the container is named `magicmirror-dev` (see `compose.yml`). If you run the VS Code tasks from the host (not inside the container), they will use `docker exec -it magicmirror-dev ...` to run PM2 commands in the running container; adjust name if you change `container_name`.

## 4) Convenience: VS Code Tasks, Keybindings and Statusbar Buttons

This repository provides convenient Tasks and keybindings to manage PM2 inside the container:

- `.vscode/tasks.json` contains tasks for:
	- `pm2: restart all` (Ctrl+Alt+R)
	- `pm2: stop all` (Ctrl+Alt+S)
	- `pm2: list` (no default keybinding)
	- `pm2: logs (follow)` (Ctrl+Alt+L)
- When run inside the Dev Container they execute `pm2 ...` directly.
- When run on the host they prefix the command with `docker exec -it magicmirror-dev ...` so the same task works both on host and inside container.

Two extensions are configured to show task buttons in the status bar and provide grouped buttons/quick-pick menus:

- `actboy168.tasks` — reads `options.statusbar` from tasks and shows individual colored buttons.

## 5) Notes & Troubleshooting

- Container name: `compose.yml` sets `container_name: magicmirror-dev`. If you change that name, update the tasks or use an environment variable to keep tasks working.
- If a task runs on the host but Docker is not running / the container is not started, the `docker exec` will fail — start the container first.
- The entrypoint script creates symlinks and installs module dependencies if required. If a module needs build tools, ensure the container has the necessary tools (look at `docker/Dockerfile`).
- Node version: the image uses Node 22 by default; if you experience compatibility issues you can switch the base image in `docker/Dockerfile` to a supported Node LTS (for example `node:20-bookworm-slim`).

## 6) Useful commands (quick reference)

```bash
# Build and start (cli)
docker compose -f compose.yml up --build -d

# Rebuild only
docker compose -f compose.yml build

# View logs (cli)
docker compose -f compose.yml logs -f

# Exec into running container
docker exec -it magicmirror-dev /bin/sh

# Show pm2 list inside container (host)
docker exec -it magicmirror-dev pm2 list
```