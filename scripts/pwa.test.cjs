const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const icon = fs.readFileSync(path.join(root, "icon.svg"), "utf8");

test("PWA manifest declares an installable standalone app and existing icon", function() {
  assert.equal(manifest.name, "The Adventure");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.some(function(icon) {
    return icon.sizes === "any" && fs.existsSync(path.join(root, icon.src.replace(/^\.\//, "")));
  }));
});

test("page links the manifest and registers the service worker", function() {
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"\s*\/>/);
  assert.match(html, /navigator\.serviceWorker\.register\("\.\/sw\.js"\)/);
});

test("app icon matches the skull and straw hat from the main menu", function() {
  assert.match(icon, /stroke="#CC2222"/);
  assert.match(icon, /fill="#F2EED8"/);
  assert.match(icon, /viewBox="0 0 140 140"/);
});

test("service worker script is valid and precaches the app shell", function() {
  assert.doesNotThrow(function() { new vm.Script(serviceWorker); });
  for (const asset of ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"]) {
    assert.ok(serviceWorker.includes(JSON.stringify(asset)));
  }
  assert.match(serviceWorker, /caches\.match\("\.\/index\.html"\)/);
});