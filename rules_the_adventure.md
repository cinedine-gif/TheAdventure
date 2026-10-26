# The Adventure — Plan de Implementación

## Archivo principal
`index.html` — fichero único autocontenido (HTML + CSS + JS inline, sin servidor).  
Abrir directamente en el navegador haciendo doble clic.

---

## Arquitectura técnica

- **Canvas HTML5**: 1280×720 px, vista top-down; se adapta al ancho disponible
- **Vanilla JS ES5**: prototype-based OOP (`Game.prototype.method = function(){}`), sin arrow functions en métodos de prototipo, sin imports
- **Bucle de juego**: `requestAnimationFrame` + delta time (`dt`) para independencia de framerate
- **Persistencia**: `localStorage` con prefijo `lahistoria_*`
- **Un único `<script>`** sin `type="module"`
- **Controles**: teclado en escritorio y controles táctiles en móvil (joystick, disparo y bomba)

---

## Estado actual — Lo implementado ✅

### Juego base
- Movimiento jugador: W/A/S/D · Disparar: SPACE · Bomba: B
- En móvil: joystick táctil para moverse y botones para disparar y lanzar bombas
- Canvas 1280×720, top-down, fondo con rejilla; escala para adaptarse a pantalla
- Colisión con árboles (obstáculos)
- Partículas y textos de daño flotantes
- Overlay "Inicia la aventura" antes de cada nivel (pausa el juego)
- Flash rojo breve al recibir daño

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
- Sin cuenta: monedas guardadas en localStorage; con sesión iniciada: saldo privado por usuario en Supabase y copia local de las operaciones pendientes
- El saldo local previo se traslada una sola vez a la primera cuenta que se conecte en ese navegador; no se vuelve a copiar a otras cuentas
- Las recompensas se pueden acumular sin conexión y se reenvían al reconectar, volver a la ventana, abrir la tienda o iniciar sesión
- Las compras online entregan skins, vidas o bombas solo cuando Supabase confirma el gasto; los reenvíos no duplican cargos ni artículos
- Skins, consumibles y progreso siguen siendo locales; esta sincronización solo comparte las monedas entre dispositivos
- **Reto diario**: eliminar 50 enemigos en un mismo nivel para ganar 100 monedas extra; se puede cobrar una vez al día
- El premio del reto diario aparece en el resumen al completar el nivel

### Cuentas online y clasificación 🔧
- Integración frontend preparada con Supabase Auth: registro con correo/contraseña, alias público, inicio y cierre de sesión
- Clasificación pública con puntos acumulados por jugador y su nivel máximo alcanzado (1-30: isla 2/nivel 1 = 11)
- Cada intento con sesión iniciada suma 10 puntos por enemigo y 25 por cofre, también al repetir niveles, perder una vida, salir al menú o combatir jefes; sin bajas ni cofres no se generan puntos
- Los puntos se guardan localmente durante el intento y se envían al detenerlo; los pendientes se recuperan tras recargar y se reintentan al iniciar sesión, recuperar conexión o abrir la clasificación
- Cada intento tiene un identificador único para que los reenvíos no dupliquen puntos; el récord de cada nivel se conserva por separado
- Monedero por cuenta en `player_wallets`, con transacciones atómicas en `coin_transactions`; no se permite gastar más saldo del disponible, aunque se usen varios dispositivos
- Esquema y políticas de acceso en `supabase_setup.sql`
- Para activar o actualizar el servicio: ejecutar todo `supabase_setup.sql` en Supabase (también si ya estaba instalado) y añadir `https://theadventure.neocities.org` a las URLs permitidas de Auth
- La actualización conserva los puntos ya registrados; no puede recuperar intentos antiguos descartados por la regla anterior de guardar solo el récord
- Pruebas locales del monedero, sin dependencias adicionales: `node --test scripts/wallet.test.cjs`

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

### Jefes de las tres islas ✅
- Cada jefe aparece al completar el nivel 10 de su isla y tiene barra de vida propia en el HUD
- **Isla 1 — Gran Tanque**: 500 HP; persigue al jugador y genera minitanques que disparan
- **Isla 2 — Barco Pirata**: 500 HP; patrulla horizontalmente, dispara cañonazos en arco y genera piratas menores
- **Isla 3 — Kraken Abisal**: 500 HP; se desplaza por el mapa, ataca con tentáculos y genera peces enemigos
- Los combates de jefe no tienen árboles ni cofres
- Al derrotar a un jefe se desbloquea la siguiente isla; derrotar al jefe final marca la última isla como completada

### Enemigos diferenciados por isla ✅
- **Isla 1**: enemigos estándar circulares
- **Isla 2**: enemigos más rápidos con movimiento en zigzag
- **Isla 3**: enemigos más resistentes con apariciones en grupos

### Mapa de progreso / Islas
- Pantalla con las 3 islas y dots de niveles
- Click en dot completado → rejugar ese nivel (modo replay)
- Click en isla completada (jefe derrotado) → rejugar desde nivel 1
- Click en isla con jefe pendiente → ir directamente al jefe
- Botón circular al final de los niveles de la isla → entrar o rejugar su jefe
- Bloqueo de islas no desbloqueadas

### HUD en juego
- Barra de vida (verde → naranja → roja según HP)
- 🪙 Monedas, ❤️ Vidas, 💣 Bombas, 💀 enemigos derrotados en el nivel e Isla/Nivel actual
- Barra de vida del jefe (separada, roja, solo visible en boss fight)

---

## Pendiente de implementar 🔲

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

### Puesta en marcha online
- [ ] Ejecutar `supabase_setup.sql` en el SQL Editor del proyecto Supabase
- [ ] Configurar la URL del sitio y la URL de redirección de Auth para Neocities
- [ ] Probar registro, confirmación de correo, inicio de sesión y publicación en la clasificación

### Pulido visual
- [ ] Transición de pantalla entre niveles (fade)
- [ ] Animación de apertura de cofre
- [ ] Pantalla de victoria final al terminar las 3 islas + jefes

---

## Constantes clave (CONFIG en index.html)

```javascript
PLAYER_START = { x:640, y:360, radius:14, speed:220, maxHealth:25 }

GAMEPLAY = {
  chestCount: 6, chestReward: 5,
  enemySpawnMs: 3000,          // se reduce -200ms por nivel, mín 800ms
  enemySpawnPerWave: 2, maxEnemies: 8,
  enemyHealth: 10, enemyDamage: 1,  // daño +1 por isla
  enemyKillReward: 1, levelCompleteBonus: 10,
  bulletDamage: 5, bulletSpeed: 480, fireCooldownMs: 180,
  startingLives: 3, livesCost: 100, livesPerPack: 3
}

DAILY_CHALLENGE = { killsTarget: 50, rewardCoins: 100 }

BOSS_CONFIGS[0] = { type:"tank", health:500, spawnIntervalMs:10000, spawnCount:3, ... }
BOSS_CONFIGS[1] = { type:"pirate", health:500, patrolSpeed:82, cannonCooldownMs:3300, ... }
BOSS_CONFIGS[2] = { type:"kraken", health:500, fishSpawnIntervalMs:6200, tentacleSpawnMs:1800, ... }
```

---

## Estado de `state.progress` (localStorage → "lahistoria_progress")

```javascript
{
  unlockedIslands: [0],        // array de IDs desbloqueadas
  islandLevels: { "0": 5 },   // nivel máximo completado por isla
  bossDefeated: [],            // IDs de islas cuyo jefe está derrotado
  lives: 3,                    // vidas globales restantes
  bombs: 0,                    // bombas disponibles
  playerHealth: 25,            // salud persistida entre recargas/niveles
  daily50BonusLastClaim: ""    // fecha del último cobro del reto diario (AAAA-MM-DD)
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
