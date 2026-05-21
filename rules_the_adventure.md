# The Adventure — Plan de Implementación

## Archivo principal
`index.html` — fichero único autocontenido (HTML + CSS + JS inline, sin servidor).  
Abrir directamente en el navegador haciendo doble clic.

---

## Arquitectura técnica

- **Canvas HTML5**: 960×540 px, vista top-down
- **Vanilla JS ES5**: prototype-based OOP (`Game.prototype.method = function(){}`), sin arrow functions en métodos de prototipo, sin imports
- **Bucle de juego**: `requestAnimationFrame` + delta time (`dt`) para independencia de framerate
- **Persistencia**: `localStorage` con prefijo `lahistoria_*`
- **Un único `<script>`** sin `type="module"`

---

## Estado actual — Lo implementado ✅

### Juego base
- Movimiento jugador: W/A/S/D · Disparar: SPACE
- Canvas 960×540, top-down, fondo con rejilla
- Colisión con árboles (obstáculos)
- Partículas y textos de daño flotantes
- Overlay "Inicia la aventura" antes de cada nivel (pausa el juego)

### Progresión
- **3 islas × 10 niveles** cada una
- Cada nivel: recoger 6 cofres → parar spawns → matar todos los enemigos → nivel completo
- Spawns de enemigos más rápidos conforme avanza el nivel (3000ms → 800ms mín.)
- Daño de enemigos sube por isla (+1 por isla)
- Árboles: 4 en nivel 1 → 22 en nivel 10 (4 + (nivel-1)×2)
- Popup al completar nivel: desglose de monedas (⚔️ enemigos / 📦 cofres / ⭐ bonus)

### Economía
- 🪙 Monedas: 1 por enemigo eliminado, 5 por cofre, 10 de bonus al completar nivel
- **Modo replay** (niveles ya completados): solo monedas de enemigos, NO de cofres ni bonus
- Persistencia de monedas en localStorage

### Tienda
- **Mi taquilla**: skins ya desbloqueadas (cambiar skin)
- **Tienda de skins**: comprar skins con monedas
- **Consumibles**: comprar 3 vidas por 100 🪙
- 6 skins: default(gratis), rojo(100), verde(600), amarillo(825), naranja(1125), blanco(1350)

### Vidas
- **3 vidas globales** para completar todo el juego
- La vida NO se recupera entre niveles — persiste de nivel en nivel
- Al morir: pierde 1 vida → salud vuelve al máximo → reintenta el nivel/jefe automáticamente
- Sin vidas: Game Over → menú
- Compra de vidas en la tienda (100 🪙 = +3 vidas)
- Vidas mostradas en HUD: `❤️ Vidas: N`

### Jefe — Isla 1 (Gran Tanque) ✅
- Aparece tras completar nivel 10
- **1000 HP**, fijo en el lado izquierdo de la pantalla
- Barra de vida visible en HUD superior (roja)
- Cada 10 segundos lanza 3 minitanques (hasta 12 en pantalla)
- **Minitanques**: 5 HP, se mueven hacia el jugador, disparan cada 1.8s, balas naranja
- Sin árboles ni cofres en la pantalla del jefe
- Al derrotar al jefe: desbloquea Isla 2, popup de isla completada

### Mapa de progreso / Islas
- Pantalla con las 3 islas y dots de niveles
- Click en dot completado → rejugar ese nivel (modo replay)
- Click en isla completada (jefe derrotado) → rejugar desde nivel 1
- Click en isla con jefe pendiente → ir directamente al jefe
- Bloqueo de islas no desbloqueadas

### HUD en juego
- Barra de vida (verde → naranja → roja según HP)
- 🪙 Monedas, ❤️ Vidas, Isla/Nivel actual, Skin activa
- Barra de vida del jefe (separada, roja, solo visible en boss fight)

---

## Pendiente de implementar 🔲

### Islas 2 y 3 — Jefes
Añadir entradas a `BOSS_CONFIGS[1]` e `BOSS_CONFIGS[2]`.

**Ideas para jefes:**
- **Isla 2**: Barco pirata (se mueve horizontalmente, cañones que disparan proyectiles en arco)
- **Isla 3**: Kraken (tentáculos que aparecen en puntos aleatorios del mapa)

### Isla 2 y 3 — Enemigos diferenciados
Actualmente todas las islas usan el mismo tipo de enemigo circular.  
Ideas:
- Isla 2: enemigos más rápidos, en zigzag
- Isla 3: enemigos con más HP, en grupos

### Mejoras de gameplay
- [ ] Arma secundaria o power-ups recogibles en el mapa
- [ ] Enemigos con comportamiento de huida cuando tienen poca vida
- [ ] Mini-mapa o indicador de dirección hacia cofres/enemigos
- [ ] Sonidos (Web Audio API, sin archivos externos)
- [ ] Animación de disparo del jugador (destello en cañón)
- [ ] Pantalla de pausa con botón explícito (actualmente solo al entrar nivel)

### Tienda — Mejoras
- [ ] Ítem "Curación": recuperar X HP por monedas
- [ ] Ítem "Escudo temporal": invulnerabilidad por N segundos
- [ ] Preview animado de skins en la taquilla

### Progresión avanzada
- [ ] Puntuación / highscore por isla
- [ ] Estrellas por nivel (1-3) según rendimiento (daño recibido, tiempo, cofres)
- [ ] Logros desbloqueables

### Pulido visual
- [ ] Transición de pantalla entre niveles (fade)
- [ ] Efecto de impacto al jugador más visible (flash rojo en canvas)
- [ ] Animación de apertura de cofre
- [ ] Pantalla de victoria final al terminar las 3 islas + jefes

---

## Constantes clave (CONFIG en index.html)

```javascript
PLAYER_START = { x:480, y:270, radius:14, speed:220, maxHealth:25 }

GAMEPLAY = {
  chestCount: 6, chestReward: 5,
  enemySpawnMs: 3000,          // se reduce -200ms por nivel, mín 800ms
  enemySpawnPerWave: 2, maxEnemies: 8,
  enemyHealth: 10, enemyDamage: 1,  // daño +1 por isla
  enemyKillReward: 1, levelCompleteBonus: 10,
  bulletDamage: 5, bulletSpeed: 480, fireCooldownMs: 180,
  startingLives: 3, livesCost: 100, livesPerPack: 3
}

BOSS_CONFIGS[0] = {
  bodyRadius:44, health:1000, spawnIntervalMs:10000, spawnCount:3,
  miniRadius:16, miniHealth:5, miniDamage:1, miniSpeed:55,
  miniShotCooldownMs:1800, miniBulletDamage:2, miniBulletSpeed:300
}
// BOSS_CONFIGS[1] y [2] → pendientes
```

---

## Estado de `state.progress` (localStorage → "lahistoria_progress")

```javascript
{
  unlockedIslands: [0],        // array de IDs desbloqueadas
  islandLevels: { "0": 5 },   // nivel máximo completado por isla
  bossDefeated: [],            // IDs de islas cuyo jefe está derrotado
  lives: 3                     // vidas globales restantes
}
```

---

## Convenciones de código

- Todos los métodos del juego en `Game.prototype.xxx = function() {}`
- Callbacks del juego: `onCoinsEarned(amount, source)` — `source` es `'chest'` o `'enemy'`
- `game.replayMode = true` cuando el nivel ya fue completado antes (no da monedas de cofres/bonus)
- `game.bossMode = true` durante el combate contra jefe
- Salud del jugador NO se reinicia entre niveles (solo se reinicia al perder una vida)
- `startGameLevel(islandIdx, levelNum)` — inicia nivel normal
- `startBossFight(islandIdx)` — inicia combate de jefe
- `syncUI()` — refresca todo el HUD + tienda + estado visual

---

## Flujo de nivel completo

```
startGameLevel(isla, nivel)
  → game.start() → reset() [preserva HP]
  → game.pause() → overlay "Inicia la aventura"
  → btn-start-level → game.resume()
  → jugador recoge 6 cofres → se paran spawns
  → jugador mata enemigos restantes
  → game.stop() → onLevelComplete(stats)
    → si último nivel + BOSS_CONFIGS existe → showLevelComplete → startBossFight
    → si último nivel sin jefe → showLevelComplete → pantalla islas
    → si no → showLevelComplete → startGameLevel(isla, nivel+1)

startBossFight(isla)
  → game.start() → reset() [preserva HP]
  → game.startBoss(config) [coloca jefe, limpia cofres/árboles]
  → game.pause() → overlay "⚠️ Jefe"
  → btn-start-level → game.resume()
  → jefe recibe daño de balas del jugador
  → jefe spawna minitanques cada 10s
  → minitanques disparan al jugador
  → jefe HP = 0 → game.stop() → onBossDefeated()
    → desbloquea siguiente isla → showLevelComplete(isla completa)
```
