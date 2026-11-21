const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const imageNames = [
  'title', 'stage1-background', 'stage1-foreground', 'player-frames',
  'projectile-standard', 'stage2-mode7-map', 'stage2-start-marker'
];
const images = Object.fromEntries(imageNames.map(name => {
  const image = new Image();
  image.src = `assets/${name}.png`;
  return [name, image];
}));
let playerFrameMeta = {};
let stage2Data = null;
let weaponTables = null;
fetch('assets/weapon-tables.json').then(r => r.json()).then(v => weaponTables = v);
fetch('assets/player-frames.json').then(r => r.json()).then(v => playerFrameMeta = v);
fetch('assets/stage2-mode7.json').then(r => r.json()).then(v => {
  stage2Data = v;
  // Local-only entry point for checking extracted Mode 7 rendering without a
  // four-thousand-frame Stage 1 clear. This route is disabled on the hosted page.
  if (location.hostname === '127.0.0.1' && new URLSearchParams(location.search).get('preview') === 'stage2-select') {
    mode = 'stage2-select';
    stage2Choice = stage2Data.selectedStart || 0;
  }
});

const mode7Canvas = document.createElement('canvas');
mode7Canvas.width = mode7Canvas.height = 1024;
const mode7Context = mode7Canvas.getContext('2d', { willReadFrequently: true });
let mode7Pixels = null;
function prepareMode7Pixels() {
  const image = images['stage2-mode7-map'];
  if (!mode7Pixels && image.complete && image.naturalWidth === 1024) {
    mode7Context.drawImage(image, 0, 0);
    mode7Pixels = mode7Context.getImageData(0, 0, 1024, 1024).data;
  }
}

const keys = new Set();
let previous = new Set();
onkeydown = event => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  if (key === 'f') document.fullscreenElement ? document.exitFullscreen() : canvas.requestFullscreen?.();
};
onkeyup = event => keys.delete(event.key.toLowerCase());

let mode = 'title';
let tick = 0;
let scroll = 0;
let frame = 0;
let stage = 1;
let player = { x: 56, y: 199, vx: 0, vy: 0, ground: true, face: 1, invuln: 0, aim: 0 };
let shots = [];
let enemies = [];
let score = 0;
let lives = 3;
let weapon = 0;
let fireCooldown = 0;
let wave = 0;
let menuChoice = 0;
let difficulty = 1;
let stereo = true;
let stage2Choice = 1;
let stage2World = { x: 0, y: 0 };
let stage2Shots = [];

function baseVelocity(face, aim, moving) {
  // Confirmed spawn offsets: up=0, up/right=16, right=32, left=96.
  const offset = aim < 0 ? (moving ? (face > 0 ? 16 : 112) : 0) : aim > 0 && moving && face > 0 ? 48 : face > 0 ? 32 : 96;
  const t = weaponTables?.velocityWords;
  if (!t) return [face * 7.4, 0];
  const i = offset / 2;
  const fixed = (integer, fraction) => (integer >= 32768 ? integer - 65536 : integer) + fraction / 65536;
  return [fixed(t['8D93'][i], t['8E33'][i]), fixed(t['8D73'][i], t['8E13'][i])];
}
function start() {
  mode = 'play';
  scroll = 0;
  score = 0;
  lives = 3;
  stage = 1;
  weapon = 0;
  wave = 0;
  player = { x: 56, y: 199, vx: 0, vy: 0, ground: true, face: 1, invuln: 0, aim: 0 };
  shots = [];
  enemies = [];
}
function startStage2() {
  const point = stage2Data?.startPoints?.[stage2Choice];
  stage2World = stage2Choice === 1 ? { x: 896, y: 160 } : point ? { x: point.world[0], y: point.world[1] } : { x: 896, y: 160 };
  stage = 2;
  mode = 'stage2';
  player = { x: 128, y: 160, vx: 0, vy: 0, ground: true, face: 1, invuln: 0, aim: 0 };
  stage2Shots = [];
  fireCooldown = 0;
  tick = 0;
}
function moveStage2Choice(dx, dy) {
  const points = stage2Data?.startPoints || [];
  const current = points[stage2Choice]?.screen;
  if (!current) return;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < points.length; i++) {
    if (i === stage2Choice) continue;
    const x = points[i].screen[0] - current[0];
    const y = points[i].screen[1] - current[1];
    const primary = dx ? x * dx : y * dy;
    if (primary <= 0) continue;
    const secondary = dx ? Math.abs(y) : Math.abs(x);
    const distance = Math.hypot(x, y);
    const candidateScore = secondary * 4 + distance;
    if (candidateScore < bestScore) { bestScore = candidateScore; best = i; }
  }
  if (best >= 0) stage2Choice = best;
}
function mode7Clip(value) {
  value &= 0xffff;
  return value & 0x2000 ? value | ~0x3ff : value & 0x3ff;
}
function renderMode7(config, camera = null) {
  prepareMode7Pixels();
  if (!mode7Pixels) return;
  const image = ctx.createImageData(256, 224);
  const output = image.data;
  for (let i = 0; i < output.length; i += 4) output[i + 3] = 255;
  let A = config.mode7A, B = config.mode7B, C = config.mode7C, D = config.mode7D;
  let X = config.mode7X, Y = config.mode7Y, H = config.mode7Hoff, V = config.mode7Voff;
  let offset = config.screenYOffset || 0;
  if (camera) {
    A = camera.A; B = camera.B; C = camera.C; D = camera.D;
    X = camera.x - (A * 128 + B * 160) / 256;
    Y = camera.y - (C * 128 + D * 160) / 256;
    H = X; V = Y; offset = 0;
  }
  const clippedH = mode7Clip(H - X), clippedV = mode7Clip(V - Y);
  for (let y = 0; y < 224; y++) {
    const scanY = config.mode7FlipY ? 255 - (y - offset) : y - offset;
    const startX = ((A * clippedH) & ~63) + ((B * scanY) & ~63) + ((B * clippedV) & ~63) + (X << 8);
    const startY = ((C * clippedH) & ~63) + ((D * scanY) & ~63) + ((D * clippedV) & ~63) + (Y << 8);
    for (let x = 0; x < 256; x++) {
      const sampleX = config.mode7FlipX ? 255 - x : x;
      const mapX = (startX + A * sampleX) >> 8;
      const mapY = (startY + C * sampleX) >> 8;
      if (mapX < 0 || mapX >= 1024 || mapY < 0 || mapY >= 1024) continue;
      const source = (mapY * 1024 + mapX) * 4;
      const dest = (y * 256 + x) * 4;
      output[dest] = mode7Pixels[source];
      output[dest + 1] = mode7Pixels[source + 1];
      output[dest + 2] = mode7Pixels[source + 2];
    }
  }
  ctx.putImageData(image, 0, 0);
}
function drawPlayerAt(x, y) {
  if (!images['player-frames'].complete) return;
  const id = playerFrameMeta[String(frame)] ? frame : 0;
  ctx.drawImage(images['player-frames'], (id % 16) * 128, Math.floor(id / 16) * 128, 128, 128, x - 64, y - 64, 128, 128);
}
function update() {
  tick++;
  const pressed = key => keys.has(key) && !previous.has(key);

  if (mode === 'title') {
    if (pressed('arrowup')) menuChoice = (menuChoice + 3) % 4;
    if (pressed('arrowdown')) menuChoice = (menuChoice + 1) % 4;
    if (pressed('arrowleft') && menuChoice === 3) difficulty = (difficulty + 2) % 3;
    if (pressed('arrowright') && menuChoice === 3) difficulty = (difficulty + 1) % 3;
    if (pressed('enter') || pressed('z') || pressed('b')) {
      if (menuChoice === 3) difficulty = (difficulty + 1) % 3;
      else start();
    }
    previous = new Set(keys);
    return;
  }
  if (pressed('escape')) {
    mode = mode === 'pause' ? 'play' : 'pause';
    previous = new Set(keys);
    return;
  }
  if (mode === 'pause') {
    if (pressed('enter')) mode = 'play';
    previous = new Set(keys);
    return;
  }
  if (mode === 'stage-clear') {
    if (pressed('enter')) {
      if (stage === 1 && stage2Data) { mode = 'stage2-select'; stage2Choice = stage2Data.selectedStart || 0; }
      else if (stage >= 6) mode = 'ending';
      else { stage++; mode = 'play'; scroll = 0; enemies = []; }
    }
    previous = new Set(keys);
    return;
  }
  if (mode === 'stage2-select') {
    if (pressed('arrowleft')) moveStage2Choice(-1, 0);
    if (pressed('arrowright')) moveStage2Choice(1, 0);
    if (pressed('arrowup')) moveStage2Choice(0, -1);
    if (pressed('arrowdown')) moveStage2Choice(0, 1);
    if (pressed('enter') || pressed('z') || pressed('b')) startStage2();
    previous = new Set(keys);
    return;
  }
  if (mode === 'ending') { previous = new Set(keys); return; }

  const dx = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
  const dy = (keys.has('arrowdown') ? 1 : 0) - (keys.has('arrowup') ? 1 : 0);
  if (mode === 'stage2') {
    const speed = 2; // Natural right/up runs move 24 world pixels per 12 frames.
    stage2World.x = Math.max(8, Math.min(1016, stage2World.x + dx * speed));
    stage2World.y = Math.max(8, Math.min(1016, stage2World.y + dy * speed));
    if (dx) player.face = dx;
    player.aim = dy;
    const aimX = dx || player.face;
    const aimY = dy;
    if (fireCooldown > 0) fireCooldown--;
    if ((keys.has('z') || keys.has('b')) && fireCooldown === 0) {
      stage2Shots.push({ x: stage2World.x + aimX * 9, y: stage2World.y + aimY * 9, dx: aimX * 7.5, dy: aimY * 7.5 });
      fireCooldown = 3;
    }
    for (const shot of stage2Shots) { shot.x += shot.dx; shot.y += shot.dy; }
    stage2Shots = stage2Shots.filter(s => s.x >= 0 && s.x <= 1024 && s.y >= 0 && s.y <= 1024);
    const pose = dx ? [2, 4, 6, 4][(tick >> 3) % 4] : 0;
    frame = pose + (player.face < 0 ? 1 : 0);
    previous = new Set(keys);
    return;
  }

  player.face = dx || player.face;
  player.vx = dx * 1.5;
  player.x = Math.max(12, Math.min(244, player.x + player.vx));
  player.aim = dy;
  if (player.ground && keys.has('x')) { player.vy = -6; player.ground = false; }
  player.vy += 0.1875;
  player.y += player.vy;
  if (player.y >= 199) { player.y = 199; player.vy = 0; player.ground = true; }
  if (dx > 0) scroll = Math.min(2600, scroll + 0.65);

  if (fireCooldown > 0) fireCooldown--;
  if ((keys.has('z') || keys.has('b')) && fireCooldown === 0) {
    const angle = player.aim < 0 ? -0.42 : player.aim > 0 ? 0.42 : 0;
    // Verified SNES Y shot: OAM tile $00C, muzzle +/-27,-30, 7.5 px/frame, 3-frame cadence.
    const velocity = weapon === 0 ? baseVelocity(player.face, player.aim, dx !== 0) : [player.face * 4.5, angle * 4.5];
    shots.push({ x: player.x + player.face * 27, y: player.y - 30, dx: velocity[0], dy: velocity[1], life: 0 });
    if (weapon === 1) for (const spread of [-0.3, 0.3]) shots.push({ x: player.x + player.face * 9, y: player.y - 9, dx: player.face * 4.5, dy: spread * 4.5, life: 0 });
    fireCooldown = weapon === 0 ? (weaponTables?.cadenceFrames[0] ?? 3) : weapon === 2 ? 4 : 9;
  }
  for (const shot of shots) { shot.x += shot.dx; shot.y += shot.dy; shot.life++; }
  shots = shots.filter(shot => shot.x > -5 && shot.x < 261 && shot.y > -5 && shot.y < 230);

  if (tick % 100 === 0 && scroll < 2550) {
    wave++;
    const kind = wave % 3;
    enemies.push({ kind, x: 258, y: kind === 1 ? 132 : 184, hp: kind === 2 ? 5 : 2, phase: tick, shot: tick + 65 });
  }
  for (const enemy of enemies) {
    enemy.x -= enemy.kind === 0 ? 0.55 : enemy.kind === 1 ? 0.32 : 0.18;
    if (enemy.kind === 1) enemy.y = 132 + Math.sin((tick - enemy.phase) / 13) * 24;
    if (enemy.kind === 2) {
      enemy.y = 184 + Math.sin((tick - enemy.phase) / 18) * 8;
      if (tick >= enemy.shot) { enemy.shot = tick + 90; enemy.bullet = { x: enemy.x - 8, y: enemy.y - 5 }; }
    }
    if (enemy.bullet) {
      enemy.bullet.x -= 1.25;
      if (Math.abs(enemy.bullet.x - player.x) < 7 && Math.abs(enemy.bullet.y - player.y) < 9 && player.invuln === 0) {
        lives--; player.invuln = 100; enemy.bullet = null;
      }
    }
    if (Math.abs(enemy.x - player.x) < 11 && Math.abs(enemy.y - player.y) < 14 && player.invuln === 0) {
      lives--; player.invuln = 100; if (lives <= 0) mode = 'title';
    }
  }
  for (const shot of shots) for (const enemy of enemies) {
    if (Math.abs(shot.x - enemy.x) < 9 && Math.abs(shot.y - enemy.y) < 12 && enemy.hp > 0) {
      enemy.hp -= weapon === 2 ? 2 : 1; shot.x = 300;
      if (enemy.hp <= 0) score += enemy.kind === 2 ? 500 : enemy.kind === 1 ? 200 : 100;
    }
  }
  enemies = enemies.filter(enemy => enemy.hp > 0 && enemy.x > -20);
  if (player.invuln) player.invuln--;
  if (scroll >= 2599) { mode = 'stage-clear'; tick = 0; }
  const pose = player.ground ? (dx ? [2, 4, 6, 4][(tick >> 3) % 4] : 0) : (player.vy < 0 ? 8 : 10);
  frame = pose + (player.face < 0 ? 1 : 0);
  if (dy > 0) frame = 14 + (player.face < 0 ? 1 : 0);
  if (keys.has('shift')) weapon = (weapon + 1) % 4;
  previous = new Set(keys);
}

function drawTitle() {
  if (images.title.complete) ctx.drawImage(images.title, 0, 0, 256, 224);
  ctx.fillStyle = '#fff'; ctx.font = '8px monospace';
  ctx.fillText('SUPER PROBOTECTOR', 70, 28);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i === menuChoice ? '#fff' : '#9da5bd';
    ctx.fillText(['1 PLAYER', '2 PLAYERS A', '2 PLAYERS B', `OPTIONS  ${['EASY', 'NORMAL', 'HARD'][difficulty]}`][i], 87, 148 + i * 12);
  }
}
function drawShots() {
  if (images['projectile-standard'].complete) {
    for (const shot of shots) {
      if (weapon === 0) ctx.drawImage(images['projectile-standard'], shot.x - 4, shot.y - 4, 8, 8);
      else { ctx.fillStyle = '#ffdc58'; ctx.fillRect(shot.x, shot.y, 5, 2); }
    }
  }
}
function drawStage1() {
  ctx.fillStyle = '#060812'; ctx.fillRect(0, 0, 256, 224);
  if (images['stage1-background'].complete) {
    const width = images['stage1-background'].width, x = scroll % (width - 256);
    ctx.drawImage(images['stage1-background'], x, 0, 256, 224, 0, 0, 256, 224);
    if (x > 0) ctx.drawImage(images['stage1-background'], 0, 0, 256 - x, 224, 256 - x, 0, 256 - x, 224);
  }
  if (images['stage1-foreground'].complete) {
    const width = images['stage1-foreground'].width, x = scroll % (width - 256);
    ctx.drawImage(images['stage1-foreground'], x, 0, 256, 224, 0, 0, 256, 224);
    if (x > 0) ctx.drawImage(images['stage1-foreground'], 0, 0, 256 - x, 224, 256 - x, 0, 256 - x, 224);
  }
  drawPlayerAt(player.x, player.y);
  drawShots();
  ctx.fillStyle = '#d45c45';
  for (const enemy of enemies) {
    ctx.fillStyle = enemy.kind === 2 ? '#d33' : enemy.kind === 1 ? '#b4d' : '#d45c45';
    ctx.fillRect(enemy.x - 5, enemy.y - 8, 10, 14);
    if (enemy.bullet) { ctx.fillStyle = '#f55'; ctx.fillRect(enemy.bullet.x, enemy.bullet.y, 4, 3); }
  }
  ctx.fillStyle = '#dce4ff'; ctx.font = '8px monospace';
  ctx.fillText(`1P SCORE ${String(score).padStart(6, '0')} REST ${lives} STAGE ${stage} W${weapon + 1}`, 7, 10);
}
function drawStage2Select() {
  if (stage2Data) renderMode7(stage2Data);
  else { ctx.fillStyle = '#030611'; ctx.fillRect(0, 0, 256, 224); }
  const points = stage2Data?.startPoints || [];
  ctx.fillStyle = '#ffc866'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText('CHOOSE YOUR STARTING POINT', 128, 22); ctx.textAlign = 'left';
  if (images['stage2-start-marker'].complete) {
    for (const point of points) ctx.drawImage(images['stage2-start-marker'], point.screen[0] - 4, point.screen[1] - 4, 8, 8);
  }
  const point = points[stage2Choice];
  if (point) {
    const x = point.screen[0] - 18, y = point.screen[1] - 12, w = 48, h = 40, k = 6;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    for (const sx of [x, x + w - k]) for (const sy of [y, y + h - k]) {
      ctx.beginPath(); ctx.moveTo(sx, sy + (sy === y ? k : 0)); ctx.lineTo(sx, sy); ctx.lineTo(sx + (sx === x ? k : -k), sy); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.fillText('1P', x + w - 3, y + 12);
  }
}
function drawStage2() {
  if (!stage2Data) return;
  renderMode7(stage2Data, { A: 256, B: 0, C: 0, D: 256, x: stage2World.x, y: stage2World.y });
  for (const shot of stage2Shots) {
    const x = 128 + shot.x - stage2World.x, y = 160 + shot.y - stage2World.y;
    if (images['projectile-standard'].complete) ctx.drawImage(images['projectile-standard'], x - 4, y - 4, 8, 8);
  }
  drawPlayerAt(128, 160);
  ctx.fillStyle = '#dce4ff'; ctx.font = '8px monospace';
  ctx.fillText(`1P SCORE ${String(score).padStart(6, '0')} REST ${lives} STAGE 2`, 7, 10);
}
function draw() {
  if (mode === 'title') { drawTitle(); return; }
  if (mode === 'pause') {
    ctx.fillStyle = '#060812'; ctx.fillRect(0, 0, 256, 224); ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('PAUSED', 103, 105); ctx.font = '8px monospace'; ctx.fillText('ENTER RESUME  ESC CONTINUE', 67, 121); return;
  }
  if (mode === 'stage-clear') {
    ctx.fillStyle = '#060812'; ctx.fillRect(0, 0, 256, 224); ctx.fillStyle = 'white'; ctx.font = '12px monospace'; ctx.fillText('STAGE CLEAR', 80, 104); ctx.font = '8px monospace'; ctx.fillText('PRESS ENTER', 94, 120); return;
  }
  if (mode === 'stage2-select') { drawStage2Select(); return; }
  if (mode === 'stage2') { drawStage2(); return; }
  if (mode === 'ending') { ctx.fillStyle = '#060812'; ctx.fillRect(0, 0, 256, 224); ctx.fillStyle = 'white'; ctx.font = '12px monospace'; ctx.fillText('MISSION COMPLETE', 65, 110); return; }
  drawStage1();
}
function loop() { update(); draw(); requestAnimationFrame(loop); }
window.advanceTime = ms => { for (let n = Math.round(ms / 16.667); n-- > 0;) update(); draw(); };
window.render_game_to_text = () => JSON.stringify({
  mode, stage, player: { x: player.x, y: player.y, velocity: [player.vx, player.vy], grounded: player.ground, frame, frameData: playerFrameMeta[String(frame)]?.metasprite || null },
  scroll, shots: mode === 'stage2' ? stage2Shots.length : shots.length,
  projectiles: mode === 'stage2' ? stage2Shots.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), velocity: [s.dx, s.dy] })) : shots.map(s => ({ x: Math.round(s.x), y: Math.round(s.y), velocity: [s.dx, s.dy] })),
  enemies: enemies.map(e => ({ kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp })), score, lives, weapon, stage2Choice,
  stage2World: mode === 'stage2' ? { x: Math.round(stage2World.x), y: Math.round(stage2World.y) } : null,
  coordinateSystem: 'origin top-left, x right, y down'
});
loop();
