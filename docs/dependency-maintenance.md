# Dependency Maintenance

This note is the short maintenance checklist for dependencies and build inputs in this repository.

## Manually Review And Update

These items do not move to a new major or explicitly selected release unless the repository is changed:

- MagicMirror release via `MAGICMIRROR_REPO_REF` in `docker/Dockerfile`
- Playwright version via `PLAYWRIGHT_VERSION` in `docker/Dockerfile`
- Node base image major and distro via `FROM node:26-trixie-slim` in `docker/Dockerfile`
- npm major via `npm install -g npm@12` in `docker/Dockerfile`
- `MMM-Cursor`, `MMM-Carousel` and `MMM-KeyBindings` via `MMM_CURSOR_REF`, `MMM_CAROUSEL_REF` and
  `MMM_KEYBINDINGS_REF` (commit SHAs) in `docker/Dockerfile`
- `pm2` and `@playwright/mcp` via `PM2_VERSION` and `PLAYWRIGHT_MCP_VERSION` in `docker/Dockerfile`

To move a bundled module on, compare the pinned SHA with the upstream default branch
(`gh api repos/<owner>/<repo>/commits/master --jq .sha`), read what changed and put the new SHA into
the `ARG`. The same for the npm tools with `npm view pm2 version` and `npm view @playwright/mcp version`.

Recommended cadence: review these when a new MagicMirror release is available and at least once per month for major runtime/tooling upgrades.

## Refreshed Automatically By The Weekly Image Build

These inputs are refreshed by rebuilding the image, even when the repository content does not change:

- Debian packages installed with `apt-get install` in `docker/Dockerfile`
- `google-chrome-stable` from the Google APT repository in `docker/Dockerfile`
- New patch-level content behind `node:26-trixie-slim`
- Latest `main` branch content of `MagicMirror-3rd-Party-Modules`, because `MM_CHECKER_REPO_REF=main` (on purpose: the
  checker should report what the public module list reports)

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

That means the rebuild installs the exact dependency tree defined by the lockfile of the pinned ref. To move those transitive dependencies, the upstream project must update its lockfile and this repository must move to that ref.

## Still Floating

`MM_CHECKER_REPO_REF=main` is the only repository input that is not pinned. Pin it as well if a checker change ever
breaks the image build.