#!/usr/bin/env bash
# install-node.sh — Installe ou met à jour Node.js 22 sans conflit APT
# Usage : bash <(curl -fsSL https://github.com/nouhailler/verifyor/raw/main/scripts/install-node.sh)
set -euo pipefail

MIN_MAJOR=22
MIN_MINOR=5
INSTALL_MAJOR=22

# ── Lire la version actuelle ──────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  CURRENT_VER=$(node --version)
  IS_COMPAT=$(node -e "
    const [maj, min] = process.versions.node.split('.').map(Number);
    process.exit((maj > ${MIN_MAJOR} || (maj === ${MIN_MAJOR} && min >= ${MIN_MINOR})) ? 0 : 1);
  " 2>/dev/null && echo "ok" || echo "old")
else
  CURRENT_VER="(non installé)"
  IS_COMPAT="absent"
fi

echo ""
echo "Verifyor — vérification Node.js"
echo "  Version détectée : ${CURRENT_VER}"
echo "  Version requise  : v${MIN_MAJOR}.${MIN_MINOR}.0 minimum (node:sqlite)"
echo ""

if [ "$IS_COMPAT" = "ok" ]; then
  echo "✓ Node.js ${CURRENT_VER} est compatible — aucune action nécessaire."
  echo ""
  exit 0
fi

if [ "$IS_COMPAT" = "old" ]; then
  echo "⚠️  Node.js ${CURRENT_VER} est trop ancien pour Verifyor."
  echo "   node:sqlite est disponible uniquement à partir de v22.5.0."
  echo ""
fi

echo "→ Installation de Node.js ${INSTALL_MAJOR}.x via nodesource..."
echo "  (Cela remplacera toute version antérieure — les paquets qui"
echo "   dépendent d'une ancienne version pourraient être affectés.)"
echo ""
read -r -p "Continuer ? [o/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[oOyY]$ ]]; then
  echo "Annulé."
  exit 1
fi

# ── Supprimer un éventuel dépôt nodesource conflictuel ───────────────────
if [ -f /etc/apt/sources.list.d/nodesource.list ]; then
  echo "→ Suppression de l'ancien dépôt nodesource..."
  sudo rm -f /etc/apt/sources.list.d/nodesource.list
fi

# ── Installer Node.js 22 ──────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_${INSTALL_MAJOR}.x | sudo -E bash -
sudo apt-get install -y nodejs

echo ""
echo "✓ Node.js $(node --version) installé avec succès."
echo ""
