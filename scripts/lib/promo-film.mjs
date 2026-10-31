/* Films the real panel frame by frame for the promo video. Nothing is
 * recorded in real time: the film keeps its own clock (frame n is at
 * n / fps seconds), draws a synthetic cursor, click rings, caption cards and
 * the end card as an overlay on top of the panel, and captures one PNG per
 * frame; the panel's timers and CSS animations run on the same clock. Real clicks and typing go to the panel
 * between frames, so what the panel shows is exactly what it draws. A frame
 * where nothing moved reuses the last capture, so long holds cost nothing.
 * Dev tooling only; never shipped. */

/* Functions passed to page.evaluate run in the panel page. */
/* global window, document */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './demo-panel.mjs';
import { until } from './promo-panel.mjs';

/* Brand colours, as in scripts/marketing.mjs (sampled from the icon). */
const CHARCOAL = '#0e1621';
const AMBER = '#ffb020';
const FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

const CAPTION_FADE = 0.35;
const RING_LIFE = 0.45;

/* -------------------------------------------------------------- easing */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

/* ----------------------------------------------------------- overlay */

const OVERLAY_CSS = `
  * { caret-color: transparent !important; }
  #promo-layer, #promo-layer * { box-sizing: border-box; pointer-events: none; }
  #promo-layer { position: fixed; inset: 0; z-index: 2147483000; font-family: ${FONT}; }
  #promo-snap { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
  #promo-cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px; transform-origin: 3px 2px;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35)); }
  #promo-ring { position: absolute; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px;
    border-radius: 50%; border: 3px solid ${AMBER}; background: rgba(255, 176, 32, 0.18); opacity: 0; }
  .promo-caption { position: absolute; right: 32px; bottom: 52px; max-width: 600px; padding: 15px 22px 16px;
    border-radius: 12px; background: rgba(14, 22, 33, 0.94); color: #f2f5f9;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28), 0 3px 8px rgba(0, 0, 0, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.10); opacity: 0;
    font-size: 21px; line-height: 28px; font-weight: 500; letter-spacing: -0.005em; -webkit-font-smoothing: antialiased; }
  .promo-caption b { display: block; margin-bottom: 3px; color: ${AMBER}; font-size: 13px; line-height: 16px;
    font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .promo-caption::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px;
    border-radius: 0 2px 2px 0; background: ${AMBER}; }
  #promo-end { position: absolute; inset: 0; opacity: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; color: #f2f5f9; -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(900px 520px at 10% -10%, rgba(255, 176, 32, 0.16), transparent 62%),
      radial-gradient(760px 520px at 100% 110%, rgba(255, 176, 32, 0.10), transparent 62%),
      radial-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1.4px) 0 0 / 26px 26px,
      linear-gradient(160deg, #101a27, ${CHARCOAL} 55%, #0a1019); }
  #promo-end .end-inner { display: flex; flex-direction: column; align-items: center; }
  #promo-end img { width: 88px; height: 88px; margin-bottom: 26px; filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.5)); }
  #promo-end h1 { margin: 0; font-size: 50px; line-height: 58px; font-weight: 800; letter-spacing: -0.02em; }
  #promo-end h1 i { font-style: normal; color: ${AMBER}; }
  #promo-end .rule { width: 56px; height: 3px; border-radius: 2px; background: ${AMBER}; margin: 24px 0 22px; }
  #promo-end .line { font-size: 24px; line-height: 32px; color: #c3cedd; font-weight: 500; }
  #promo-end .store { margin-top: 34px; display: inline-flex; align-items: center; gap: 10px; height: 46px; padding: 0 22px;
    border-radius: 23px; font-size: 19px; font-weight: 600; color: #ffd88f;
    background: rgba(255, 176, 32, 0.12); border: 1px solid rgba(255, 176, 32, 0.42); }
  #promo-end .foot { position: absolute; bottom: 26px; left: 0; right: 0; font-size: 13px; color: rgba(176, 190, 210, 0.5); }
`;

/* A plain arrow pointer: dark fill, white outline, tip at (3, 2). */
const CURSOR_SVG = `<svg id="promo-cursor" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 2 L3 20.5 L7.6 16.4 L10.6 23.2 L14 21.7 L11 15 L17.4 15 Z" fill="#111418" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function endCardHtml(end, iconSrc) {
  return `<div class="end-inner">
    <img src="${iconSrc}" alt="">
    <h1>${escapeHtml(end.name).replace(/^(OmniScript )(.+)$/, '$1<i>$2</i>')}</h1>
    <div class="rule"></div>
    <div class="line">${escapeHtml(end.line)}</div>
    <div class="store">${escapeHtml(end.store)}</div>
  </div>${end.foot ? `\n  <div class="foot">${escapeHtml(end.foot)}</div>` : ''}`;
}

async function installOverlay(page, end) {
  const icon = `data:image/png;base64,${readFileSync(path.join(ROOT, 'icons', 'icon128.png')).toString('base64')}`;
  await page.addStyleTag({ content: OVERLAY_CSS });
  await page.evaluate(({ cursor, endHtml }) => {
    const layer = document.createElement('div');
    layer.id = 'promo-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<img id="promo-snap" alt=""><div id="promo-end">${endHtml}</div>` +
      `<div class="promo-caption" data-slot="a"></div><div class="promo-caption" data-slot="b"></div>` +
      `<div id="promo-ring"></div>${cursor}`;
    document.body.appendChild(layer);
    window.__promo = {
      set(state) {
        const cursorEl = document.getElementById('promo-cursor');
        cursorEl.style.transform = `translate(${state.cx - 3}px, ${state.cy - 2}px) scale(${state.cs})`;
        cursorEl.style.opacity = String(state.co);
        const ring = document.getElementById('promo-ring');
        ring.style.opacity = String(state.ro);
        ring.style.transform = `translate(${state.rx}px, ${state.ry}px) scale(${state.rs})`;
        for (const slot of ['a', 'b']) {
          const box = layer.querySelector(`.promo-caption[data-slot="${slot}"]`);
          const cap = state.captions[slot];
          if (box.dataset.key !== cap.key) {
            box.dataset.key = cap.key;
            box.innerHTML = cap.html;
          }
          box.style.opacity = String(cap.o);
          box.style.transform = `translateY(${cap.dy}px)`;
          box.style.visibility = cap.o > 0 ? 'visible' : 'hidden';
        }
        document.getElementById('promo-snap').style.opacity = String(state.so);
        document.getElementById('promo-end').style.opacity = String(state.eo);
      },
      /* The panel's own CSS animations (a flash, a fade) run on film time:
       * each is paused when first seen and set to its age in film time on
       * every frame. Returns whether any of them is still running. */
      tick(t) {
        let running = false;
        for (const animation of document.getAnimations()) {
          const target = animation.effect && animation.effect.target;
          if (target && target.closest && target.closest('#promo-layer')) continue;
          if (animation.filmStart === undefined) animation.filmStart = t;
          animation.pause();
          const end = animation.effect ? animation.effect.getComputedTiming().endTime : 0;
          const age = (t - animation.filmStart) * 1000;
          animation.currentTime = Math.min(age, Number.isFinite(end) ? end : age);
          if (!Number.isFinite(end) || age <= end + 40) running = true;
        }
        return running;
      },
      hide(hidden) { layer.style.visibility = hidden ? 'hidden' : 'visible'; },
      snap(src) { document.getElementById('promo-snap').src = src; }
    };
  }, { cursor: CURSOR_SVG, endHtml: endCardHtml(end, icon) });
}

/* --------------------------------------------------------------- sink */

/* ffmpeg reads the PNG frames from a pipe; the caller names the encoder
 * arguments and the output file. */
export function ffmpegSink(ffmpeg, fps, outputArgs) {
  const child = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...outputArgs], {
    stdio: ['pipe', 'inherit', 'inherit']
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
  return {
    write(buffer) {
      if (child.stdin.write(buffer)) return Promise.resolve();
      return new Promise((resolve) => child.stdin.once('drain', resolve));
    },
    async close() {
      child.stdin.end();
      await done;
    }
  };
}

/* --------------------------------------------------------------- film */

export class Film {
  constructor(page, { fps = 30, sink, width, height }) {
    this.page = page;
    this.fps = fps;
    this.sink = sink;
    this.width = width;
    this.height = height;
    this.n = 0;
    this.cursor = { x: width + 40, y: height * 0.55, scale: 1, opacity: 1 };
    this.ring = null; // { x, y, at }
    this.slots = { a: null, b: null }; // { key, html, inAt, outAt }
    this.snapOpacity = 0;
    this.endOpacity = 0;
    this.dirty = true;
    this.lastKey = '';
    this.last = null;
    this.marks = [];
  }

  static async start(page, options) {
    const film = new Film(page, options);
    await installOverlay(page, options.end);
    return film;
  }

  get t() { return this.n / this.fps; }

  /* The panel changed (a click, typing, a theme switch): capture afresh. */
  touch() { this.dirty = true; }

  captionState(slot) {
    const cap = this.slots[slot];
    if (!cap) return { key: '', html: '', o: 0, dy: 0 };
    const fadeIn = easeOut(clamp01((this.t - cap.inAt) / CAPTION_FADE));
    const fadeOut = cap.outAt == null ? 1 : 1 - clamp01((this.t - cap.outAt) / CAPTION_FADE);
    return { key: cap.key, html: cap.html, o: +(fadeIn * fadeOut).toFixed(3), dy: +((1 - fadeIn) * 10).toFixed(2) };
  }

  overlayState() {
    let ro = 0, rs = 0.4, rx = 0, ry = 0;
    if (this.ring) {
      const life = clamp01((this.t - this.ring.at) / RING_LIFE);
      ro = life >= 1 ? 0 : +(0.9 * (1 - life)).toFixed(3);
      rs = +(0.4 + 0.9 * easeOut(life)).toFixed(3);
      rx = this.ring.x; ry = this.ring.y;
    }
    return {
      cx: +this.cursor.x.toFixed(2), cy: +this.cursor.y.toFixed(2), cs: +this.cursor.scale.toFixed(3), co: this.cursor.opacity,
      ro, rs, rx, ry,
      captions: { a: this.captionState('a'), b: this.captionState('b') },
      so: +this.snapOpacity.toFixed(3), eo: +this.endOpacity.toFixed(3)
    };
  }

  /* Playwright's own screenshot: it honours the emulated viewport and
   * device scale factor, which a bare DevTools-protocol capture does not. */
  capture() {
    return this.page.screenshot({ type: 'png' });
  }

  /* One frame of film time. */
  async frame() {
    const state = this.overlayState();
    const key = JSON.stringify(state);
    await this.page.clock.runFor(1000 / this.fps);
    const animating = await this.page.evaluate((t) => window.__promo.tick(t), this.t);
    if (this.dirty || animating || key !== this.lastKey || !this.last) {
      await this.page.evaluate((s) => window.__promo.set(s), state);
      this.last = await this.capture();
      this.lastKey = key;
      this.dirty = false;
    }
    const due = this.marks.filter((mark) => !mark.done && this.t >= mark.at);
    for (const mark of due) {
      mark.done = true;
      writeFileSync(mark.file, this.last);
    }
    await this.sink.write(this.last);
    this.n++;
  }

  async hold(seconds) {
    const frames = Math.round(seconds * this.fps);
    for (let i = 0; i < frames; i++) await this.frame();
  }

  /* Saves the frame shown `after` seconds from now as a still. */
  still(file, after = 0) {
    this.marks.push({ file, at: this.t + after, done: false });
  }

  /* --------------------------------------------------------- cursor */

  async pointOf(target, { dx = 0.5, dy = 0.5, x = null } = {}) {
    if (Array.isArray(target)) return { x: target[0], y: target[1] };
    const locator = typeof target === 'string' ? this.page.locator(target).first() : target;
    await locator.waitFor({ state: 'visible' });
    const box = await locator.boundingBox();
    return { x: box.x + (x == null ? box.width * dx : x), y: box.y + box.height * dy };
  }

  /* Eased glide along a gentle arc; the real mouse follows, so the panel
   * draws its own hover states. */
  async move(target, options = {}) {
    const to = await this.pointOf(target, options);
    const from = { x: this.cursor.x, y: this.cursor.y };
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const seconds = options.seconds || Math.min(1.1, Math.max(0.45, 0.4 + distance / 1500));
    const frames = Math.max(1, Math.round(seconds * this.fps));
    const bend = Math.min(36, distance * 0.07);
    const nx = distance ? -(to.y - from.y) / distance : 0;
    const ny = distance ? (to.x - from.x) / distance : 0;
    for (let i = 1; i <= frames; i++) {
      const p = easeInOut(i / frames);
      const arc = Math.sin(Math.PI * p) * bend;
      this.cursor.x = from.x + (to.x - from.x) * p + nx * arc;
      this.cursor.y = from.y + (to.y - from.y) * p + ny * arc;
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      await this.frame();
    }
    return to;
  }

  /* Press, the real click, release: the ring grows from the tip. `settle`
   * waits (in real time, film time stands still) until the panel is done. */
  async click(target, { settle = null, options = {}, ...pointOptions } = {}) {
    await this.move(target, pointOptions);
    for (const scale of [0.94, 0.88]) { this.cursor.scale = scale; await this.frame(); }
    await this.page.mouse.click(this.cursor.x, this.cursor.y, options);
    if (settle) await settle(this.page);
    this.ring = { x: this.cursor.x, y: this.cursor.y, at: this.t };
    this.touch();
    for (const scale of [0.94, 1]) { this.cursor.scale = scale; await this.frame(); }
  }

  async type(text, { perChar = 0.085 } = {}) {
    for (const char of text) {
      await this.page.keyboard.type(char);
      this.touch();
      await this.hold(perChar);
    }
  }

  /* -------------------------------------------------------- captions */

  caption(cap) {
    const current = this.slots.a && this.slots.a.outAt == null ? 'a' : this.slots.b && this.slots.b.outAt == null ? 'b' : null;
    if (current) this.slots[current].outAt = this.t;
    if (!cap) return;
    const slot = current === 'a' ? 'b' : 'a';
    const html = `${cap.lead ? `<b>${escapeHtml(cap.lead)}</b>` : ''}${escapeHtml(cap.text)}`;
    /* The new card comes in once the old one has gone. */
    this.slots[slot] = { key: `${this.n}:${cap.text}`, html, inAt: this.t + (current ? CAPTION_FADE : 0), outAt: null };
  }

  /* -------------------------------------------------------- crossfades */

  /* A still of the panel alone (no cursor, no captions), as a data URI. */
  async panelSnapshot() {
    await this.page.evaluate(() => window.__promo.hide(true));
    const png = await this.capture();
    await this.page.evaluate(() => window.__promo.hide(false));
    return `data:image/png;base64,${png.toString('base64')}`;
  }

  /* Changes the panel under a fading still of how it looked, so a change
   * that has no motion of its own (the theme) dissolves instead of cutting. */
  async dissolve(change, seconds = 0.6) {
    const src = await this.panelSnapshot();
    await this.page.evaluate((s) => { window.__promo.snap(s); }, src);
    await until(this.page, () => document.getElementById('promo-snap').complete);
    this.snapOpacity = 1;
    await change(this.page);
    this.touch();
    await this.fade((v) => { this.snapOpacity = 1 - v; }, seconds);
  }

  /* Fades a still in over the panel: the loop ends on its first frame. */
  async fadeToStill(src, seconds) {
    await this.page.evaluate((s) => { window.__promo.snap(s); }, src);
    await until(this.page, () => document.getElementById('promo-snap').complete);
    this.snapOpacity = 0;
    this.touch();
    await this.fade((v) => { this.snapOpacity = v; }, seconds);
  }

  async fade(apply, seconds) {
    const frames = Math.max(1, Math.round(seconds * this.fps));
    for (let i = 1; i <= frames; i++) {
      apply(easeInOut(i / frames));
      await this.frame();
    }
  }

  async endCard(seconds) {
    await this.fade((v) => { this.endOpacity = v; this.cursor.opacity = +(1 - v).toFixed(3); }, 0.7);
    await this.hold(seconds);
  }

  async finish() {
    await this.sink.close();
    return { frames: this.n, seconds: this.t };
  }
}
