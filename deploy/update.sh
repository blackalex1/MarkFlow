#!/bin/bash

echo "=========================================================="
echo "           MarkFlow: Updating Application                 "
echo "=========================================================="
echo ""

# Go to project root to pull changes
cd ..
echo "### Pulling latest changes from Git..."
git pull

# Go back to deploy folder
cd deploy

echo "### Rebuilding containers..."
# --pull ensures we check for newer base images (like python:3.11-slim)
docker-compose build --pull

echo "### Restarting services..."
# up -d will only restart containers that have changed
docker-compose up -d

echo "### Cleaning up old images..."
docker image prune -f

echo ""
echo "=========================================================="
echo "           Update Complete! System is online.             "
echo "=========================================================="
