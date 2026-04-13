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

rm -rf "${BUILD_DIR}"
mkdir -p "${APP_DIR}" "${CONTROL_DIR}" "${PKG_DIR}/usr/bin" "${ROOT_DIR}/dist"

sed "s/__VERSION__/${VERSION}/g" "${ROOT_DIR}/packaging/deb/control" > "${CONTROL_DIR}/control"
install -m 0755 "${ROOT_DIR}/packaging/deb/verifyor" "${PKG_DIR}/usr/bin/verifyor"

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
  "${ROOT_DIR}/lib" \
  "${ROOT_DIR}/services" \
  "${ROOT_DIR}/node_modules" \
  "${APP_DIR}/"

dpkg-deb --build "${PKG_DIR}" "${OUTPUT_DEB}" >/dev/null
echo "${OUTPUT_DEB}"
