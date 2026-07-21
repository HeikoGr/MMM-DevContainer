# Compose Workflow

## Start And Stop

```bash
docker compose -f compose.yml up --build -d
docker compose -f compose.yml down
docker compose -f compose.yml logs -f
```

## Notes

- The default container name is `magicmirror-dev`.
- If you change `container_name`, update any scripts or tasks that depend on it.
- The shared base image currently uses Node 24 on Debian Trixie Slim.