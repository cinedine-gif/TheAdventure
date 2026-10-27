const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const sql = fs.readFileSync(path.join(__dirname, "..", "supabase_setup.sql"), "utf8");
const ghostUpdateSource = html.slice(
  html.indexOf("    Game.prototype.updateBossGhost = function(dt, now)"),
  html.indexOf("    Game.prototype.updateBossTank = function(dt, now)")
);
const enemyBulletSource = html.slice(
  html.indexOf("    Game.prototype.updateEnemyBullets = function(dt)"),
  html.indexOf("    Game.prototype.drawBoss = function()")
);

function createGhostBoss() {
  const context = vm.createContext({
    Game: function() {},
    Math: Math,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(ghostUpdateSource, context);
  const game = new context.Game();
  game.boss = { x: 400, y: 360, radius: 56, speed: 30, lastSpawnAt: 1000, lastShotAt: 1000 };
  game.bossConfig = { spawnIntervalMs: 5000, shotCooldownMs: 4000, ghostShotDamage: 1, ghostShotSpeed: 230 };
  game.canvas = { width: 1280, height: 720 };
  game.player = { x: 700, y: 360 };
  game.enemies = [];
  game.enemyBullets = [];
  game.spawnEnemy = function() { this.enemies.push({ isGhost: true, damage: 1 }); };
  return { context: context, game: game };
}

test("the forest ghost spawns minions every five seconds and fires every four", function() {
  const setup = createGhostBoss();
  const game = setup.game;

  game.updateBossGhost(0, 4999);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.enemyBullets.length, 0);

  game.updateBossGhost(0, 5000);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.enemyBullets.length, 1);
  assert.equal(game.enemyBullets[0].damage, 1);

  game.updateBossGhost(0, 6000);
  assert.equal(game.enemies.length, 1);
  assert.equal(game.enemies[0].damage, 1);

  game.updateBossGhost(0, 9000);
  assert.equal(game.enemyBullets.length, 2);
  assert.equal(game.enemies.length, 1);

  game.updateBossGhost(0, 11000);
  assert.equal(game.enemies.length, 2);
});

test("ghost projectiles remove one health point and online scores accept island four", function() {
  assert.ok(enemyBulletSource.length > 0);
  const context = vm.createContext({
    Game: function() {},
    Math: Math,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(enemyBulletSource, context);
  const game = new context.Game();
  game.enemyBullets = [{ x: 100, y: 100, dir: 0, speed: 0, radius: 7, damage: 1 }];
  game.trees = [];
  game.canvas = { width: 1280, height: 720 };
  game.player = { x: 100, y: 100, radius: 14, health: 25, maxHealth: 25 };
  game.bossConfig = { miniBulletDamage: 1 };
  game.onHealthChange = function() {};
  game.addParticles = function() {};
  game.stop = function() {};
  game.onGameOver = function() {};
  game.updateEnemyBullets(0);

  assert.equal(game.player.health, 24);
  assert.match(sql, /island_id integer not null check \(island_id between 0 and 5\)/);
  assert.match(sql, /add constraint level_scores_island_id_check check \(island_id between 0 and 5\)/);
  assert.match(sql, /p_island_id not between 0 and 5/);
  assert.match(html, /\{ id: 4, name: "Cementerio de la Niebla", levels: 10, world: "terror", enemyDamage: 1/);
  assert.match(html, /\{ id: 5, name: "Faro de los Condenados", levels: 10, world: "terror", enemyDamage: 1/);
  assert.match(html, /type: "ghost",[\s\S]*?spawnIntervalMs: 5000,[\s\S]*?shotCooldownMs: 4000,[\s\S]*?ghostShotDamage: 1/);
});