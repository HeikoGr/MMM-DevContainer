# Dependency Maintenance

This note is the short maintenance checklist for dependencies and build inputs in this repository.

## Manually Review And Update

These items do not move to a new major or explicitly selected release unless the repository is changed:

- MagicMirror release via `MAGICMIRROR_REPO_REF` in `docker/Dockerfile`
- Playwright version via `PLAYWRIGHT_VERSION` in `docker/Dockerfile`
- Node base image major and distro via `FROM node:24-trixie-slim` in `docker/Dockerfile`
- npm major via `npm install -g npm@11` in `docker/Dockerfile`

Recommended cadence: review these when a new MagicMirror release is available and at least once per month for major runtime/tooling upgrades.

## Refreshed Automatically By The Weekly Image Build

These inputs are refreshed by rebuilding the image, even when the repository content does not change:

- Debian packages installed with `apt-get install` in `docker/Dockerfile`
- `google-chrome-stable` from the Google APT repository in `docker/Dockerfile`
- New patch-level content behind `node:24-trixie-slim`
- Global npm tools installed without an explicit version pin: `pm2`, `cspell`, and `@playwright/mcp`
- Latest default-branch content of `MMM-Cursor`, `MMM-Carousel`, and `MMM-KeyBindings`, because they are cloned without a pinned tag or commit
- Latest `main` branch content of `MagicMirror-3rd-Party-Modules`, because `MM_CHECKER_REPO_REF=main`

The weekly GitHub Actions schedule in `.github/workflows/publish-image.yml` ensures these are republished regularly.

## Playwright System Dependencies

Playwright system dependencies are installed by the Playwright CLI in this repository, but browser binaries are still not downloaded during the image build.

- The image installs the `playwright` npm package and then runs `playwright install-deps chromium`
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` stays enabled in `docker/Dockerfile`, so browser payloads are still intentionally not downloaded during image build
- `playwright install --with-deps chromium` was not chosen because it would additionally download Playwright-managed Chromium, headless-shell, and ffmpeg artifacts into the image

This keeps the Dockerfile shorter while preserving the current behavior: Linux browser dependencies come from Playwright's dependency installer, while the image still avoids bundling Playwright browser archives.

## Developer Convenience Packages

The image also includes a small set of quality-of-life packages for interactive development and debugging:

- `openssh-client` for git and npm flows that use SSH remotes
- `procps`, `lsof`, and `less` for process, port, and log inspection inside the container
- `unzip` for modules or assets distributed as archives

## Still Frozen Unless Upstream Changes

The weekly rebuild does not automatically advance every npm dependency:

- MagicMirror dependencies stay on the upstream `package-lock.json` state when `npm ci` is used
- The same applies to `MMM-Cursor`, `MMM-Carousel`, `MMM-KeyBindings`, and the module checker whenever their repositories contain a lockfile

That means the rebuild pulls a fresh repository snapshot, but it will still install the exact dependency tree defined by the upstream lockfile. To move those transitive dependencies, the upstream project must update its lockfile or this repository must switch to a different ref.

## Optional Hardening

If reproducibility matters more than automatic freshness, consider pinning these currently floating inputs:

- `pm2`, `cspell`, and `@playwright/mcp`
- The three bundled MagicMirror modules
- `MM_CHECKER_REPO_REF`

If automatic freshness matters more, keep them floating and rely on the weekly rebuild plus occasional manual review.