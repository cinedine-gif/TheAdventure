const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const collisionSource = html.slice(
  html.indexOf("    Game.prototype.resolveCircleOverlap = function("),
  html.indexOf("    Game.prototype.updateEnemySpawns = function()")
);
const enemySource = html.slice(
  html.indexOf("    Game.prototype.updateEnemies = function(dt)"),
  html.indexOf("    Game.prototype.updateChests = function()")
);
const bossSource = html.slice(
  html.indexOf("    Game.prototype.updateBoss = function(dt)"),
  html.indexOf("    Game.prototype.updateBossTank = function(dt, now)")
);

function createGame() {
  const context = vm.createContext({
    Game: function() {},
    GAMEPLAY: { enemyDamageCooldownMs: 1000 },
    Math: Math,
    Date: Date,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(collisionSource + enemySource + bossSource, context);
  const game = new context.Game();
  game.player = { x: 50, y: 50, radius: 10, speed: 100, health: 25, maxHealth: 25 };
  game.canvas = { width: 500, height: 300 };
  game.keys = new Set();
  game.touchMoveX = 0;
  game.touchMoveY = 0;
  game.trees = [];
  game.enemies = [];
  game.bossMode = false;
  game.boss = null;
  game.bossConfig = null;
  game.enemyBullets = [];
  game.onHealthChange = function() {};
  game.onDamage = function() {};
  game.addParticles = function() {};
  game.updateTentacles = function() {};
  return game;
}

test("player stops at an enemy instead of passing through", function() {
  const game = createGame();
  const enemy = { x: 100, y: 50, radius: 10 };
  game.enemies.push(enemy);
  game.keys.add("KeyD");

  game.updatePlayer(0.5);

  assert.ok(Math.hypot(game.player.x - enemy.x, game.player.y - enemy.y) >= 20 - 1e-9);
});

test("an approaching enemy stays outside the player's body", function() {
  const game = createGame();
  const enemy = { x: 100, y: 50, radius: 10, speed: 100, damage: 1, lastDamageAt: Date.now() };
  game.enemies.push(enemy);

  game.updateEnemies(0.5);

  assert.ok(Math.hypot(game.player.x - enemy.x, game.player.y - enemy.y) >= 20 - 1e-9);
});

test("player stops at the final boss body", function() {
  const game = createGame();
  game.bossMode = true;
  game.boss = { x: 100, y: 50, radius: 30, alive: true };
  game.keys.add("KeyD");

  game.updatePlayer(0.5);

  assert.ok(Math.hypot(game.player.x - game.boss.x, game.player.y - game.boss.y) >= 40 - 1e-9);
});

test("a moving boss cannot overlap the player", function() {
  const game = createGame();
  game.bossMode = true;
  game.bossConfig = { type: "tank" };
  game.boss = { x: 200, y: 200, radius: 30, alive: true };
  game.player.x = 200;
  game.player.y = 200;
  game.updateBossTank = function() {
    this.boss.x = this.player.x;
    this.boss.y = this.player.y;
  };

  game.updateBoss(0.1);

  assert.ok(Math.hypot(game.player.x - game.boss.x, game.player.y - game.boss.y) >= 40 - 1e-9);
});

test("exactly overlapping circles are separated without invalid coordinates", function() {
  const game = createGame();
  const enemy = { x: 50, y: 50, radius: 10 };
  game.enemies.push(enemy);

  game.updatePlayer(0);

  assert.ok(Number.isFinite(game.player.x));
  assert.ok(Number.isFinite(game.player.y));
  assert.ok(Math.hypot(game.player.x - enemy.x, game.player.y - enemy.y) >= 20 - 1e-9);
});