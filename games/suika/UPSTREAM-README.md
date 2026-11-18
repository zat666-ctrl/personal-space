# Suika Merge — Watermelon Game (HTML5)

A polished, juicy take on the **Suika / Watermelon Merge** genre — built in pure HTML5 + Canvas + Matter.js. No build step, no bundler, deploys straight to GitHub Pages.

> Drop fruits into the box. Two fruits of the same kind merge into the next, bigger one. Don't let them overflow the top. Get to the watermelon. 🍒 → 🍓 → 🍇 → 🍊 → 🍋 → 🍎 → 🍐 → 🍑 → 🍍 → 🍈 → 🍉

## ▶ Play it

Open `index.html` in any modern browser. No install, no server required (but ES modules need an HTTP origin — see "Run locally" below).

## ✨ Features

**Core gameplay**
- 11-tier fruit chain with smooth Matter.js physics
- Drop preview + next-fruit preview
- Danger line with grace timer (game over only if a fruit overflows for too long)
- Combo system — chain merges within a window for bonus score

**Game juice**
- Particle burst & confetti on merge (object pooled)
- Screen shake that scales with the merged fruit's level
- Pop / squash animation on every new fruit
- Number popups for every score gain
- Watermelon "ultimate" celebration
- Pitch ladder: every merge plays a note one step higher (do–re–mi feel)

**Systems**
- 3 difficulty modes — Easy / Normal / Hard — saved per-player
- Boosters: 🔨 Hammer (remove any fruit) · 💣 Bomb (radius blast) · ❄️ Freeze (pause the danger timer)
- Revive on game over (mock-rewarded ad)
- Coin economy + Daily Reward chain (7-day loop, mega reward on day 7)
- High score per mode (localStorage)
- Settings: Music / SFX / Vibration toggles

**Tech**
- Vanilla ES modules — no build step
- Matter.js (physics) loaded from CDN
- Canvas 2D rendering (custom — no PixiJS)
- WebAudio API for synthesized SFX (no audio files in repo!)
- `AdManager` abstraction with placeholders — swap with AdSense for Games / GameDistribution / CrazyGames SDK later
- Responsive portrait-first, works on desktop too

## 📁 Project layout

```
.
├── index.html              # entry, includes Matter.js CDN
├── style.css               # all UI styling (overlays, HUD, dialogs)
└── src/
    ├── main.js             # bootstrap, canvas resize, RAF loop
    ├── config/
    │   ├── fruits.js       # 11-tier fruit chain (color, radius, score, emoji)
    │   └── constants.js    # play area, container, difficulty, daily rewards
    ├── managers/
    │   ├── SceneManager.js
    │   ├── AudioManager.js # WebAudio synthesized SFX + ambient pad
    │   ├── AdManager.js    # mock interstitial/rewarded — drop-in for real SDK
    │   ├── SaveManager.js  # localStorage wrapper
    │   └── EconomyManager.js
    ├── scenes/
    │   ├── MenuScene.js
    │   ├── GameScene.js    # the main gameplay loop + rendering
    │   ├── GameOverScene.js
    │   └── DailyScene.js
    ├── entities/
    │   ├── Fruit.js
    │   └── FruitFactory.js
    ├── systems/
    │   ├── PhysicsSystem.js
    │   ├── MergeSystem.js
    │   └── ScoreSystem.js
    └── effects/
        ├── Particles.js    # object-pooled bursts, confetti, sparkles
        ├── Popups.js       # floating "+10" / "COMBO" text
        └── ScreenShake.js
```

## 🚀 Run locally

ES modules can't be loaded over `file://`, so serve the folder with any static server:

```bash
# Python
python3 -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>.

## 🌐 Deploy to GitHub Pages

This repo is set up to deploy directly from `main` / root. No build step.

1. Push to GitHub on `main`
2. **Settings → Pages → Source: `main` / `(root)`**
3. The site goes live at `https://<your-user>.github.io/<repo-name>/`

## 🎮 Controls

| Action | Input |
|---|---|
| Aim drop position | Move mouse / drag finger horizontally over the play area |
| Drop fruit | Click / tap |
| Use booster | Tap the booster, then tap a fruit (Hammer/Bomb) or anywhere (Freeze) |
| Pause | Top-right pause button |

## 🧩 Tuning

Most gameplay knobs live in [`src/config/constants.js`](src/config/constants.js):
- `DIFFICULTY` — container scale, danger hold time, starting boosters, coin reward multiplier
- `DROP.cooldownMs` — gap between consecutive drops
- `SCORING.comboWindowMs` — how long after a merge another merge still counts as combo
- `DAILY_REWARDS` — 7-day reward schedule

Fruit chain (color / radius / score / emoji) is in [`src/config/fruits.js`](src/config/fruits.js).

## 🧱 Replacing the ad mock with a real SDK

`src/managers/AdManager.js` exposes `showInterstitial()` / `showRewarded()` returning a `Promise<boolean>`. Swap the body with calls to your SDK (GameDistribution, CrazyGames, AdSense for Games, etc.) — the rest of the game just awaits the promise.

## 📜 License

MIT — do whatever, just don't blame me if your watermelon escapes the box.
