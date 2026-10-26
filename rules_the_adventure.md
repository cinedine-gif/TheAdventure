# The Adventure — Plan de Implementación

## Archivo principal
`index.html` — fichero único autocontenido (HTML + CSS + JS inline, sin servidor).  
Abrir directamente en el navegador haciendo doble clic.

---

## Arquitectura técnica

- **Canvas HTML5**: mundo de 1280×720 px, vista top-down; escritorio muestra el mapa completo y móvil usa una cámara con zoom sin cambiar las coordenadas del juego
- **Vanilla JS ES5**: prototype-based OOP (`Game.prototype.method = function(){}`), sin arrow functions en métodos de prototipo, sin imports
- **Bucle de juego**: `requestAnimationFrame` + delta time (`dt`) para independencia de framerate
- **Persistencia**: `localStorage` con prefijo `lahistoria_*` para datos locales y operaciones pendientes; Supabase Auth y PostgreSQL para cuentas, puntuaciones y monedas por usuario
- **Un único `<script>`** sin `type="module"`
- **Controles**: teclado en escritorio y controles táctiles en móvil (joystick, disparo y bomba)

---

## Estado actual — Lo implementado ✅

### Juego base
- Movimiento jugador: W/A/S/D · Disparar: SPACE · Bomba: B
- En móvil: joystick táctil para moverse y botones para disparar y lanzar bombas
- En móvil la partida ocupa toda la ventana, con HUD compacto y controles superpuestos en las esquinas; funciona en vertical y horizontal
- Cámara móvil que sigue al jugador, con enemigos de al menos 30 px de diámetro e indicadores de dirección para cofres, enemigos y jefes fuera de pantalla
- Al iniciar una partida móvil se solicita pantalla completa y orientación horizontal cuando el navegador lo permite; el botón de pantalla completa permite alternarla y salir al menú la cierra
- Canvas 1280×720, top-down, fondo con rejilla; escala para adaptarse a pantalla
- Colisión con árboles (obstáculos)
- Partículas y textos de daño flotantes
- Overlay "Inicia la aventura" antes de cada nivel (pausa el juego)
- Flash rojo breve al recibir daño

### Vista móvil y zoom
- La vista móvil se activa con un ancho de ventana de hasta 900 px o en dispositivos sin hover
- El escenario y sus colisiones siguen midiendo 1280×720; solo cambia la cámara, no las posiciones, velocidades, recompensas ni reglas del juego
- `Game.prototype.getMobileCamera()` sigue al jugador y adapta el área visible a la orientación y tamaño de la ventana, con escala uniforme para no deformar personajes
- La escala móvil se ajusta entre 1.1 y 1.45 píxeles de pantalla por unidad del mundo; un enemigo estándar de 28 unidades de diámetro se ve aproximadamente a 31–41 px
- En un móvil de 390×844, un enemigo estándar pasa de unos 9 px en la vista anterior a unos 32 px con zoom
- La cámara deja espacio para el HUD y los controles cuando el jugador se aproxima a los bordes; en combates de jefe reserva espacio adicional para su barra de vida
- `drawOffscreenIndicators()` señala el cofre activo más cercano, el enemigo más cercano y el jefe cuando quedan fuera de la cámara; separa los indicadores que coinciden en una dirección
- El canvas ocupa toda la ventana disponible, sin los márgenes del menú; el joystick queda abajo a la izquierda y disparo/bomba abajo a la derecha, respetando las zonas seguras del dispositivo
- Al pulsar iniciar se solicita pantalla completa y después orientación horizontal, únicamente cuando el navegador lo admite; si se rechazan, la partida sigue siendo jugable en vertical o dentro de la ventana
- El botón de pantalla completa permite alternar ese modo; salir al menú cierra la pantalla completa y libera la orientación solicitada
- Escritorio conserva el mapa completo sin zoom; girar o redimensionar la pantalla recalcula la vista móvil sin reiniciar la partida

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
- Pruebas de cámara móvil, indicadores y compatibilidad de pantalla completa: `node --test scripts/mobile.test.cjs`

### Usuarios, monedas y sincronización
- **Sin sesión:** las monedas pertenecen al navegador y se guardan en `lahistoria_coins`; no se recuperan al cambiar de dispositivo
- **Con sesión:** cada usuario tiene un saldo propio en `player_wallets`; al conectarse se consulta el saldo de su cuenta y se sincronizan sus operaciones pendientes
- **Primer traslado:** las monedas locales previas se asignan una sola vez a la primera cuenta conectada en ese navegador. El traslado tiene un identificador persistente para que una recarga o un reenvío no vuelva a sumarlo
- **Cambio de cuenta:** se muestra el monedero de la nueva cuenta, sin copiarle las monedas ni las operaciones pendientes de la anterior. Si había una partida activa, se detiene y se vuelve al menú
- **Cerrar sesión:** vuelve al saldo local de invitado; el saldo online se conserva en Supabase. Las monedas ya trasladadas no reaparecen como monedas de invitado
- **Recompensas:** `earnCoins()` registra cada ingreso con un identificador único y lo envía al servidor; con la cuenta ya conectada se puede seguir acumulando aunque falle temporalmente la conexión
- **Sin conexión:** las operaciones se conservan en `lahistoria_wallet_<userId>` y se reintentan al reconectar, volver a la ventana, abrir la tienda o restaurar la sesión. Hasta confirmarlas, dependen de la copia local y pueden perderse si se borran los datos del sitio
- **Compras:** `purchaseWithCoins()` reserva el importe localmente y solicita confirmación a `apply_coin_transaction`; solo después entrega la skin, las vidas o las bombas. Mientras una compra está pendiente no se inicia otra
- **Respuesta perdida:** la misma compra se reenvía con el mismo identificador; `coin_transactions` evita cobrarla dos veces y los recibos locales evitan entregar dos veces sus artículos
- **Varios dispositivos:** el servidor actualiza cada saldo de forma atómica y rechaza gastos si ya no hay suficientes monedas, aunque otro dispositivo mostrase un saldo antiguo. El saldo se refresca al recuperar el foco, abrir la tienda o iniciar sesión; no es una actualización en tiempo real
- **Privacidad:** las políticas RLS permiten a cada usuario leer solo su monedero y sus transacciones; los cambios de saldo se realizan mediante la función SQL autenticada
- **Límite actual:** se sincronizan las monedas, los puntos de clasificación y el nivel máximo online. Las skins, vidas, bombas, salud, avance jugable y cobro del reto diario siguen siendo locales y no se trasladan automáticamente entre dispositivos
- **Reiniciar progreso local:** borra el avance y los artículos locales, además de las monedas de invitado; no borra el monedero de la cuenta ni los puntos o el nivel máximo de la clasificación, y no devuelve el coste de las compras borradas

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
- [ ] Mini-mapa general (los indicadores de dirección móviles ya están implementados)
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
