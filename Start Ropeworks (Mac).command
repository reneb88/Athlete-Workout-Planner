#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed yet. Install the LTS version from nodejs.org, then double-click this file again."
  open "https://nodejs.org/en/download"
  read -p "Press Enter to close."
  exit 1
fi
[ -d node_modules ] || { echo "Installing for the first time - this takes a minute..."; npm install; }
npm run build --silent
(sleep 3; open "http://localhost:3001") &
node --disable-warning=ExperimentalWarning server/index.js
