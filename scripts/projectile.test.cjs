const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const bulletsSource = html.slice(html.indexOf("    Game.prototype.updateBullets = function(dt)"), html.indexOf("    Game.prototype.updateEnemies = function(dt)"));
const enemyBulletsSource = html.slice(html.indexOf("    Game.prototype.updateEnemyBullets = function(dt)"), html.indexOf("    Game.prototype.drawBoss = function()"));

function createGame(bullet, trees, enemies) {
  const context = vm.createContext({
    Game: function() {},
    GAMEPLAY: { bulletDamage: 5, bombBossDamage: 20 },
    Math: Math,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(bulletsSource, context);
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