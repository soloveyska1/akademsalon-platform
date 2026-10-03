#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 -m unittest discover -s scripts/cloud-workspace -p 'test_*.py' -v
python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v
./bin/brain validate --strict
node --test tests/*.test.js
