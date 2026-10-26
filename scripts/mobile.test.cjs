const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const cameraSource = html.slice(html.indexOf("    Game.prototype.getMobileCamera = function()"), html.indexOf("    Game.prototype.drawBackground = function()"));
const fullscreenSource = html.slice(html.indexOf("    function enterMobileFullscreen()"), html.indexOf('    window.addEventListener("resize", syncGameViewport)'));

function createGame(width, height, mobile = true) {
  const context = vm.createContext({
    Game: function() {},
    window: { matchMedia: function() { return { matches: mobile }; } },
    Math: Math,
    Infinity: Infinity,
    clamp: function(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  });
  vm.runInContext(cameraSource, context);
  const game = new context.Game();
  const calls = [];
  game.ctx = new Proxy({}, {
    get: function(target, name) {
      return function(...values) {
        for (const value of values) {
          if (typeof value === "number") assert.ok(Number.isFinite(value), name + " has invalid coordinates");
        }
        calls.push({ name: name, values: values });
      };
    },
    set: function(target, name, value) { target[name] = value; return true; }
  });
  game.canvas = {
    width: 1280, height: 720,
    getBoundingClientRect: function() { return { width: width, height: height }; }
  };
  game.player = { x: 640, y: 360 };
  game.chests = [{ x: 0, y: 0, active: true }];
  game.enemies = [{ x: 1280, y: 720 }];
  for (const name of ["drawBackground", "drawTrees", "drawChests", "drawEnemies", "drawBullets", "drawPlayer", "drawParticles", "drawDamageTexts", "drawTentacles", "drawBoss", "drawEnemyBullets"]) {
    game[name] = function() {};
  }
  return { game: game, calls: calls };
}

for (const [width, height] of [[390, 844], [844, 390], [320, 568], [568, 320]]) {
  test("mobile camera preserves scale and corner visibility at " + width + "x" + height, function() {
    const { game } = createGame(width, height);
    for (const bossMode of [false, true]) {
      game.bossMode = bossMode;
      for (const [playerX, playerY] of [[14, 14], [1266, 706], [640, 360]]) {
        game.player = { x: playerX, y: playerY };
        const camera = game.getMobileCamera();
        assert.ok(Math.abs(width / camera.width - height / camera.height) < 1e-10);
        assert.ok(28 * camera.scale >= 29);
        assert.ok(camera.scale < 1.1);
        const screenX = (playerX - camera.x) * camera.scale;
        const screenY = (playerY - camera.y) * camera.scale;
        assert.ok(screenX > 20 && screenX < width - 20);
        assert.ok(screenY > (bossMode ? 120 : 70) && screenY < height - 110);
      }
    }
    assert.equal(game.canvas.width, 1280);
    assert.equal(game.canvas.height, 720);
  });
}

test("desktop camera stays disabled", function() {
  const { game } = createGame(1280, 720, false);
  assert.equal(game.getMobileCamera(), null);
});

test("render restores its transform and draws offscreen objectives", function() {
  const { game, calls } = createGame(390, 844);
  game.render(0);
  assert.equal(calls.filter(function(call) { return call.name === "save"; }).length,
    calls.filter(function(call) { return call.name === "restore"; }).length);
  assert.ok(calls.some(function(call) { return call.name === "fillText" && call.values[0] === "Cofre"; }));
  assert.ok(calls.some(function(call) { return call.name === "fillText" && call.values[0] === "Enemigo"; }));
});

test("collinear boss indicators remain separate on a short screen", function() {
  const { game, calls } = createGame(568, 320);
  game.bossMode = true;
  game.chests = [];
  game.enemies = [{ x: 1280, y: 360 }];
  game.boss = { x: 1280, y: 360, alive: true };
  game.drawOffscreenIndicators(game.getMobileCamera());
  const markers = calls.filter(function(call) { return call.name === "translate"; });
  assert.equal(markers.length, 2);
  assert.ok(Math.hypot(markers[0].values[0] - markers[1].values[0], markers[0].values[1] - markers[1].values[1]) >= 48);
});

function createFullscreenContext(request) {
  const gameScreen = { requestFullscreen: request };
  const context = vm.createContext({
    window: { matchMedia: function() { return { matches: true }; } },
    document: { getElementById: function() { return gameScreen; }, fullscreenElement: null },
    screen: { orientation: { lock: async function() {} } }
  });
  vm.runInContext(fullscreenSource, context);
  return { context: context, gameScreen: gameScreen };
}

test("fullscreen denial does not interrupt play", async function() {
  const { context } = createFullscreenContext(async function() { throw new Error("Not supported"); });
  await assert.doesNotReject(context.enterMobileFullscreen());
});

test("landscape is requested only while the game is still fullscreen", async function() {
  const { context, gameScreen } = createFullscreenContext(async function() {});
  let rotations = 0;
  context.screen.orientation.lock = async function(orientation) {
    assert.equal(orientation, "landscape");
    rotations += 1;
  };
  await context.enterMobileFullscreen();
  assert.equal(rotations, 0);
  gameScreen.requestFullscreen = async function() { context.document.fullscreenElement = gameScreen; };
  await context.enterMobileFullscreen();
  assert.equal(rotations, 1);
});