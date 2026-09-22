# MMM-DevContainer Documentation

User-facing setup and usage documentation now lives in the project wiki.

- Wiki: <https://github.com/HeikoGr/MMM-DevContainer/wiki>

This directory is the place for additional infrastructure and operations documentation.

## Local Config Overrides

`config.js` and `custom.css` are build inputs - `docker/Dockerfile` copies them into the
image - so they are tracked, and `config.js.sample` is the template they came from. A
tracked file cannot be hidden by `.gitignore`, so local tweaks to them keep showing up in
`git status` and are easy to commit by accident.

To keep a clone's local edits out of the way:

```bash
git update-index --skip-worktree config.js custom.css
```

Check which files carry the flag - `S` means skip-worktree, `H` is a normal file:

```bash
git ls-files -v config.js custom.css
```

Two things to know about it:

- The flag lives in `.git/index`, so it is never committed and has to be set again in every
  fresh clone.
- While it is set, a `git pull` that touches those files aborts with "Your local changes
  would be overwritten". Clear the flag, pull, then set it again:

```bash
git update-index --no-skip-worktree config.js custom.css
```

Clearing it is also the way to commit a real change to the checked-in defaults.

## Current Status

- At the moment, the root README is the canonical documentation for setup, base image, and compose usage.
- Dependency/update maintenance notes live in [dependency-maintenance.md](dependency-maintenance.md).