#!/usr/bin/env bash
# ==============================================================================
# 🧠 Amneshia v3 Universal Installer
# Git-native knowledge graph for AI agents with truth maintenance
# ==============================================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BOLD}${BLUE}"
cat << "EOF"
    ___                                __    _      
   /   |  ____ ___  ____  ___  _____/ /_  (_)___ _
  / /| | / __ `__ \/ __ \/ _ \/ ___/ __ \/ / __ `/
 / ___ |/ / / / / / / / /  __(__  ) / / / / /_/ / 
/_/  |_/_/ /_/ /_/_/ /_/\___/____/_/ /_/_/\__,_/  
EOF
echo -e "${NC}"
echo -e "${BOLD}Amneshia v3 — Universal Knowledge Graph Engine for AI Agents${NC}\n"

# 1. Check Node.js runtime
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}Error: Node.js is required but not installed.${NC}"
    echo -e "Please install Node.js (>= 18.0.0) via your preferred manager (fnm, nvm, or brew) and re-run this script."
    exit 1
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo -e "${RED}Error: Node.js version >= 18 is required. Current: $(node -v)${NC}"
    exit 1
fi

echo -e "✓ Found Node.js: ${GREEN}$(node -v)${NC}"

# 2. Select package manager
PKG_MANAGER=""
if command -v bun >/dev/null 2>&1; then
    PKG_MANAGER="bun"
elif command -v pnpm >/dev/null 2>&1; then
    PKG_MANAGER="pnpm"
elif command -v npm >/dev/null 2>&1; then
    PKG_MANAGER="npm"
else
    echo -e "${RED}Error: Neither npm, pnpm, nor bun was found.${NC}"
    exit 1
fi

echo -e "✓ Using Package Manager: ${GREEN}${PKG_MANAGER}${NC}"

# 3. Perform Installation
TARBALL_URL="https://github.com/SabilMurti/Amneshia/releases/latest/download/amneshia-latest.tgz"
echo -e "\n${BOLD}Fetching & Installing latest Amneshia release...${NC}"

INSTALLED=0

# Primary method: Install directly from GitHub Release Tarball (Zero login/auth needed)
if [ "$PKG_MANAGER" = "npm" ]; then
    if npm install -g "$TARBALL_URL" >/dev/null 2>&1; then
        INSTALLED=1
    fi
elif [ "$PKG_MANAGER" = "pnpm" ]; then
    if pnpm add -g "$TARBALL_URL" >/dev/null 2>&1; then
        INSTALLED=1
    fi
elif [ "$PKG_MANAGER" = "bun" ]; then
    if bun install -g "$TARBALL_URL" >/dev/null 2>&1; then
        INSTALLED=1
    fi
fi

# Fallback: Scoped package install
if [ "$INSTALLED" -eq 0 ]; then
    echo -e "${YELLOW}Notice: Direct tarball download not yet available or failed. Attempting registry install...${NC}"
    if [ "$PKG_MANAGER" = "npm" ]; then
        npm install -g @sabilmurti/amneshia
    elif [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm add -g @sabilmurti/amneshia
    elif [ "$PKG_MANAGER" = "bun" ]; then
        bun install -g @sabilmurti/amneshia
    fi
fi

# 4. Verification
if command -v amneshia >/dev/null 2>&1; then
    VERSION=$(amneshia --version)
    echo -e "\n${GREEN}${BOLD}✓ Amneshia successfully installed! (v${VERSION})${NC}"
    echo -e "Binary path: ${BLUE}$(command -v amneshia)${NC}"
    echo -e "\n${BOLD}Quick Start:${NC}"
    echo -e "  1. Start Web Dashboard:     ${GREEN}amneshia serve${NC}"
    echo -e "  2. View Knowledge Stats:    ${GREEN}amneshia stats${NC}"
    echo -e "  3. Local Project Repo:      ${GREEN}amneshia init${NC}"
    echo -e "\n${BOLD}MCP Configuration (Antigravity IDE / Claude Desktop):${NC}"
    cat << EOF
{
  "mcpServers": {
    "amneshia": {
      "command": "$(command -v amneshia)",
      "args": ["--tool-profile", "core"]
    }
  }
}
EOF
else
    echo -e "\n${YELLOW}Installation succeeded, but 'amneshia' is not in your current PATH.${NC}"
    echo -e "Ensure your global node/bin directory is in your PATH environment variable."
fi
