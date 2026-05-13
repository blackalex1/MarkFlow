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
echo "### Syncing with origin/main..."
git fetch origin
git reset --hard origin/main

# Go back to deploy folder
cd deploy

# 4. Check for .env
if [ ! -f "../.env" ]; then
    echo "Error: .env file not found in project root."
    echo "Please run ./setup.sh first."
    exit 1
fi

# 5. Rebuild and Restart
echo "### Rebuilding containers (No-Cache)..."
# Using --no-cache ensures that our recent code changes are always applied
$DOCKER_COMPOSE --env-file ../.env build --pull --no-cache

echo "### Restarting services..."
$DOCKER_COMPOSE --env-file ../.env up -d --remove-orphans

echo "### Cleaning up old resources..."
docker image prune -f
docker network prune -f

echo ""
echo "=========================================================="
echo "           Update Complete! System is online.             "
echo "=========================================================="

echo ""
echo "=========================================================="
echo "           Update Complete! System is online.             "
echo "=========================================================="
