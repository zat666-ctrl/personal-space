import Matter from 'matter-js';
import { initFullscreen } from './fullscreen.js';

// These dependencies ship in the same content-addressed file as the game.
globalThis.Matter = Matter;
initFullscreen(document.getElementById('game-shell'), document.getElementById('game-fullscreen'));
import('./main.js').catch(() => window.showSuikaLoadError?.());
