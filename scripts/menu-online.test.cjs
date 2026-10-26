const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const presenceSource = html.slice(html.indexOf("    var onlinePresenceChannel = null;"), html.indexOf("    function setupOnlineFeatures()"));
const exitSource = html.slice(html.indexOf("    function exitToMainMenu()"), html.indexOf('    document.getElementById("btn-back-menu").addEventListener'));
const leaderboardSource = html.slice(html.indexOf("    function loadLeaderboard()"), html.indexOf("    function createOperationId()"));
const gameOverSource = html.slice(html.indexOf("      onGameOver: function()"), html.indexOf("      onLevelComplete: function("));

function createPresenceHarness() {
  const handlers = {};
  const storage = new Map();
  const countElement = { textContent: "" };
  const channel = {
    state: {},
    on: function(type, options, callback) {
      handlers[options.event] = callback;
      return this;
    },
    subscribe: function(callback) {
      this.statusHandler = callback;
      return this;
    },
    track: function(payload) {
      this.tracked = payload;
      return Promise.resolve("ok");
    },
    presenceState: function() { return this.state; }
  };
  const context = vm.createContext({
    supabaseClient: {
      channel: function(topic, options) {
        assert.equal(topic, "the-adventure-online");
        assert.equal(options.config.presence.key, "local-player");
        return channel;
      }
    },
    document: { getElementById: function() { return countElement; } },
    localStorage: {
      getItem: function(key) { return storage.get(key) || null; },
      setItem: function(key, value) { storage.set(key, value); }
    },
    createOperationId: function() { return "local-player"; }
  });
  vm.runInContext(presenceSource, context);
  return { context: context, channel: channel, handlers: handlers, countElement: countElement, storage: storage };
}

test("menu exit and online player presence work", async function() {
  assert.match(html, /title="Reiniciar progreso"/);
  assert.match(html, /id="btn-reset"[^>]*>Reiniciar progreso<\/button>/);
  assert.doesNotMatch(html, /Reiniciar progreso local/);
  assert.match(html, /@media \(max-width: 760px\) \{[\s\S]*?\.menu-tools \{[\s\S]*?align-items: flex-end;[\s\S]*?width: auto;/);
  assert.match(html, /\.menu-tools button \{[\s\S]*?height: 40px;/);
  assert.match(html, /#btn-account \{[\s\S]*?text-overflow: ellipsis;/);
  assert.match(html, /\.menu-tools #btn-account \{[\s\S]*?background: #f5d24f;[\s\S]*?color: #2d2410;/);
  const menuSection = html.slice(html.indexOf('id="screen-menu"'), html.indexOf('id="screen-account"'));
  const progressSection = html.slice(html.indexOf('id="screen-islands"'), html.indexOf('id="screen-game"'));
  assert.doesNotMatch(menuSection, /id="btn-reset"/);
  assert.match(progressSection, /id="btn-reset"/);
  assert.match(progressSection, /class="islands-actions"[\s\S]*id="btn-islands-back"[\s\S]*id="btn-reset"/);
  assert.match(html, /\.islands-actions \{[\s\S]*?justify-content: space-between;/);
  assert.doesNotMatch(progressSection, /id="btn-reset"[^>]*>[\s\S]*?<img/);
  assert.match(html, /getElementById\("btn-reset"\)\.addEventListener\("click", function\(\) \{\s*document\.getElementById\("confirm-modal"\)\.classList\.remove\("hidden"\)/);
  assert.match(html, /getElementById\("btn-confirm-cancel"\)\.addEventListener/);
  assert.match(html, /getElementById\("btn-confirm-ok"\)\.addEventListener/);
  assert.match(html, /id="btn-level-menu"[^>]*>Menú principal<\/button>/);
  assert.match(html, /getElementById\("btn-level-menu"\)\.addEventListener\("click", exitToMainMenu\)/);
  assert.match(html, /function showGameOver\(title, message, actionLabel, callback\)/);
  assert.match(html, /btn\.textContent = actionLabel;[\s\S]*?btn\._nextCallback = callback;[\s\S]*?level-overlay"\)\.classList\.remove\("hidden"\)/);
  assert.match(gameOverSource, /showGameOver\([\s\S]*?"Volver a empezar"/);
  assert.match(gameOverSource, /showGameOver\([\s\S]*?"Ir a la tienda"[\s\S]*?btn-store/);

  const classes = [];
  const elements = {
    "level-ready": { classList: { add: function(name) { classes.push(["level-ready", name]); } } },
    "boss-hud": { classList: { add: function(name) { classes.push(["boss-hud", name]); } } }
  };
  const state = { progress: { level: 3 } };
  let stopped = false;
  let shownScreen = "";
  let savedState = null;
  let synced = false;
  const context = vm.createContext({
    game: { stop: function() { stopped = true; } },
    hideLevelComplete: function() {},
    document: { getElementById: function(id) { return elements[id]; } },
    showScreen: function(id) { shownScreen = id; },
    setGameMessage: function() {},
    saveState: function(value) { savedState = value; },
    syncUI: function() { synced = true; },
    state: state
  });
  vm.runInContext(exitSource, context);

  context.exitToMainMenu();

  assert.equal(stopped, true);
  assert.equal(shownScreen, "screen-menu");
  assert.equal(savedState, state);
  assert.equal(synced, true);
  assert.deepEqual(classes, [["level-ready", "hidden"], ["boss-hud", "hidden"]]);

  const harness = createPresenceHarness();
  harness.context.setupOnlinePresence();
  harness.channel.statusHandler("SUBSCRIBED");
  await Promise.resolve();

  harness.channel.state = {
    "player-one": [{ online: true }, { online: true }],
    "player-two": [{ online: true }]
  };
  harness.handlers.sync();

  assert.equal(harness.channel.tracked.online, true);
  assert.equal(harness.countElement.textContent, "Jugadores online: 2");
  assert.equal(harness.storage.get("the_adventure_presence_id"), "local-player");

  const rows = [];
  const body = { innerHTML: "", appendChild: function(row) { rows.push(row); } };
  const leaderboardQuery = {
    select: function() { return this; },
    order: function() { return this; },
    limit: function() {
      return Promise.resolve({ data: [
        { username: "Capitan1", total_score: 100, max_level: 8 },
        { username: "Capitan2", total_score: 90, max_level: 7 },
        { username: "Capitan3", total_score: 80, max_level: 6 },
        { username: "Capitan4", total_score: 70, max_level: 5 }
      ], error: null });
    }
  };
  const leaderboardContext = vm.createContext({
    document: {
      getElementById: function(id) { return id === "leaderboard-body" ? body : { textContent: "" }; },
      createElement: function(tagName) {
        return {
          tagName: tagName,
          textContent: "",
          className: "",
          attributes: {},
          children: [],
          setAttribute: function(name, value) { this.attributes[name] = value; },
          appendChild: function(child) { this.children.push(child); }
        };
      }
    },
    supabaseClient: { from: function() { return leaderboardQuery; } },
    flushOnlineScores: function() { return Promise.resolve(); }
  });
  vm.runInContext(leaderboardSource, leaderboardContext);
  leaderboardContext.loadLeaderboard();
  await new Promise(function(resolve) { setTimeout(resolve, 0); });

  assert.deepEqual(rows.slice(0, 3).map(function(row) { return row.children[0].children[0].className; }), [
    "leaderboard-medal leaderboard-medal-gold",
    "leaderboard-medal leaderboard-medal-silver",
    "leaderboard-medal leaderboard-medal-bronze"
  ]);
  assert.deepEqual(rows.slice(0, 3).map(function(row) { return String(row.children[0].children[0].textContent); }), ["1", "2", "3"]);
  assert.match(html, /\.leaderboard-medal \{[\s\S]*?width: 3\.4rem;[\s\S]*?data:image\/svg\+xml/);
  assert.match(html, /\.leaderboard-table th:nth-child\(3\),[\s\S]*?\.leaderboard-table td:nth-child\(4\) \{ text-align: center; \}/);
  assert.deepEqual(rows.slice(0, 3).map(function(row) { return row.children[0].children[0].attributes["aria-label"]; }), [
    "Medalla de oro, puesto 1", "Medalla de plata, puesto 2", "Medalla de bronce, puesto 3"
  ]);
  assert.equal(rows[0].className, "leaderboard-first-place");
  assert.equal(rows[1].className, "");
  assert.equal(String(rows[3].children[0].textContent), "4");
});