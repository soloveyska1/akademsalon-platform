#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
git --version
node --version
python3 --version
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) throw Error("Node.js 22+ is required")'
python3 -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ is required"'
python3 scripts/cloud-workspace/prepare.py
./bin/brain validate --strict
printf '\nReady. Read docs/CLOUD-WORKSPACE.md and docs/brain/CURRENT-HANDOFF.md.\n'
printf 'Start preview: python3 scripts/cloud-workspace/serve.py\n'
