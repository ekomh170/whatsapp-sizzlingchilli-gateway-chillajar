#!/bin/bash
# build-and-push.sh
# Script untuk build Docker image dan push ke Docker Hub (optional)

set -e

# Warna output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}WhatsApp Gateway - Build & Deploy${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Load environment variables
if [ -f .env ]; then
    echo -e "${GREEN}✓ Loading .env file...${NC}"
    source .env
else
    echo -e "${YELLOW}⚠ .env file not found, using defaults${NC}"
fi

# Variabel
IMAGE_NAME="chillajar-wa-gateway"
TAG=${1:-latest}
REGISTRY=${DOCKER_REGISTRY:-""}

echo ""
echo -e "${YELLOW}Building image: ${IMAGE_NAME}:${TAG}${NC}"
echo ""

# Build image
docker build -t ${IMAGE_NAME}:${TAG} .

echo ""
echo -e "${GREEN}✓ Image built successfully!${NC}"
echo ""

# Cek apakah ada registry (untuk push ke Docker Hub/private registry)
if [ ! -z "$REGISTRY" ]; then
    echo -e "${YELLOW}Tagging for registry: ${REGISTRY}${NC}"
    docker tag ${IMAGE_NAME}:${TAG} ${REGISTRY}/${IMAGE_NAME}:${TAG}
    
    read -p "Push to registry? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Pushing to registry...${NC}"
        docker push ${REGISTRY}/${IMAGE_NAME}:${TAG}
        echo -e "${GREEN}✓ Image pushed successfully!${NC}"
    fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Build Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Image: ${IMAGE_NAME}:${TAG}"
echo ""
echo "Next steps:"
echo "1. Deploy to server with docker-compose"
echo "2. Or deploy via Portainer UI"
echo ""
echo "Commands:"
echo "  docker-compose up -d"
echo "  docker logs chillajar_wa_gateway -f"
echo ""
