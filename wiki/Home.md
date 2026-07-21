# MagicMirror Development Wiki

This repository provides a shared Docker Compose and VS Code Dev Container setup for MagicMirror module development.

Use this wiki if you want to:

- prepare a module repository for the development container
- open the project in VS Code
- start and stop the environment with Docker Compose
- use the bundled task and PM2 helpers
- troubleshoot container and host integration issues

## Start Here

- [Prerequisites](Prerequisites)
- [Prepare a Module](Prepare-a-Module)
- [VS Code Workflow](VS-Code-Workflow)
- [Compose Workflow](Compose-Workflow)
- [Troubleshooting](Troubleshooting)

## Shared Base Image

The repository also publishes a shared base image for module repositories through GHCR so individual module repos can keep their Dockerfiles thin.