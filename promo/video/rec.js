const { chromium } = require('playwright');
const fs = require('fs');
const LANG = process.env.APPLANG || 'da';
const RAW = LANG === 'da' ? 'raw' : 'raw_' + LANG;
const HIDE = `.spin-prev,#spin-level-help,.view[data-view] > p.muted,#tonight-text,.timer-ring,.timer,.game-note,.tabbar,#quiz-setup > p.muted,.game-item small,.game-card[data-go="game"],.game-card[data-go="dice"],.game-card[data-go="double"],.game-card[data-go="musical"],.game-card[data-go="bong"],.game-card[data-go="blackjack"],#quiz-result{display:none!important}
.tap-dot{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.45);border:2px solid #fff;pointer-events:none;z-index:99999;animation:tapd .5s ease-out forwards}
@keyframes tapd{from{transform:scale(.4);opacity:1}to{transform:scale(1.4);opacity:0}}`;
async function clip(name, fn) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, locale: LANG === 'da' ? 'da-DK' : 'en-US', isMobile: true, hasTouch: false });
  await ctx.addInitScript((l) => { localStorage.setItem('lang', l); }, LANG);
  const p = await ctx.newPage();
  fs.mkdirSync(RAW + '/' + name, { recursive: true });
  const cdp = await ctx.newCDPSession(p);
  const frames = []; let t0 = Date.now(); let wall0 = null;
  cdp.on('Page.screencastFrame', async (f) => {
    const i = frames.length; const file = `${RAW}/${name}/${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.route(/gstatic|firebase|googleapis/, r => r.abort());
  await p.goto('http://localhost:8765/index.html');
  await p.waitForTimeout(1200);
  await p.addStyleTag({ content: HIDE });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  t0 = Date.now(); wall0 = t0 / 1000;
  await p.evaluate(() => {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    appScreen.classList.remove('hidden');
    const orig = Math.random; window.__q = [];
    Math.random = () => (window.__q.length ? window.__q.shift() : orig());
    document.addEventListener('pointerdown', e => { const d = document.createElement('div'); d.className = 'tap-dot';
      d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 600); }, true);
  });
  const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; };
  await fn(p, mark);
  await p.waitForTimeout(300); mark('end');
  await cdp.send('Page.stopScreencast');
  await ctx.close(); await b.close();
  // concat-liste med varighed pr. billede, så tiden passer med marks
  let txt = ''; const endTs = wall0 + marks.end;
  for (let i = 0; i < frames.length; i++) {
    const start = i === 0 ? wall0 : frames[i].ts; const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
    txt += `file '${frames[i].file.split('/').pop()}'\nduration ${Math.max(0.001, next - start).toFixed(4)}\n`;
  }
  txt += `file '${frames[frames.length - 1].file.split('/').pop()}'\n`;
  fs.writeFileSync(`${RAW}/${name}/list.txt`, txt);
  fs.writeFileSync(RAW + '/' + name + '.json', JSON.stringify(marks));
  console.log(name, marks);
}
async function addPlayers(p, form, names) {
  for (const n of names) {
    await p.click(`${form} input`); await p.keyboard.type(n, { delay: 70 });
    await p.click(`${form} button[type=submit]`); await p.waitForTimeout(250);
  }
}
module.exports = { clip, addPlayers };
if (require.main === module) {
  const which = process.argv.slice(2);
  const S = require('./scenes.js');
  (async () => { for (const k of which) await clip(k, S[k]); })();
}
