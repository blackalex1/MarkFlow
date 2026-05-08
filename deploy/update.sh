#!/bin/bash

echo "=========================================================="
echo "           MarkFlow: Updating Application                 "
echo "=========================================================="
echo ""

# Detect Docker Compose version
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Go to project root to pull changes
cd ..
echo "### Pulling latest changes from Git..."
git pull

# Go back to deploy folder
cd deploy

echo "### Rebuilding containers..."
# --pull ensures we check for newer base images (like python:3.11-slim)
$DOCKER_COMPOSE --env-file ../.env build --pull

echo "### Restarting services..."
# up -d will only restart containers that have changed
$DOCKER_COMPOSE --env-file ../.env up -d

echo "### Cleaning up old images..."
docker image prune -f

echo ""
echo "=========================================================="
echo "           Update Complete! System is online.             "
echo "=========================================================="
