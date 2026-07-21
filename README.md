
# MagicMirror (Development)

Shared Docker Compose and VS Code Dev Container setup for MagicMirror module development.

## Quick Start

```bash
git clone https://github.com/HeikoGr/MMM-Webuntis.git modules/MMM-Webuntis
docker compose -f compose.yml up --build -d
```

## Documentation

User-facing setup and usage documentation now lives in the project wiki:

- [Wiki Home](https://github.com/HeikoGr/MMM-DevContainer/wiki)
- [Prerequisites](https://github.com/HeikoGr/MMM-DevContainer/wiki/Prerequisites)
- [Prepare a Module](https://github.com/HeikoGr/MMM-DevContainer/wiki/Prepare-a-Module)
- [VS Code Workflow](https://github.com/HeikoGr/MMM-DevContainer/wiki/VS-Code-Workflow)
- [Compose Workflow](https://github.com/HeikoGr/MMM-DevContainer/wiki/Compose-Workflow)
- [Troubleshooting](https://github.com/HeikoGr/MMM-DevContainer/wiki/Troubleshooting)

Technical and maintenance documentation remains in `docs/`:

- [docs/README.md](docs/README.md)
- [docs/dependency-maintenance.md](docs/dependency-maintenance.md)
- [.github/workflows/publish-image.yml](.github/workflows/publish-image.yml)