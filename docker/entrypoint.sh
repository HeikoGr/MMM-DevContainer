#!/bin/sh

set -e

MAGICMIRROR_PATH="/opt/magic_mirror"
CUSTOM_MODULES_DIR="${MAGICMIRROR_PATH}/modules/custom"

git config --global alias.pr '!f() { git fetch -fu ${2:-origin} refs/pull/$1/head:pr/$1 && git checkout pr/$1; }; f'

# Load environment variables from project .env (if present) so we can configure git
# Example .env entries:
ENV_FILE="${MAGICMIRROR_PATH}/.env"
if [ -f "$ENV_FILE" ]; then
	echo "Loading environment variables from $ENV_FILE"
	# Export variables from the .env file into the environment for this script.
	# Use set -a so sourced variables become exported; then unset that behaviour.
	set -a
	# shellcheck disable=SC1090
	. "$ENV_FILE"
	set +a
fi

# Configure git global user from environment variables (if provided)
if command -v git >/dev/null 2>&1; then
	# Prefer explicit GIT_USER_NAME / GIT_USER_EMAIL; fall back to GIT_USER / GIT_EMAIL
	if [ -n "$GIT_USER_NAME" ] || [ -n "$GIT_USER" ]; then
		NAME="${GIT_USER_NAME:-$GIT_USER}"
		echo "Setting git user.name to '$NAME'"
		git config --global user.name "$NAME" || true
	fi
	if [ -n "$GIT_USER_EMAIL" ] || [ -n "$GIT_EMAIL" ]; then
		EMAIL="${GIT_USER_EMAIL:-$GIT_EMAIL}"
		echo "Setting git user.email to '$EMAIL'"
		git config --global user.email "$EMAIL" || true
	fi
fi

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "${GREEN}=== MagicMirror Startup ===${NC}"

# Ensure default modules are available inside mounted modules directory (idempotent)
# If a host volume is mounted at /opt/magic_mirror/modules, create a symlink to the
# container's original default modules so they are visible in the container.
if [ -d "${MAGICMIRROR_PATH}/modules" ]; then
	ln -sfn "${MAGICMIRROR_PATH}/__modules/default" "${MAGICMIRROR_PATH}/modules/default" 2>/dev/null || true
fi

# Copy sample CSS if missing
if [ -d "${MAGICMIRROR_PATH}/css" ]; then
	cp -n ${MAGICMIRROR_PATH}/__css/* ${MAGICMIRROR_PATH}/css 2>/dev/null || true
fi

# Install production dependencies for custom modules if needed
if [ -d "${MAGICMIRROR_PATH}/modules" ]; then
	for MOD in "${MAGICMIRROR_PATH}/modules"/*; do
		if [ -f "$MOD/package.json" ]; then
			if [ ! -d "$MOD/node_modules" ] || [ -z "$(ls -A "$MOD/node_modules" 2>/dev/null)" ]; then
				echo "${YELLOW}Installing module dependencies in $(basename "$MOD")...${NC}"
				npm --prefix "$MOD" install || true
			fi
		fi
	done
fi

# MagicMirror starten
cd "$MAGICMIRROR_PATH"
echo "${GREEN}Starting MagicMirror under PM2...${NC}"

# Finally start the application under pm2-runtime. Use exec so PID 1 is pm2-runtime
# which makes signal handling and process lifetime behave correctly inside containers.
exec pm2-runtime start /opt/magic_mirror/ecosystem.config.js