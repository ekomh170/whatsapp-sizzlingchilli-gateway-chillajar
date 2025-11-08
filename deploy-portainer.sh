#!/bin/bash
# deploy-portainer.sh
# Script untuk deploy via Portainer API (advanced)

set -e

# Warna output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploy to Portainer via API${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Config
PORTAINER_URL=${PORTAINER_URL:-"https://manage.rekyndness.local:9443"}
PORTAINER_API_KEY=${PORTAINER_API_KEY:-""}
ENDPOINT_ID=${ENDPOINT_ID:-"1"}
STACK_NAME="wa-gateway-express"

if [ -z "$PORTAINER_API_KEY" ]; then
    echo -e "${RED}Error: PORTAINER_API_KEY not set${NC}"
    echo "Set it in .env or export PORTAINER_API_KEY=your_key"
    exit 1
fi

echo -e "${YELLOW}Portainer URL: ${PORTAINER_URL}${NC}"
echo -e "${YELLOW}Stack Name: ${STACK_NAME}${NC}"
echo ""

# Cek apakah stack sudah ada
STACK_ID=$(curl -s -k -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_URL}/api/stacks" | \
    jq -r ".[] | select(.Name==\"${STACK_NAME}\") | .Id")

if [ ! -z "$STACK_ID" ]; then
    echo -e "${YELLOW}Stack already exists (ID: ${STACK_ID}), updating...${NC}"
    
    # Update stack
    curl -k -X PUT \
        -H "X-API-Key: ${PORTAINER_API_KEY}" \
        -H "Content-Type: application/json" \
        -d @- \
        "${PORTAINER_URL}/api/stacks/${STACK_ID}?endpointId=${ENDPOINT_ID}" <<EOF
{
    "stackFileContent": "$(cat docker-compose.yml | sed 's/"/\\"/g' | tr '\n' ' ')",
    "env": $(cat .env | grep -v '^#' | grep -v '^$' | jq -R 'split("=") | {name:.[0],value:.[1]}' | jq -s '.')
}
EOF
    
    echo ""
    echo -e "${GREEN}✓ Stack updated!${NC}"
else
    echo -e "${YELLOW}Creating new stack...${NC}"
    
    # Create stack
    curl -k -X POST \
        -H "X-API-Key: ${PORTAINER_API_KEY}" \
        -H "Content-Type: application/json" \
        -d @- \
        "${PORTAINER_URL}/api/stacks?type=2&method=string&endpointId=${ENDPOINT_ID}" <<EOF
{
    "name": "${STACK_NAME}",
    "stackFileContent": "$(cat docker-compose.yml | sed 's/"/\\"/g' | tr '\n' ' ')",
    "env": $(cat .env | grep -v '^#' | grep -v '^$' | jq -R 'split("=") | {name:.[0],value:.[1]}' | jq -s '.')
}
EOF
    
    echo ""
    echo -e "${GREEN}✓ Stack created!${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Check status: ${PORTAINER_URL}/#!/3/docker/stacks"
echo ""
