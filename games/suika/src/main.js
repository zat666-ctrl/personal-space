import { SuikaGame, BOARD, STEP } from './game.js';
import { FRUITS, MAX_LEVEL } from './config/fruits.js';
import { ParticleSystem } from './effects/Particles.js';
import { ScoreStore } from './scores.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let storage;
try { storage = localStorage; } catch { /* The game also works with memory-only storage. */ }
let muted = false;
try { muted = storage?.getItem('personal-space-suika-muted') === 'true'; } catch {}
let audio, game, accumulator = 0, lastFrame = performance.now(), dirty = true;
let client = null;
const config = window.PERSONAL_SPACE_CONFIG || {};
if (config.url?.startsWith('https://') && config.publishableKey && !config.publishableKey.includes('__SUPABASE_') && window.supabase) {
    client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
}
const scores = new ScoreStore({ storage, client, onChange: ({ best, message }) => {
    $('best').textContent = best; $('sync-status').textContent = message;
}, onIdentity: () => {
    if (game) { game.reset(); particles.pool.forEach(p => p.alive = false); setPaused(true); $('game-message').textContent = '登录身份已切换，已开启新一局，纪录按账号分别保存。'; }
} });
const particles = new ParticleSystem();
const popups = [];

function wakeAudio() {
    if (muted) return;
    try {
        audio ||= new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') void audio.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
}
function tone(level = 1) {
    if (muted || !audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(220 * 2 ** (level / 12), t);
    gain.gain.setValueAtTime(0.045, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(t); oscillator.stop(t + 0.17);
}
function hud() {
    $('score').textContent = game.score;
    $('next').textContent = FRUITS[game.next].emoji;
    $('next').setAttribute('aria-label', '下一个水果：' + FRUITS[game.next].name);
    dirty = true;
}
game = new SuikaGame(event => {
    if (!game) return;
    if (event.type === 'merge') {
        scores.record(event.score);
        if (!reducedMotion) {
            particles.burst(event.x, event.y, [FRUITS[event.level].color, '#d5dbff'], event.level);
            particles.shockwave(event.x, event.y, FRUITS[event.level].glow, 40, 2);
            popups.push({ x: event.x, y: event.y, text: '+' + event.added, life: 0.8 });
            if (popups.length > 12) popups.shift();
        }
        tone(event.level);
        if (event.level === MAX_LEVEL) $('game-message').textContent = '🍉 合成大西瓜啦！继续挑战更高分。';
    } else if (event.type === 'over') {
        scores.record(event.score); void scores.sync(); updateOverlay();
    }
    hud();
});
hud();

function updateOverlay() {
    $('overlay').hidden = !game.paused && !game.over;
    $('overlay-icon').textContent = game.over ? '🍉' : '☕';
    $('overlay-title').textContent = game.over ? '这局，收获满满' : '休息一下';
    $('overlay-description').textContent = game.over ? `获得 ${game.score} 分，来试试下一局吧。` : '水果会在这里等你。';
    $('resume').textContent = game.over ? '再玩一局' : '继续游戏';
    $('pause').textContent = game.paused ? '▶ 继续' : '⏸ 暂停';
    $('pause').setAttribute('aria-pressed', String(game.paused));
    $('pause').disabled = game.over;
    dirty = true;
}
function setPaused(value) {
    if (game.over) return;
    game.paused = value; accumulator = 0; lastFrame = performance.now();
    if (value) void audio?.suspend().catch(() => {});
    else wakeAudio();
    updateOverlay();
}
function restart() {
    game.reset(); particles.pool.forEach(p => p.alive = false); popups.length = 0;
    accumulator = 0; lastFrame = performance.now();
    $('game-message').textContent = '移动瞄准，点击或松手投放。';
    hud(); updateOverlay(); canvas.focus({ preventScroll: true });
}
$('pause').addEventListener('click', () => setPaused(!game.paused));
$('resume').addEventListener('click', () => { if (game.over) restart(); else setPaused(false); canvas.focus({ preventScroll: true }); });
let wasPaused = false;
$('restart').addEventListener('click', () => {
    if (game.over || !game.fruits.size) { restart(); return; }
    wasPaused = game.paused; setPaused(true); $('restart-dialog').showModal();
});
$('restart-dialog').addEventListener('close', () => {
    if ($('restart-dialog').returnValue === 'restart') restart();
    else setPaused(wasPaused);
});
function muteLabel() { $('mute').textContent = muted ? '♫ 已静音' : '♪ 声音开'; $('mute').setAttribute('aria-pressed', String(muted)); }
$('mute').addEventListener('click', () => {
    muted = !muted;
    try { storage?.setItem('personal-space-suika-muted', String(muted)); } catch {}
    if (muted) void audio?.suspend().catch(() => {}); else wakeAudio();
    muteLabel();
});
muteLabel();

let pointerId = null;
function aim(event) {
    const rect = canvas.getBoundingClientRect();
    game.setAim((event.clientX - rect.left) / rect.width * BOARD.width); dirty = true;
}
canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || game.paused || game.over) return;
    pointerId = event.pointerId; canvas.setPointerCapture(pointerId);
    canvas.focus({ preventScroll: true }); aim(event); wakeAudio(); event.preventDefault();
});
canvas.addEventListener('pointermove', event => { if (event.isPrimary && (event.pointerType === 'mouse' || pointerId === event.pointerId)) aim(event); });
canvas.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId) return;
    aim(event); pointerId = null;
    if (!game.drop() && !game.paused && !game.over && !game.cooldown) $('game-message').textContent = '投放位置被挡住了，试试旁边。';
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener('pointercancel', () => pointerId = null);
canvas.addEventListener('lostpointercapture', () => pointerId = null);
canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', ' ', 'p', 'P'].includes(event.key)) return;
    event.preventDefault(); wakeAudio();
    if (event.key.toLowerCase() === 'p') { if (!event.repeat) setPaused(!game.paused); return; }
    if (game.paused || game.over) return;
    if (event.key === ' ') { if (!event.repeat) game.drop(); }
    else game.setAim(game.aim + (event.key === 'ArrowLeft' ? -14 : 14));
    dirty = true;
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pointerId = null; setPaused(true); }
    else scores.schedule(0);
});
window.addEventListener('online', () => scores.schedule(0));
window.addEventListener('offline', () => { if (scores.user) scores.emit('离线 · 已保留本地纪录，联网后自动同步'); });
window.addEventListener('storage', event => { if (event.key === scores.key) { scores.emit(); scores.schedule(0); } });
if (client) {
    client.auth.onAuthStateChange((_event, session) => { setTimeout(() => scores.setUser(session?.user), 0); });
    client.auth.getSession().then(({ data, error }) => {
        if (error) scores.emit('本地已保存 · 暂时无法读取登录状态');
        else scores.setUser(data.session?.user);
    }).catch(() => scores.emit('本地已保存 · 暂时无法读取登录状态'));
}

const sprites = new Map();
for (let level = 1; level <= MAX_LEVEL; level++) {
    const fruit = FRUITS[level], tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const c = tile.getContext('2d'), gradient = c.createRadialGradient(86, 70, 8, 128, 128, 124);
    gradient.addColorStop(0, fruit.glow); gradient.addColorStop(1, fruit.color);
    c.fillStyle = gradient; c.beginPath(); c.arc(128, 128, 120, 0, Math.PI * 2); c.fill();
    c.font = '148px "Segoe UI Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(fruit.emoji, 128, 132);
    sprites.set(level, tile);
    const image = new Image();
    image.onload = () => {
        c.clearRect(0, 0, 256, 256);
        c.save(); c.beginPath(); c.arc(128, 128, 125, 0, Math.PI * 2); c.clip();
        c.drawImage(image, 0, 0, 256, 256); c.restore(); dirty = true;
    };
    image.src = new URL('../' + fruit.sprite, import.meta.url).href;
    const span = document.createElement('span'); span.textContent = fruit.emoji; span.title = fruit.name;
    if (level > 1) { const arrow = document.createElement('i'); arrow.textContent = '›'; $('fruit-chain').append(arrow); }
    $('fruit-chain').append(span);
}
function resize() {
    const width = canvas.clientWidth, ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(width * BOARD.height / BOARD.width * ratio);
    dirty = true;
}
new ResizeObserver(resize).observe(canvas); resize();
function drawFruit(level, x, y, angle = 0, sx = 1, sy = 1, alpha = 1) {
    const radius = FRUITS[level].radius;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sx, sy);
    ctx.drawImage(sprites.get(level), -radius, -radius, radius * 2, radius * 2); ctx.restore();
}
function draw(alpha) {
    const light = document.body.classList.contains('theme-light');
    ctx.setTransform(canvas.width / BOARD.width, 0, 0, canvas.height / BOARD.height, 0, 0);
    ctx.fillStyle = light ? '#ebedf9' : '#191a30'; ctx.fillRect(0, 0, BOARD.width, BOARD.height);
    ctx.fillStyle = light ? '#ffffff88' : '#ffffff04';
    ctx.beginPath(); ctx.roundRect(BOARD.left, 106, BOARD.right - BOARD.left, BOARD.floor - 106, [0, 0, 16, 16]); ctx.fill();
    ctx.strokeStyle = light ? '#939bc477' : '#b5bee644'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(BOARD.left, 108); ctx.lineTo(BOARD.left, BOARD.floor - 14); ctx.quadraticCurveTo(BOARD.left, BOARD.floor, BOARD.left + 14, BOARD.floor); ctx.lineTo(BOARD.right - 14, BOARD.floor); ctx.quadraticCurveTo(BOARD.right, BOARD.floor, BOARD.right, BOARD.floor - 14); ctx.lineTo(BOARD.right, 108); ctx.stroke();
    ctx.save(); ctx.setLineDash([5, 7]); ctx.lineWidth = 1;
    ctx.strokeStyle = game.danger > 0 ? '#f18b93' : (light ? '#a0a5bf' : '#606680');
    ctx.beginPath(); ctx.moveTo(BOARD.left + 8, BOARD.danger); ctx.lineTo(BOARD.right - 8, BOARD.danger); ctx.stroke(); ctx.restore();
    if (game.danger > 0) {
        ctx.fillStyle = '#f18b93'; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('注意高度 · ' + Math.max(0, 2.5 * (1 - game.danger)).toFixed(1) + 's', 230, BOARD.danger - 12);
    }
    if (!game.over) {
        ctx.save(); ctx.setLineDash([4, 8]); ctx.strokeStyle = light ? '#667eea55' : '#bac4ff33'; ctx.lineWidth = 1;
        let end = BOARD.floor;
        for (const fruit of game.fruits) {
            const dx = Math.abs(fruit.body.position.x - game.aim);
            if (dx < fruit.config.radius) end = Math.min(end, fruit.body.position.y - Math.sqrt(fruit.config.radius ** 2 - dx ** 2));
        }
        ctx.beginPath(); ctx.moveTo(game.aim, BOARD.spawn + FRUITS[game.current].radius + 6); ctx.lineTo(game.aim, end); ctx.stroke(); ctx.restore();
        drawFruit(game.current, game.aim, BOARD.spawn, 0, 1, 1, game.cooldown > 0 ? 0.35 : 0.9);
    }
    for (const fruit of game.fruits) {
        const p = fruit.body.position, previous = fruit.previous || p;
        drawFruit(fruit.level, previous.x + (p.x - previous.x) * alpha, previous.y + (p.y - previous.y) * alpha, fruit.body.angle, reducedMotion ? 1 : fruit.scaleX, reducedMotion ? 1 : fruit.scaleY);
    }
    particles.draw(ctx);
    ctx.font = '600 19px system-ui'; ctx.textAlign = 'center';
    for (const popup of popups) { ctx.globalAlpha = Math.min(1, popup.life * 2); ctx.fillStyle = light ? '#5765bd' : '#e2e7ff'; ctx.fillText(popup.text, popup.x, popup.y); }
    ctx.globalAlpha = 1;
}
function frame(now) {
    const delta = Math.min(66, Math.max(0, now - lastFrame)); lastFrame = now;
    if (!game.paused && !game.over && !document.hidden) {
        accumulator = Math.min(accumulator + delta, STEP * 8);
        while (accumulator >= STEP) { game.step(); accumulator -= STEP; }
        particles.update(delta / 1000);
        for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.life -= delta / 1000; p.y -= delta * 0.04; if (p.life <= 0) popups.splice(i, 1); }
        dirty = true;
    }
    if (dirty) { draw(game.paused || game.over ? 1 : accumulator / STEP); dirty = false; }
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../../sw.js').catch(() => {});
