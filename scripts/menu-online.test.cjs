const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const presenceSource = html.slice(html.indexOf("    var onlinePresenceChannel = null;"), html.indexOf("    function setupOnlineFeatures()"));
const exitSource = html.slice(html.indexOf("    function exitToMainMenu()"), html.indexOf('    document.getElementById("btn-back-menu").addEventListener'));

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
  assert.match(html, /id="btn-level-menu"[^>]*>Menú principal<\/button>/);
  assert.match(html, /getElementById\("btn-level-menu"\)\.addEventListener\("click", exitToMainMenu\)/);

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
});