#!/usr/bin/env bash
# Installs the repository hooks for this clone. Repository-local config only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

chmod +x .githooks/pre-commit .githooks/pre-push
git config core.hooksPath .githooks

printf "Git hooks installed: pre-commit (secret/whitespace/typecheck) and pre-push (scripts/check.sh).\n"
printf "Never bypass them with --no-verify; fix the gate instead.\n"
