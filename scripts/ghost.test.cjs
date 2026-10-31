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
const enemyProfilesSource = html.slice(
  html.indexOf("    const ENEMY_COLORS ="),
  html.indexOf("    const BOSS_ISLAND_1 =")
);
const getEnemyProfileSource = html.slice(
  html.indexOf("    Game.prototype.getEnemyProfile = function()"),
  html.indexOf("    Game.prototype.handleKeyDown = function(e)")
);
const circlePositionSource = html.slice(
  html.indexOf("    Game.prototype.isCirclePositionFree = function(x, y, radius, list, extraGap)"),
  html.indexOf("    Game.prototype.spawnChest = function()")
);
const spawnTreesSource = html.slice(
  html.indexOf("    Game.prototype.spawnTrees = function()"),
  html.indexOf("    Game.prototype.spawnEnemy = function()")
);
const spawnEnemySource = html.slice(
  html.indexOf("    Game.prototype.spawnEnemy = function()"),
  html.indexOf("    Game.prototype.findEnemySpawnPosition = function(radius)")
);
const cemeteryEmergenceSource = html.slice(
  html.indexOf("    const CEMETERY_EMERGENCE_MS ="),
  html.indexOf("    function Game(canvas, options)")
);
const updateEnemiesSource = html.slice(
  html.indexOf("    Game.prototype.updateEnemies = function(dt)"),
  html.indexOf("    Game.prototype.updateChests = function()")
);
const cemeteryBossConfigSource = html.slice(
  html.indexOf("    const BOSS_ISLAND_5 ="),
  html.indexOf("    const BOSS_ISLAND_6 =")
);
const lighthouseBossConfigSource = html.slice(
  html.indexOf("    const BOSS_ISLAND_6 ="),
  html.indexOf("    const BOSS_CONFIGS =")
);
const drawBossSource = html.slice(
  html.indexOf("    Game.prototype.drawBoss = function()"),
  html.indexOf("    Game.prototype.drawBossTank = function()")
);
const zombieBossSource = html.slice(
  html.indexOf("    Game.prototype.updateBossZombie = function(dt, now)"),
  html.indexOf("    Game.prototype.updateBossGhost = function(dt, now)")
);
const bloodTrailMethodsSource = html.slice(
  html.indexOf("    Game.prototype.addBloodStain = function(x, y, radius)"),
  html.indexOf("    Game.prototype.addDamageText = function(x, y, text)")
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

test("the cemetery uses zombies and tombstones while the forest keeps ghosts and trees", function() {
  const context = vm.createContext({
    Game: function() {},
    GAMEPLAY: { enemyHealth: 10, maxEnemies: 8 },
    Math: Math,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); },
    rand: function(minimum, maximum) { return minimum + (maximum - minimum) * 0.25; }
  });
  vm.runInContext(cemeteryEmergenceSource + enemyProfilesSource + getEnemyProfileSource + circlePositionSource + spawnTreesSource + spawnEnemySource, context);
  const game = new context.Game();
  game.canvas = { width: 1280, height: 720 };
  game.player = { x: 640, y: 360 };
  game.boss = null;
  game.chests = [];
  game.levelTreeCount = 1;
  game.trees = [];

  game.currentIsland = 4;
  const cemeteryProfile = game.getEnemyProfile();
  game.spawnTrees();
  assert.equal(cemeteryProfile.isCemeteryEnemy, true);
  assert.equal(cemeteryProfile.isZombie, undefined);
  assert.equal(cemeteryProfile.isGhost, undefined);
  assert.equal(game.trees[0].isTombstone, true);
  game.enemies = [];
  game.cemeterySpawnIndex = 0;
  game.levelEnemyDamage = 1;
  for (var spawn = 0; spawn < 4; spawn++) game.spawnEnemy();
  assert.deepEqual(game.enemies.map(function(enemy) { return [enemy.isZombie, enemy.isSkeleton]; }), [
    [true, false], [false, true], [true, false], [false, true]
  ]);
  game.enemies.forEach(function(enemy) {
    var distanceToTombstone = Math.hypot(enemy.x - game.trees[0].x, enemy.y - game.trees[0].y);
    assert.ok(distanceToTombstone < game.trees[0].radius + enemy.radius + 20);
    assert.equal(context.getCemeteryEmergenceProgress(enemy, enemy.emergesAt), 0);
  });
  assert.equal(game.enemies[0].speed, game.enemies[1].speed * 3 / 5);
  assert.equal(game.enemies[2].speed, game.enemies[3].speed * 3 / 5);

  game.currentIsland = 3;
  game.trees = [];
  const forestProfile = game.getEnemyProfile();
  game.spawnTrees();
  assert.equal(forestProfile.isGhost, true);
  assert.equal(forestProfile.isZombie, undefined);
  assert.equal(game.trees[0].isTombstone, false);

  game.currentIsland = 5;
  game.trees = [];
  game.levelTreeCount = 6;
  const lighthouseProfile = game.getEnemyProfile();
  game.spawnTrees();
  assert.equal(lighthouseProfile.isVampire, true);
  assert.ok(game.trees.some(function(tree) { return tree.isLighthouse; }));
  assert.ok(game.trees.some(function(tree) { return tree.isTombstone; }));
  game.enemies = [];
  game.spawnEnemy();
  assert.equal(game.enemies[0].isVampire, true);
  assert.equal(game.enemies[0].isCemeteryEmerging, true);
  assert.ok(game.trees.some(function(tree) {
    return tree.isTombstone && Math.hypot(game.enemies[0].x - tree.x, game.enemies[0].y - tree.y) < tree.radius + game.enemies[0].radius + 20;
  }));
});

test("cemetery enemies stay still while emerging from the ground", function() {
  var now = 10000;
  const context = vm.createContext({
    Game: function() {},
    GAMEPLAY: { enemyDamageCooldownMs: 1000 },
    Math: Math,
    Date: { now: function() { return now; } },
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(cemeteryEmergenceSource + updateEnemiesSource, context);
  const game = new context.Game();
  game.player = { x: 300, y: 100, radius: 14, health: 25, maxHealth: 25 };
  game.enemies = [{
    x: 100, y: 100, radius: 14, speed: 42, health: 18, damage: 1,
    lastDamageAt: 0, isCemeteryEnemy: true, isCemeteryEmerging: true, isZombie: true, emergesAt: 9800
  }];
  game.trees = [];
  game.bloodStains = [];
  game.addBloodStain = function(x, y, radius) { this.bloodStains.push({ x: x, y: y, radius: radius }); };
  game.resolveCircleOverlap = function() {};

  game.updateEnemies(1);

  assert.equal(game.enemies[0].x, 100);
  assert.equal(game.enemies[0].y, 100);
  assert.equal(context.getCemeteryEmergenceProgress(game.enemies[0], 10000), 200 / 850);

  now = 11000;
  game.updateEnemies(0.1);
  assert.ok(game.enemies[0].x > 100);
  assert.equal(game.bloodStains.length, 1);
});

test("blood stains fade out and are removed after their lifetime", function() {
  const context = vm.createContext({ Game: function() {}, Math: Math });
  vm.runInContext(bloodTrailMethodsSource, context);
  const game = new context.Game();
  game.bloodStains = [];

  game.addBloodStain(40, 60, 5);
  game.updateBloodStains(1);

  assert.equal(game.bloodStains.length, 1);
  assert.equal(game.bloodStains[0].life, 2.2);
  game.updateBloodStains(2.2);
  assert.equal(game.bloodStains.length, 0);
});

test("the cemetery final boss is a large zombie that summons minions and attacks up close", function() {
  const configContext = vm.createContext({});
  const config = vm.runInContext(cemeteryBossConfigSource + "BOSS_ISLAND_5;", configContext);
  assert.equal(config.type, "zombie");
  assert.ok(config.bodyRadius > 56);
  assert.equal(config.shotCooldownMs, 3200);

  const context = vm.createContext({ Game: function() {}, Math: Math });
  vm.runInContext(zombieBossSource + bloodTrailMethodsSource, context);
  const game = new context.Game();
  game.player = { x: 300, y: 100, radius: 14, health: 25, maxHealth: 25 };
  game.boss = { x: 100, y: 100, radius: config.bodyRadius, speed: config.bossSpeed, lastSpawnAt: 1000, lastMeleeAt: 6000, lastShotAt: 6000 };
  game.bossConfig = config;
  game.summons = 0;
  game.enemyBullets = [];
  game.bloodStains = [];
  game.spawnEnemy = function() { this.summons++; };
  game.onHealthChange = function() {};
  game.onDamage = function() {};
  game.addParticles = function() {};
  game.stop = function() {};
  game.onGameOver = function() {};

  game.updateBossZombie(0, 5999);
  assert.equal(game.summons, 0);
  game.updateBossZombie(0, 6000);
  assert.equal(game.summons, 1);

  game.boss.lastSpawnAt = 6000;
  game.player.x = 178;
  game.updateBossZombie(0, 7300);
  assert.equal(game.player.health, 23);
  assert.ok(game.bloodStains.length > 0);

  game.player.x = 300;
  game.updateBossZombie(0, 9199);
  assert.equal(game.enemyBullets.length, 0);
  game.updateBossZombie(0, 9200);
  assert.equal(game.enemyBullets.length, 3);
  assert.ok(game.enemyBullets.every(function(bullet) { return bullet.isBloodBolt && bullet.damage === config.bloodShotDamage; }));
  assert.ok(game.enemyBullets[0].dir < game.enemyBullets[1].dir);
  assert.equal(game.enemyBullets[1].dir, 0);
  assert.ok(game.enemyBullets[2].dir > game.enemyBullets[1].dir);
});

test("the lighthouse final boss is a large vampire drawn with the cape and fangs sprite", function() {
  const context = vm.createContext({});
  const config = vm.runInContext(cemeteryBossConfigSource + lighthouseBossConfigSource + "BOSS_ISLAND_6;", context);

  assert.equal(config.type, "vampire");
  assert.equal(config.hudName, "🧛 Conde del Faro");
  assert.ok(config.bodyRadius >= 60);
  assert.match(drawBossSource, /type === "vampire"\) this\.drawVampire\(this\.ctx, this\.boss\)/);
  assert.match(html, /Game\.prototype\.drawVampire = function\(ctx, vampire\)/);
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