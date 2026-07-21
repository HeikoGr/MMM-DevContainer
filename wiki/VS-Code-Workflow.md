# VS Code Workflow

## Recommended Workflow

1. Open the repository in VS Code.
2. Run `Dev Containers: Reopen in Container` from the command palette.
3. Wait until the compose service is built and VS Code attaches to the container.

## Notes

- The compose service is defined in `compose.yml`.
- The repository is mounted into the container workspace for editing.
- The container exposes port `8080` for MagicMirror.

## VS Code Tasks

This repository includes tasks for PM2 operations such as restart, stop, list, and log follow. Inside the container they run directly. On the host they use `docker exec` against the running container.