#!/bin/bash
cd "$(dirname "$0")"
node --disable-warning=ExperimentalWarning server/reset-password.js
read -p "Press Enter to close."
