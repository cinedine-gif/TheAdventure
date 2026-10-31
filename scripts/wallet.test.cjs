const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const walletSource = html.slice(html.indexOf("    function createOperationId()"), html.indexOf("    var onlineScoreQueue = []"));
const saveSource = html.slice(html.indexOf("    function saveState(state)"), html.indexOf("    function buildPlayerProgressSnapshot(sourceState)"));

function createServer() {
  return {
    balances: new Map(),
    operations: new Map(),
    inventories: new Map(),
    offline: false,
    loseReply: false,
    async rpc(name, parameters, session) {
      assert.equal(name, "apply_coin_transaction");
      if (this.offline) throw new Error("Offline");
      assert.equal(parameters.p_user_id, session.user.id);
      const userId = parameters.p_user_id;
      let balance = this.balances.get(userId) || 0;
      let applied = true;
      if (parameters.p_operation_id) {
        const operationKey = userId + ":" + parameters.p_operation_id;
        if (this.operations.has(operationKey)) {
          applied = this.operations.get(operationKey);
        } else {
          applied = balance + parameters.p_amount >= 0;
          if (applied) balance += parameters.p_amount;
          this.operations.set(operationKey, applied);
        }
        this.balances.set(userId, balance);
        if (this.loseReply) {
          this.loseReply = false;
          throw new Error("Response lost after commit");
        }
      }
      return { data: { balance: balance, applied: applied }, error: null };
    }
  };
}

function createBrowser(server, storage = new Map()) {
  const progress = JSON.parse(storage.get("progress") || '{"lives":3,"bombs":0,"dynamite":0}');
  const context = vm.createContext({
    Uint8Array, Array, Promise, JSON, Number, Math,
    onlineWallet: null,
    onlineSession: null,
    state: {
      coins: Number(storage.get("coins") || 0), progress: progress,
      selectedSkin: storage.get("skin") || "default",
      unlockedSkins: JSON.parse(storage.get("skins") || '["default"]')
    },
    STORAGE_KEYS: { coins: "coins", selectedSkin: "skin", unlockedSkins: "skins", progress: "progress" },
    SKINS: { red: { label: "Roja" } },
    GAMEPLAY: { livesPerPack: 3, bombsPerPack: 3, dynamitesPerPack: 10 },
    getAccountProgressCacheKey: function(userId) { return "progress_cache_" + userId; },
    buildPlayerProgressSnapshot: function(sourceState) {
      return {
        selectedSkin: sourceState.selectedSkin,
        unlockedSkins: sourceState.unlockedSkins.slice(),
        progress: JSON.parse(JSON.stringify(sourceState.progress))
      };
    },
    buildPlayerAccountCache: function(sourceState) {
      return {
        checkpoint: {
          selectedSkin: sourceState.selectedSkin,
          unlockedSkins: sourceState.unlockedSkins.slice(),
          progress: JSON.parse(JSON.stringify(sourceState.progress))
        },
        inventory: {
          selectedSkin: sourceState.selectedSkin,
          unlockedSkins: sourceState.unlockedSkins.slice(),
          lives: sourceState.progress.lives,
          bombs: sourceState.progress.bombs,
          dynamite: sourceState.progress.dynamite
        }
      };
    },
    saveOnlineInventory: function() {
      if (!context.onlineSession) return Promise.resolve(true);
      context.server.inventories.set(context.onlineSession.user.id, {
        selectedSkin: context.state.selectedSkin,
        unlockedSkins: context.state.unlockedSkins.slice(),
        lives: context.state.progress.lives,
        bombs: context.state.progress.bombs,
        dynamite: context.state.progress.dynamite
      });
      return Promise.resolve(true);
    },
    game: { running: false },
    toInt: function(value, fallback) {
      const result = parseInt(value, 10);
      return Number.isFinite(result) ? result : fallback;
    },
    localStorage: {
      getItem: function(key) { return storage.get(key) || null; },
      setItem: function(key, value) { storage.set(key, value); }
    },
    window: { crypto: webcrypto, addEventListener: function() {} },
    syncUI: function() {},
    setAccountStatus: function() {},
    setStoreMessage: function() {}
  });
  context.server = server;
  context.supabaseClient = {
    rpc: function(name, parameters) { return server.rpc(name, parameters, context.onlineSession); }
  };
  vm.runInContext(saveSource + walletSource, context);
  return {
    context: context,
    storage: storage,
    async login(userId) {
      context.onlineSession = userId ? { user: { id: userId } } : null;
      context.connectOnlineWallet(context.onlineSession);
      await context.flushOnlineWallet();
      const progressCache = userId && storage.get("progress_cache_" + userId);
      if (progressCache) {
        const cache = JSON.parse(progressCache);
        const checkpoint = cache.checkpoint || cache;
        context.state.progress = checkpoint.progress;
        if (cache.inventory) {
          context.state.progress.lives = cache.inventory.lives;
          context.state.progress.bombs = cache.inventory.bombs;
          context.state.progress.dynamite = cache.inventory.dynamite;
        }
      }
      const inventory = userId && server.inventories.get(userId);
      if (inventory) {
        context.state.selectedSkin = inventory.selectedSkin;
        context.state.unlockedSkins = inventory.unlockedSkins.slice();
        context.state.progress.lives = inventory.lives;
        context.state.progress.bombs = inventory.bombs;
        context.state.progress.dynamite = inventory.dynamite;
      }
    }
  };
}

test("inline scripts remain valid JavaScript", function() {
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script[1]);
  }
  assert.ok(!html.includes("\u0000"));
});

test("guest coins stay local and the initial balance transfers to only one account", async function() {
  const server = createServer();
  const browser = createBrowser(server, new Map([["coins", "200"]]));
  browser.context.earnCoins(10);
  browser.context.saveState(browser.context.state);
  assert.equal(browser.storage.get("coins"), "210");
  await browser.login("first");
  assert.equal(server.balances.get("first"), 210);
  await browser.login("second");
  assert.equal(browser.context.state.coins, 0);
  await browser.login("first");
  assert.equal(browser.context.state.coins, 210);
  await browser.login(null);
  assert.equal(browser.context.state.coins, 0);
});

test("the same account reads earnings and purchases on another device", async function() {
  const server = createServer();
  const first = createBrowser(server);
  const second = createBrowser(server);
  await first.login("player");
  first.context.earnCoins(200);
  await first.context.flushOnlineWallet();
  await second.login("player");
  assert.equal(second.context.state.coins, 200);
  second.context.purchaseWithCoins(100, { type: "lives" });
  await second.context.flushOnlineWallet();
  assert.equal(second.context.state.progress.lives, 6);
  assert.equal(server.inventories.get("player").lives, 6);
  await first.login("player");
  assert.equal(first.context.state.progress.lives, 6);
  await first.context.flushOnlineWallet(true);
  assert.equal(first.context.state.coins, 100);
});

test("offline earnings survive reload and synchronize once", async function() {
  const server = createServer();
  const first = createBrowser(server);
  await first.login("player");
  server.offline = true;
  first.context.earnCoins(25);
  await first.context.flushOnlineWallet();
  assert.equal(first.context.state.coins, 25);
  const restored = createBrowser(server, first.storage);
  await restored.login("player");
  assert.equal(restored.context.state.coins, 25);
  server.offline = false;
  await restored.context.flushOnlineWallet();
  await restored.context.flushOnlineWallet(true);
  assert.equal(server.balances.get("player"), 25);
  assert.equal(restored.context.onlineWallet.pending.length, 0);
});

test("a lost purchase response is recovered without charging or granting twice", async function() {
  const server = createServer();
  server.balances.set("player", 200);
  const first = createBrowser(server);
  await first.login("player");
  server.loseReply = true;
  first.context.purchaseWithCoins(100, { type: "lives" });
  await first.context.flushOnlineWallet();
  assert.equal(first.context.state.progress.lives, 3);
  assert.equal(server.balances.get("player"), 100);
  const restored = createBrowser(server, first.storage);
  await restored.login("player");
  assert.equal(restored.context.state.coins, 100);
  assert.equal(restored.context.state.progress.lives, 6);
  await restored.context.flushOnlineWallet(true);
  assert.equal(restored.context.state.progress.lives, 6);
  assert.equal(server.balances.get("player"), 100);
});

test("a stale device cannot buy with coins already spent elsewhere", async function() {
  const server = createServer();
  server.balances.set("player", 100);
  const first = createBrowser(server);
  const second = createBrowser(server);
  await first.login("player");
  await second.login("player");
  first.context.purchaseWithCoins(100, { type: "skin", skinId: "red" });
  await first.context.flushOnlineWallet();
  second.context.purchaseWithCoins(100, { type: "bombs" });
  await second.context.flushOnlineWallet();
  assert.equal(second.context.state.progress.bombs, 0);
  assert.equal(second.context.state.coins, 0);
  assert.equal(first.context.state.selectedSkin, "red");
});

test("a dynamite pack grants ten charges once after online confirmation", async function() {
  const server = createServer();
  server.balances.set("player", 300);
  const browser = createBrowser(server);
  await browser.login("player");

  browser.context.purchaseWithCoins(300, { type: "dynamite" });
  await browser.context.flushOnlineWallet();
  assert.equal(browser.context.state.progress.dynamite, 10);
  assert.equal(server.balances.get("player"), 0);

  await browser.context.flushOnlineWallet(true);
  assert.equal(browser.context.state.progress.dynamite, 10);
  assert.equal(server.balances.get("player"), 0);
});