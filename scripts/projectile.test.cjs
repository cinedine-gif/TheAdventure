const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const ghostOpacitySource = html.slice(html.indexOf("    function getGhostOpacity("), html.indexOf("    function Game(canvas, options)"));
const bulletsSource = html.slice(html.indexOf("    Game.prototype.updateBullets = function(dt)"), html.indexOf("    Game.prototype.updateEnemies = function(dt)"));
const dynamitePlacementSource = html.slice(html.indexOf("    Game.prototype.tryPlaceDynamite = function()"), html.indexOf("    Game.prototype.loop = function(now)"));
const dynamiteUpdateSource = html.slice(html.indexOf("    Game.prototype.updateDynamites = function(now)"), html.indexOf("    Game.prototype.updateChests = function()"));
const enemyBulletsSource = html.slice(html.indexOf("    Game.prototype.updateEnemyBullets = function(dt)"), html.indexOf("    Game.prototype.drawBoss = function()"));

function createGame(bullet, trees, enemies) {
  const context = vm.createContext({
    Game: function() {},
    GAMEPLAY: { bulletDamage: 5, bombBossDamage: 20 },
    Math: Math,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(ghostOpacitySource + bulletsSource, context);
  const game = new context.Game();
  game.bullets = [bullet];
  game.trees = trees;
  game.enemies = enemies;
  game.bossMode = false;
  game.canvas = { width: 500, height: 300 };
  game.particles = [];
  game.addParticles = function(x, y, color) { this.particles.push({ x: x, y: y, color: color }); };
  game.onCoinsEarned = function() {};
  game.enemiesKilledThisLevel = 0;
  game.onKillsChange = function() {};
  game.checkLevelComplete = function() {};
  return game;
}

test("a fast bullet is stopped by a tree between frames", function() {
  const enemy = { x: 90, y: 50, radius: 10, health: 10 };
  const game = createGame(
    { x: 0, y: 50, dir: 0, speed: 1000, radius: 4, type: "bullet" },
    [{ x: 50, y: 50, radius: 22 }],
    [enemy]
  );

  game.updateBullets(0.1);

  assert.equal(game.bullets.length, 0);
  assert.equal(enemy.health, 10);
  assert.equal(game.particles.length, 1);
});

test("a bullet still hits an enemy when no tree blocks its path", function() {
  const enemy = { x: 50, y: 50, radius: 10, health: 10 };
  const game = createGame(
    { x: 0, y: 50, dir: 0, speed: 500, radius: 4, type: "bullet" },
    [],
    [enemy]
  );

  game.updateBullets(0.1);

  assert.equal(game.bullets.length, 0);
  assert.equal(enemy.health, 5);
});

test("placing dynamite consumes one charge and arms it after a short fuse", function() {
  let now = 5000;
  let inventory = 2;
  const context = vm.createContext({
    Game: function() {},
    GAMEPLAY: { dynamiteCooldownMs: 350, dynamiteRadius: 12, dynamiteFuseMs: 800 },
    Math: Math,
    Date: { now: function() { return now; } }
  });
  vm.runInContext(dynamitePlacementSource, context);
  const game = new context.Game();
  game.running = true;
  game.paused = false;
  game.player = { x: 100, y: 120 };
  game.dynamites = [];
  game.isCirclePositionFree = function() { return true; };
  game.getDynamites = function() { return inventory; };
  game.onDynamitesChanged = function(count) { inventory = count; };

  assert.equal(game.tryPlaceDynamite(), true);
  assert.equal(inventory, 1);
  assert.equal(game.dynamites[0].x, 100);
  assert.equal(game.dynamites[0].y, 120);
  assert.equal(game.dynamites[0].armedAt, 5800);

  now += 100;
  assert.equal(game.tryPlaceDynamite(), false);
  assert.equal(game.dynamites.length, 1);
  assert.equal(inventory, 1);
});

test("an armed dynamite charge removes ten player health and is consumed", function() {
  const context = vm.createContext({
    Game: function() {},
    GAMEPLAY: { dynamiteDamage: 10 },
    Math: Math
  });
  vm.runInContext(dynamiteUpdateSource, context);
  const game = new context.Game();
  game.running = true;
  game.dynamites = [{ x: 100, y: 100, radius: 12, armedAt: 1000 }];
  game.player = { x: 100, y: 100, radius: 14, health: 25, maxHealth: 25 };
  game.enemies = [];
  game.bossMode = false;
  game.addParticles = function() {};
  game.addDamageText = function() {};
  game.onHealthChange = function() {};
  game.onDamage = function() {};
  game.onGameOver = function() {};
  game.stop = function() { this.running = false; };

  game.updateDynamites(999);
  assert.equal(game.player.health, 25);
  assert.equal(game.dynamites.length, 1);
  game.updateDynamites(1000);

  assert.equal(game.player.health, 15);
  assert.equal(game.dynamites.length, 0);
});

test("an armed dynamite charge removes ten enemy health", function() {
  const context = vm.createContext({ Game: function() {}, GAMEPLAY: { dynamiteDamage: 10 }, Math: Math });
  vm.runInContext(dynamiteUpdateSource, context);
  const game = new context.Game();
  game.running = true;
  game.dynamites = [{ x: 100, y: 100, radius: 12, armedAt: 1000 }];
  game.player = { x: 300, y: 300, radius: 14, health: 25, maxHealth: 25 };
  game.enemies = [{ x: 100, y: 100, radius: 10, health: 20 }];
  game.bossMode = false;
  game.addParticles = function() {};
  game.addDamageText = function() {};

  game.updateDynamites(1000);

  assert.equal(game.enemies[0].health, 10);
  assert.equal(game.dynamites.length, 0);
});

test("an armed dynamite charge removes ten boss health", function() {
  const context = vm.createContext({ Game: function() {}, GAMEPLAY: { dynamiteDamage: 10 }, Math: Math });
  vm.runInContext(dynamiteUpdateSource, context);
  const game = new context.Game();
  game.running = true;
  game.dynamites = [{ x: 100, y: 100, radius: 12, armedAt: 1000 }];
  game.player = { x: 300, y: 300, radius: 14, health: 25, maxHealth: 25 };
  game.enemies = [];
  game.bossMode = true;
  game.boss = { x: 100, y: 100, radius: 30, health: 100, maxHealth: 100, alive: true };
  game.onBossHealthChange = function() {};
  game.addParticles = function() {};
  game.addDamageText = function() {};

  game.updateDynamites(1000);

  assert.equal(game.boss.health, 90);
  assert.equal(game.dynamites.length, 0);
});

test("ghosts fade out, stay hidden, and fade back in", function() {
  const context = vm.createContext({ Math: Math });
  vm.runInContext(ghostOpacitySource, context);
  const ghost = { spawnedAt: 1000, ghostVisibilityOffset: 0 };

  assert.equal(context.getGhostOpacity(ghost, 1000), 1);
  assert.ok(context.getGhostOpacity(ghost, 2850) > 0);
  assert.equal(context.getGhostOpacity(ghost, 3200), 0);
  assert.ok(context.getGhostOpacity(ghost, 4350) > 0);
});

test("the final ghost stays invisible longer than regular ghosts", function() {
  const context = vm.createContext({ Math: Math });
  vm.runInContext(ghostOpacitySource, context);
  const ghost = { spawnedAt: 1000, ghostVisibilityOffset: 0 };

  assert.ok(context.getGhostOpacity(ghost, 4250, false) > 0);
  assert.equal(context.getGhostOpacity(ghost, 4250, true), 0);
});

test("a shot passes through a ghost while it is invisible", function() {
  const ghost = { x: 50, y: 50, radius: 10, health: 10, isGhost: true, spawnedAt: Date.now() - 2500 };
  const game = createGame(
    { x: 0, y: 50, dir: 0, speed: 500, radius: 4, type: "bullet" },
    [],
    [ghost]
  );

  game.updateBullets(0.1);

  assert.equal(game.bullets.length, 1);
  assert.equal(ghost.health, 10);
});

test("a shot damages a ghost while it is visible", function() {
  const ghost = { x: 50, y: 50, radius: 10, health: 10, isGhost: true, spawnedAt: Date.now() };
  const game = createGame(
    { x: 0, y: 50, dir: 0, speed: 500, radius: 4, type: "bullet" },
    [],
    [ghost]
  );

  game.updateBullets(0.1);

  assert.equal(game.bullets.length, 0);
  assert.equal(ghost.health, 5);
});

test("shots pass through the final ghost while it is invisible", function() {
  const game = createGame(
    { x: 0, y: 50, dir: 0, speed: 500, radius: 4, type: "bullet" },
    [],
    []
  );
  game.bossMode = true;
  game.bossConfig = { type: "ghost" };
  game.boss = { x: 50, y: 50, radius: 20, health: 100, maxHealth: 100, alive: true, spawnedAt: Date.now() - 3000 };

  game.updateBullets(0.1);

  assert.equal(game.bullets.length, 1);
  assert.equal(game.boss.health, 100);
});

test("shots damage the final ghost while it is visible", function() {
  const game = createGame(
    { x: 0, y: 50, dir: 0, speed: 500, radius: 4, type: "bullet" },
    [],
    []
  );
  game.bossMode = true;
  game.bossConfig = { type: "ghost" };
  game.boss = { x: 50, y: 50, radius: 20, health: 100, maxHealth: 100, alive: true, spawnedAt: Date.now() };
  game.onBossHealthChange = function() {};

  game.updateBullets(0.1);

  assert.equal(game.bullets.length, 0);
  assert.equal(game.boss.health, 95);
});

test("a fast boss shot is stopped by a tree before hitting the player", function() {
  const context = vm.createContext({
    Game: function() {},
    Math: Math,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(enemyBulletsSource, context);
  const game = new context.Game();
  game.enemyBullets = [{ x: 0, y: 50, dir: 0, speed: 1000, radius: 4, damage: 1 }];
  game.trees = [{ x: 50, y: 50, radius: 22 }];
  game.player = { x: 90, y: 50, radius: 10, health: 25, maxHealth: 25 };
  game.canvas = { width: 500, height: 300 };
  game.bossConfig = { miniBulletDamage: 1 };
  game.onHealthChange = function() {};
  game.onDamage = function() {};
  game.addParticles = function() {};
  game.stop = function() {};
  game.onGameOver = function() {};

  game.updateEnemyBullets(0.1);

  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.player.health, 25);
});

test("a boss shot still damages the player when no tree blocks it", function() {
  const context = vm.createContext({
    Game: function() {},
    Math: Math,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(enemyBulletsSource, context);
  const game = new context.Game();
  game.enemyBullets = [{ x: 0, y: 50, dir: 0, speed: 500, radius: 4, damage: 1 }];
  game.trees = [];
  game.player = { x: 50, y: 50, radius: 10, health: 25, maxHealth: 25 };
  game.canvas = { width: 500, height: 300 };
  game.bossConfig = { miniBulletDamage: 1 };
  game.onHealthChange = function() {};
  game.onDamage = function() {};
  game.addParticles = function() {};
  game.stop = function() {};
  game.onGameOver = function() {};

  game.updateEnemyBullets(0.1);

  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.player.health, 24);
});