#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEVCONTAINER_REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$DEVCONTAINER_REPO_DIR/.." && pwd)"

BASE_IMAGE_TAG="${BASE_IMAGE_TAG:-ghcr.io/heikogr/mmm-devcontainer:node24-trixie-slim}"

usage() {
  cat <<'EOF'
Usage: local-devcontainer-test.sh <command> [module-name]

Commands:
  build-base [--force]       Build the local shared base image with the production tag.
  run-check <module>         Run the module's npm checker command inside a one-off local container.
  full-test <module>         Build base image, build module image, then run checker.
  open-module <module>       Open the selected module in a new VS Code window and start the devcontainer when possible.
  full-open <module>         Build the local base image, then open the selected module in a new VS Code window.

Supported modules:
  MMM-Webuntis
  MMM-HomeConnect2
  MMM-Photoprism2
  MMM-CalDAV-Tasks
EOF
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

has_devcontainer_open() {
  has_command devcontainer && devcontainer --help 2>/dev/null | grep -q '^  devcontainer open'
}

module_dir() {
  local module_name="$1"
  local dir="$WORKSPACE_ROOT/$module_name"
  [[ -d "$dir" ]] || fail "Module directory not found: $dir"
  [[ -d "$dir/.devcontainer" ]] || fail "Module is missing .devcontainer: $dir"
  printf '%s\n' "$dir"
}

module_image_tag() {
  local module_name="$1"
  local sanitized
  sanitized="$(printf '%s' "$module_name" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-')"
  printf 'mmm-local-%s:devcontainer\n' "$sanitized"
}

detect_check_script_name() {
  local module_path="$1"
  MODULE_PATH="$module_path" node <<'EOF'
const path = require('node:path');
const pkg = require(path.join(process.env.MODULE_PATH, 'package.json'));
const scripts = pkg.scripts || {};

if (typeof scripts.mmcheck === 'string') {
  process.stdout.write('mmcheck');
  process.exit(0);
}

if (typeof scripts.check === 'string' && scripts.check.includes('magicmirror-check')) {
  process.stdout.write('check');
  process.exit(0);
}

process.exit(2);
EOF
}

build_base() {
  local force_build="${1:-false}"
  local build_args=()

  if [[ "$force_build" == "true" ]]; then
    build_args+=(--pull --no-cache)
    echo "==> Force-building local base image: $BASE_IMAGE_TAG"
  else
    echo "==> Building local base image: $BASE_IMAGE_TAG"
  fi

  docker build "${build_args[@]}" -f "$DEVCONTAINER_REPO_DIR/docker/Dockerfile" -t "$BASE_IMAGE_TAG" "$DEVCONTAINER_REPO_DIR"
}

build_module() {
  local module_name="$1"
  local module_path image_tag base_image_id
  module_path="$(module_dir "$module_name")"
  image_tag="$(module_image_tag "$module_name")"
  base_image_id="$(docker image inspect --format '{{.Id}}' "$BASE_IMAGE_TAG" 2>/dev/null)"

  [[ -n "$base_image_id" ]] || fail "Could not determine image ID for base image: $BASE_IMAGE_TAG"

  echo "==> Building module image for $module_name as $image_tag"
  docker build \
    --label "mmm.devcontainer.base-image=$BASE_IMAGE_TAG" \
    --label "mmm.devcontainer.base-image-id=$base_image_id" \
    -f "$module_path/.devcontainer/Dockerfile" \
    -t "$image_tag" \
    "$module_path/.devcontainer"
}

ensure_base_image() {
  if docker image inspect "$BASE_IMAGE_TAG" >/dev/null 2>&1; then
    return
  fi

  echo "==> Local base image not found, building it first"
  build_base
}

ensure_module_image() {
  local module_name="$1"
  local image_tag current_base_image_id recorded_base_image_id
  image_tag="$(module_image_tag "$module_name")"

  ensure_base_image

  current_base_image_id="$(docker image inspect --format '{{.Id}}' "$BASE_IMAGE_TAG" 2>/dev/null)"
  [[ -n "$current_base_image_id" ]] || fail "Could not determine image ID for base image: $BASE_IMAGE_TAG"

  if ! docker image inspect "$image_tag" >/dev/null 2>&1; then
    echo "==> Local module image not found for $module_name, building it first"
    build_module "$module_name"
    return
  fi

  recorded_base_image_id="$(docker image inspect --format '{{index .Config.Labels "mmm.devcontainer.base-image-id"}}' "$image_tag" 2>/dev/null || true)"

  if [[ -z "$recorded_base_image_id" ]]; then
    echo "==> Local module image for $module_name has no recorded base image metadata, rebuilding it"
    build_module "$module_name"
    return
  fi

  if [[ "$recorded_base_image_id" != "$current_base_image_id" ]]; then
    echo "==> Local module image for $module_name is based on an outdated base image, rebuilding it"
    build_module "$module_name"
  fi
}

run_check() {
  local module_name="$1"
  local module_path image_tag npm_script
  module_path="$(module_dir "$module_name")"
  image_tag="$(module_image_tag "$module_name")"
  npm_script="$(detect_check_script_name "$module_path")" || fail "Could not detect checker npm script in $module_name/package.json"

  ensure_module_image "$module_name"

  echo "==> Running npm run $npm_script inside local container for $module_name"
  docker run --rm -t \
    --entrypoint sh \
    -v "$module_path:/opt/magic_mirror/modules/$module_name" \
    -w "/opt/magic_mirror/modules/$module_name" \
    "$image_tag" \
    -lc "npm run $npm_script"
}

full_test() {
  local module_name="$1"
  build_base
  build_module "$module_name"
  run_check "$module_name"
}

open_module() {
  local module_name="$1"
  local module_path
  module_path="$(module_dir "$module_name")"

  if has_command devcontainer; then
    echo "==> Starting devcontainer for $module_name via devcontainer CLI"
    devcontainer up --workspace-folder "$module_path"

    if has_devcontainer_open; then
      echo "==> Opening $module_name in a new VS Code window via devcontainer CLI"
      devcontainer open --workspace-folder "$module_path" --new-window
      return
    fi

    echo "==> Installed devcontainer CLI does not support 'open'; falling back to VS Code"
  fi

  has_command code || fail "No usable opener found. Install the VS Code devcontainer CLI with 'Dev Containers: Install devcontainer CLI' or ensure the code CLI is available."

  echo "==> Opening $module_name in a new VS Code window"
  code -n "$module_path"
  cat <<EOF

Opened $module_name in a new VS Code window.

The local base image is already available under:
  $BASE_IMAGE_TAG

The container may already be running, but automatic attach is only possible when the VS Code-provided devcontainer CLI supports:
  devcontainer open

In the new window run one of these commands:
  Dev Containers: Reopen in Container
  Dev Containers: Attach to Running Container

If you want this script to start and open the devcontainer automatically, install it once via:
  Dev Containers: Install devcontainer CLI

The module's Dockerfile still points to:
  $BASE_IMAGE_TAG

That means the rebuild will use your locally built base image unless you force a pull.
EOF
}

full_open() {
  local module_name="$1"
  build_base
  open_module "$module_name"
}

require_command docker
require_command node

command_name="${1:-}"
first_arg="${2:-}"

case "$command_name" in
  build-base)
    if [[ -n "$first_arg" && "$first_arg" != "--force" ]]; then
      fail "build-base only supports the optional --force flag"
    fi
    build_base "$([[ "$first_arg" == "--force" ]] && printf 'true' || printf 'false')"
    ;;
  run-check)
    [[ -n "$first_arg" ]] || fail "run-check requires a module name"
    run_check "$first_arg"
    ;;
  full-test)
    [[ -n "$first_arg" ]] || fail "full-test requires a module name"
    full_test "$first_arg"
    ;;
  open-module)
    [[ -n "$first_arg" ]] || fail "open-module requires a module name"
    open_module "$first_arg"
    ;;
  full-open)
    [[ -n "$first_arg" ]] || fail "full-open requires a module name"
    full_open "$first_arg"
    ;;
  ''|-h|--help|help)
    usage
    ;;
  *)
    usage
    fail "Unknown command: $command_name"
    ;;
esac