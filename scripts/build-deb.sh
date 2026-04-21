#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
PKG_NAME="verifyor"
BUILD_DIR="${ROOT_DIR}/dist/deb-build"
PKG_DIR="${BUILD_DIR}/${PKG_NAME}_${VERSION}"
APP_DIR="${PKG_DIR}/opt/${PKG_NAME}"
CONTROL_DIR="${PKG_DIR}/DEBIAN"
OUTPUT_DEB="${ROOT_DIR}/dist/${PKG_NAME}_${VERSION}_all.deb"

echo "→ Construction du paquet Debian ${PKG_NAME} v${VERSION}"

rm -rf "${BUILD_DIR}"
mkdir -p \
  "${APP_DIR}" \
  "${CONTROL_DIR}" \
  "${PKG_DIR}/usr/bin" \
  "${PKG_DIR}/usr/share/applications" \
  "${PKG_DIR}/usr/share/icons/hicolor/scalable/apps" \
  "${ROOT_DIR}/dist"

# ── Fichier de contrôle ──────────────────────────────────────────────────
sed "s/__VERSION__/${VERSION}/g" "${ROOT_DIR}/packaging/deb/control" > "${CONTROL_DIR}/control"

# ── Scripts Debian ───────────────────────────────────────────────────────
install -m 0755 "${ROOT_DIR}/packaging/deb/postinst" "${CONTROL_DIR}/postinst"

# ── Lanceur /usr/bin/verifyor ────────────────────────────────────────────
install -m 0755 "${ROOT_DIR}/packaging/deb/verifyor" "${PKG_DIR}/usr/bin/verifyor"

# ── Entrée menu .desktop ─────────────────────────────────────────────────
install -m 0644 "${ROOT_DIR}/packaging/deb/verifyor.desktop" \
  "${PKG_DIR}/usr/share/applications/verifyor.desktop"

# ── Icône application ────────────────────────────────────────────────────
install -m 0644 "${ROOT_DIR}/packaging/verifyor.svg" \
  "${PKG_DIR}/usr/share/icons/hicolor/scalable/apps/verifyor.svg"

# ── Fichiers de l'application ────────────────────────────────────────────
cp -R \
  "${ROOT_DIR}/admin-db.html" \
  "${ROOT_DIR}/admin-db.js" \
  "${ROOT_DIR}/app.js" \
  "${ROOT_DIR}/index.html" \
  "${ROOT_DIR}/search-db.html" \
  "${ROOT_DIR}/search-db.js" \
  "${ROOT_DIR}/server.js" \
  "${ROOT_DIR}/settings.html" \
  "${ROOT_DIR}/settings.js" \
  "${ROOT_DIR}/styles.css" \
  "${ROOT_DIR}/package.json" \
  "${ROOT_DIR}/package-lock.json" \
  "${ROOT_DIR}/README.md" \
  "${ROOT_DIR}/CONTEXT.md" \
  "${ROOT_DIR}/INSTALL.md" \
  "${ROOT_DIR}/requirements.txt" \
  "${ROOT_DIR}/.env.example" \
  "${ROOT_DIR}/lib" \
  "${ROOT_DIR}/services" \
  "${ROOT_DIR}/node_modules" \
  "${APP_DIR}/"

# ── Nettoyage du runtime (réduire la taille du paquet) ───────────────────
find "${APP_DIR}/node_modules" -type d \( -name test -o -name tests -o -name __tests__ \) -prune -exec rm -rf {} + 2>/dev/null || true
find "${APP_DIR}/node_modules" -type f \( -name "*.map" -o -name ".DS_Store" \) -delete 2>/dev/null || true
rm -f "${APP_DIR}/node_modules/.package-lock.json"

# ── Construction du .deb ─────────────────────────────────────────────────
dpkg-deb --build "${PKG_DIR}" "${OUTPUT_DEB}" >/dev/null

echo "✓ Paquet généré : ${OUTPUT_DEB}"
echo "  Taille : $(du -sh "${OUTPUT_DEB}" | cut -f1)"
