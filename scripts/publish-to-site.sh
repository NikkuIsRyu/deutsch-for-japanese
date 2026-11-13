#!/usr/bin/env bash
# Build for https://nikku.tech/deutsch/ and copy into the website repo on a new branch.
# Usage: scripts/publish-to-site.sh [path-to-Nikku.github.io-checkout]
set -euo pipefail
SITE="${1:-$HOME/Documents/Website-Project}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
npm test
SITE_URL=https://nikku.tech BASE_PATH=/deutsch npm run build
git -C "$SITE" fetch -q origin
BR="feat/deutsch-update-$(date +%Y%m%d-%H%M)"
WT="${SITE}-deutsch-update"
git -C "$SITE" worktree add -q "$WT" -b "$BR" origin/main
rm -rf "$WT/public/deutsch" && mkdir -p "$WT/public/deutsch"
cp -r dist/. "$WT/public/deutsch/"
git -C "$WT" add public/deutsch
git -C "$WT" commit -q -m "chore(deutsch): update German practice build"
echo "Committed on $BR in $WT. Review, then: git -C $WT push origin $BR:main"
