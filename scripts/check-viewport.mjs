#!/usr/bin/env node
/**
 * Горизонтальная прокрутка и обрезанные элементы на узких экранах.
 *
 * Появился после реального дефекта: грид в подвале внутри флекс-элемента с
 * min-width: auto раздвигал документ до 392 px при вьюпорте 360 px, из-за чего
 * кнопка «Telegram» в полосе вызова уезжала за край экрана. Lighthouse это не
 * ловит: мобильный прогон идёт на 412 px, где запаса ещё хватает.
 *
 * Проверяет каждую страницу dist на нескольких реальных ширинах через CDP.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as chromeLauncher from 'chrome-launcher';

import { closeServer, serveDist } from './serve-dist.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const PORT = 4323;

/** 320 — самые узкие живые телефоны, 360 — самая массовая ширина Android. */
const WIDTHS = [320, 360, 390, 412];

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

/** Минимальный CDP-клиент: WebSocket есть в Node начиная с 22. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.waiters = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
        }
        return;
      }
      for (const w of this.waiters.slice()) {
        if (w.method === msg.method) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(msg.params);
        }
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((ok, err) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', () => err(new Error('CDP: не удалось подключиться')), { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const w = { method, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error(`CDP: не дождались ${method}`));
        }
      }, timeoutMs);
    });
  }

  close() {
    this.ws.close();
  }
}

/** Выполняется в странице: переполнение и элементы, вылезшие за вьюпорт. */
const PROBE = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const overflow = de.scrollWidth - vw;
  const guilty = [];
  if (overflow > 0) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 0.5 || r.left < -0.5) {
        const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
        guilty.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') +
          ' [' + Math.round(r.left) + '…' + Math.round(r.right) + ']');
      }
    }
  }
  const cut = [];
  for (const el of document.querySelectorAll('a[href^="tel:"], .call-bar a, .btn')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5)) {
      cut.push((el.textContent || '').trim().slice(0, 24) + ' [' + Math.round(r.left) + '…' + Math.round(r.right) + ']');
    }
  }
  return JSON.stringify({ vw, overflow, guilty: guilty.slice(0, 6), cut: cut.slice(0, 4) });
})()`;

const pages = htmlFiles(DIST)
  .map((f) => `/${relative(DIST, f).replace(/index\.html$/, '').split(sep).join('/')}`)
  .map((p) => (p.endsWith('404.html') ? '/404.html' : p))
  .sort();

if (pages.length === 0) {
  console.error('\n  ✗ В dist нет страниц — сначала npm run build\n');
  process.exit(1);
}

const server = await serveDist(PORT);
const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

const problems = [];
let checks = 0;

try {
  const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал ни одной вкладки');

  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  console.log('\nПереполнение по ширине на узких экранах\n');

  for (const width of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 800,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });

    const bad = [];
    for (const path of pages) {
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url: `http://localhost:${PORT}${path}` });
      await loaded;

      const { result } = await cdp.send('Runtime.evaluate', {
        expression: PROBE,
        returnByValue: true,
      });
      const r = JSON.parse(result.value);
      checks += 1;

      if (r.overflow > 0 || r.cut.length > 0) {
        bad.push({ path, ...r });
        problems.push(`${width}px · ${path}: переполнение ${r.overflow}px`);
      }
    }

    if (bad.length === 0) {
      console.log(`  ✓ ${String(width).padStart(3)} px — все ${pages.length} стр. без прокрутки вбок`);
    } else {
      console.log(`  ✗ ${String(width).padStart(3)} px — страниц с переполнением: ${bad.length}`);
      for (const b of bad.slice(0, 3)) {
        console.log(`      ${b.path}: документ шире вьюпорта на ${b.overflow}px`);
        for (const g of b.guilty) console.log(`        вылезает: ${g}`);
        for (const c of b.cut) console.log(`        ОБРЕЗАНА КНОПКА: ${c}`);
      }
      if (bad.length > 3) console.log(`      …и ещё ${bad.length - 3} стр.`);
    }
  }

  cdp.close();
} finally {
  chrome.kill();
  await closeServer(server);
}

console.log(`\n  Проверок: ${checks}. Проблем: ${problems.length}.\n`);
process.exit(problems.length > 0 ? 1 : 0);
