# Prepare a Module

Clone the module you want to develop into the local `modules/` directory.

Example:

```bash
git clone https://github.com/HeikoGr/MMM-Webuntis.git modules/MMM-Webuntis
```

You can add multiple module repositories under `modules/`. They are mounted into the container under `/opt/magic_mirror/modules`.

If a module contains a `package.json`, the container entrypoint attempts to install its production dependencies automatically on startup.