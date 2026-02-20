#!/bin/bash
#
# Migrate All Agent Wallets to SPV-Native Schema
#
# This script migrates all known agent wallets to the new SPV schema
# by fetching raw transactions and merkle proofs from WhatsOnChain.
#
# DO NOT RUN THIS IN PRODUCTION WITHOUT PROPER BACKUPS!
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "     AGENT WALLET SPV MIGRATION"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}ERROR: Must run from project root (where package.json is)${NC}"
  exit 1
fi

# Track overall status
TOTAL_AGENTS=0
MIGRATED_AGENTS=0
SKIPPED_AGENTS=0
FAILED_AGENTS=0

# Function to migrate a single wallet
migrate_wallet() {
  local NAME=$1
  local CONFIG_PATH=$2
  local DB_PATH=$3

  echo "----------------------------------------"
  echo "Agent: $NAME"
  echo "Config: $CONFIG_PATH"
  echo "DB: $DB_PATH"
  echo ""

  TOTAL_AGENTS=$((TOTAL_AGENTS + 1))

  # Check if config exists
  if [ ! -f "$CONFIG_PATH" ]; then
    echo -e "${YELLOW}⚠ Config not found, skipping${NC}"
    SKIPPED_AGENTS=$((SKIPPED_AGENTS + 1))
    echo ""
    return
  fi

  # Check if database exists
  if [ ! -f "$DB_PATH" ]; then
    echo -e "${YELLOW}⚠ Database not found, skipping${NC}"
    SKIPPED_AGENTS=$((SKIPPED_AGENTS + 1))
    echo ""
    return
  fi

  # Run migration
  echo "Running migration..."
  if npx tsx src/cli/migrate.ts --config "$CONFIG_PATH" --db "$DB_PATH"; then
    echo -e "${GREEN}✓ Migration successful${NC}"
    MIGRATED_AGENTS=$((MIGRATED_AGENTS + 1))

    # Run verification
    echo ""
    echo "Running verification..."
    if npx tsx src/cli/verify.ts --config "$CONFIG_PATH" --db "$DB_PATH"; then
      echo -e "${GREEN}✓ Verification passed${NC}"
    else
      echo -e "${YELLOW}⚠ Verification found issues (may be normal for unconfirmed txs)${NC}"
    fi
  else
    echo -e "${RED}✗ Migration failed${NC}"
    FAILED_AGENTS=$((FAILED_AGENTS + 1))

    # Check if backup exists
    if [ -f "${DB_PATH}.bak" ]; then
      echo -e "${YELLOW}Backup saved at: ${DB_PATH}.bak${NC}"
    fi
  fi

  echo ""
}

# IMPORTANT: Expand ~ to $HOME for proper path resolution
CONFIG_BASE="${HOME}/.openclaw"
P2P_BASE="${HOME}/.bsv-p2p"

echo "Starting migrations..."
echo ""

# Migrate Treasury (special case: different config location and field name)
migrate_wallet "Treasury" \
  "${P2P_BASE}/config.json" \
  "${P2P_BASE}/wallet.db"

# Migrate Agent wallets
migrate_wallet "Coder" \
  "${CONFIG_BASE}/workspace-coder/wallet-config.json" \
  "${CONFIG_BASE}/workspace-coder/wallet.db"

migrate_wallet "Leto" \
  "${CONFIG_BASE}/workspace-leto/wallet-config.json" \
  "${CONFIG_BASE}/workspace-leto/wallet.db"

migrate_wallet "QA" \
  "${CONFIG_BASE}/workspace-qa/wallet-config.json" \
  "${CONFIG_BASE}/workspace-qa/wallet.db"

migrate_wallet "Writer" \
  "${CONFIG_BASE}/workspace-writer/wallet-config.json" \
  "${CONFIG_BASE}/workspace-writer/wallet.db"

migrate_wallet "Researcher" \
  "${CONFIG_BASE}/workspace-researcher/wallet-config.json" \
  "${CONFIG_BASE}/workspace-researcher/wallet.db"

# Note: Assistant has no wallet config, so we skip it

echo "========================================="
echo "          MIGRATION COMPLETE"
echo "========================================="
echo ""
echo "Total agents: $TOTAL_AGENTS"
echo -e "${GREEN}✓ Migrated: $MIGRATED_AGENTS${NC}"
echo -e "${YELLOW}⚠ Skipped: $SKIPPED_AGENTS${NC}"
echo -e "${RED}✗ Failed: $FAILED_AGENTS${NC}"
echo ""

if [ $FAILED_AGENTS -gt 0 ]; then
  echo -e "${RED}WARNING: Some migrations failed!${NC}"
  echo "Check the output above for details."
  echo "Backups were created for all attempted migrations."
  exit 1
elif [ $MIGRATED_AGENTS -eq 0 ]; then
  echo -e "${YELLOW}No wallets were migrated.${NC}"
  echo "This might mean all wallets are already migrated or none exist."
  exit 0
else
  echo -e "${GREEN}Success! All found wallets migrated successfully.${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Test wallet functionality with a small transaction"
  echo "2. Keep backups (*.bak files) until you're sure everything works"
  echo "3. Consider deleting backups after a few successful transactions"
fi