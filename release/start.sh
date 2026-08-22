#!/bin/bash
echo "Installing production dependencies..."
npm install --omit=dev
echo "Starting Local Sim Dashboard..."
node dist-server/index.js
