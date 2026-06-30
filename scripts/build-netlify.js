const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist", "netlify");
const files = [
  "index.html",
  "admin-db.html",
  "search-db.html",
  "settings.html",
  "styles.css",
  "local-store.js",
  "app.js",
  "admin-db.js",
  "search-db.js",
  "settings.js",
  "pwa.js",
  "service-worker.js",
  "manifest.webmanifest"
];
const dirs = ["icons"];
const requiredFiles = [
  ...files,
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`Missing Netlify PWA asset: ${file}`);
  }
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

for (const dir of dirs) {
  fs.cpSync(path.join(root, dir), path.join(output, dir), { recursive: true });
}

console.log(`Netlify PWA build written to ${path.relative(root, output)}`);
