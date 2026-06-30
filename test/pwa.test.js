const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("le manifeste PWA référence des icônes mobiles valides", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));

  for (const icon of manifest.icons) {
    const iconPath = path.join(root, icon.src.replace(/^\//, ""));
    assert.ok(fs.statSync(iconPath).size > 100, `${icon.src} est vide`);
  }
});

test("le service worker met en cache les ressources indispensables", () => {
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

  for (const asset of ["/index.html", "/styles.css", "/manifest.webmanifest", "/icons/icon-192.png"]) {
    assert.match(worker, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("chaque page charge le manifeste et initialise la PWA", () => {
  for (const page of ["index.html", "admin-db.html", "search-db.html", "settings.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon" href="\/icons\/icon-192\.png"/);
    assert.match(html, /<script src="\/pwa\.js"><\/script>/);
  }
});
