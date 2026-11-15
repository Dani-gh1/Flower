const { addPlayers } = require('./rec.js');
const EN = process.env.APPLANG === 'en';
const N = (a) => EN ? a.map((x) => ({ Mads: 'Jake', Sofie: 'Mia', Jonas: 'Liam', Emma: 'Emma', Dig: 'You' })[x] || x) : a;
const showCard = (p, sel) => p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center', behavior: 'smooth' }), sel);
const go = (p, v) => p.evaluate((v) => openView('handbook', v), v);
const forceSpin1 = (p, winner, card) => p.evaluate(([w, c]) => {
  const n = spinPlayers.length, deck = spinDeck();
  window.__q.push((w + .5) / n, .1, (deck.indexOf(c) + .5) / deck.length);
}, [winner, card]);
const forceSpin2 = (p, tile) => p.evaluate((c) => {
  window.__q.push((spin2Tiles.indexOf(c) + .5) / spin2Tiles.length, .1);
}, tile);
// Spin the Joint: vælg 1 eller 2, evt. sværhedsgrad, tilføj spillere og tryk Start
async function spinSetup(p, mark, mode, names, level, markName = 'start') {
  await go(p, 'spin'); mark(markName);
  await p.waitForTimeout(500);
  await p.click(`[data-spin-mode="${mode}"]`);
  if (level) { await p.click(`[data-level=${level}]`); mark(level === 'impossible' ? 'umulig' : level); }
  await addPlayers(p, '#spin-form', N(names));
  await p.click('#spin-start'); mark('play');
  await p.waitForTimeout(700);
}
// Weed Quiz med ét bestemt spørgsmål (find det på starten af det danske spørgsmål)
async function quizScene(p, mark, start, daAnswer, enAnswer) {
  await p.addStyleTag({ content: '#quiz-result{display:none!important}' });
  await go(p, 'quiz'); mark('start');
  await p.evaluate((s) => {
    const q = QUIZ.find((x) => x.da[0].startsWith(s));
    pickQuizQuestions = () => [q];
  }, start);
  await addPlayers(p, '#quiz-form', N(['Mads', 'Emma']));
  await p.waitForTimeout(300);
  await p.click('#quiz-start'); mark('q1');
  await p.waitForTimeout(4200);
  await p.click(`.quiz-a:has-text(${JSON.stringify(EN ? enAnswer : daAnswer)})`); mark('a1');
  await p.waitForTimeout(2500);
}
module.exports = {
  // 1: Umulig betyder umulig
  umulig: async (p, mark) => {
    await spinSetup(p, mark, '1', ['Mads', 'Sofie', 'Jonas', 'Emma'], 'impossible');
    await forceSpin1(p, 2, 'tornado');
    await p.click('#spin-btn'); mark('spin');
    await p.waitForTimeout(3350); await showCard(p, '#spin-card'); await p.waitForTimeout(250); mark('card');
    await p.waitForTimeout(1600);
    await p.click('[data-spin-pass]'); mark('pass');
    await p.waitForTimeout(2200);
  },
  // 2: POV lykkehjulet hader dig
  hjul: async (p, mark) => {
    await spinSetup(p, mark, '2', ['Dig', 'Sofie', 'Jonas']);
    for (let i = 1; i <= 3; i++) {
      await forceSpin2(p, 'tornado');
      await p.click('#spin2-btn'); mark('spin' + i);
      await p.waitForTimeout(3300); await showCard(p, '#spin2-card'); await p.waitForTimeout(200); mark('land' + i);
      await p.waitForTimeout(1300);
      if (i < 3) {
        await p.evaluate(() => { spin2Turn = 0; });   // "Dig" hver gang
        await p.evaluate(() => document.getElementById('spin2-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
        await p.waitForTimeout(300);
      }
    }
    await p.waitForTimeout(1500);
  },
  // 3: Nem, Svær eller Umulig (vælges før spillet)
  levels: async (p, mark) => {
    await go(p, 'spin'); mark('start');
    await p.waitForTimeout(1800);
    for (const l of ['easy', 'hard', 'impossible']) { await p.click(`[data-level=${l}]`); mark(l); await p.waitForTimeout(1500); }
    await addPlayers(p, '#spin-form', N(['Mads', 'Sofie', 'Emma']));
    await p.click('#spin-start'); mark('play');
    await p.waitForTimeout(800);
    await forceSpin1(p, 2, 'tornado');
    await p.click('#spin-btn');
    await p.waitForTimeout(3300); await showCard(p, '#spin-card'); await p.waitForTimeout(200); mark('card');
    await p.waitForTimeout(1800);
  },
  // 4: Spil-menuen
  menu: async (p, mark) => {
    await p.evaluate(() => openView('handbook', 'hb-menu')); mark('start');
    await p.waitForTimeout(1000);
    await p.evaluate(() => goView('games')); mark('games');
    await p.waitForTimeout(1800);
    for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(250); }
    mark('scrolled');
    await p.waitForTimeout(1000);
    await p.evaluate(() => { window.scrollTo(0, 0); phoneScreen.scrollTop = 0; });
    await spinSetup(p, mark, '2', ['Mads', 'Emma'], null, 'spin2');
    await forceSpin2(p, 'turtle');
    await p.click('#spin2-btn'); mark('spin');
    await p.waitForTimeout(3300); await showCard(p, '#spin2-card');
    await p.waitForTimeout(1800);
  },
  // 5: Weed Quiz
  quiz: async (p, mark) => {
    await p.addStyleTag({ content: '#quiz-result{display:none!important}' });
    await go(p, 'quiz'); mark('start');
    await p.evaluate(() => {
      const pick = (start) => QUIZ.find((q) => q.da[0].startsWith(start));
      pickQuizQuestions = () => [pick('Hvilken plante er cannabis i familie med'), pick('Hvilken farve er Granddaddy Purple')];
    });
    await addPlayers(p, '#quiz-form', N(['Mads', 'Emma']));
    await p.waitForTimeout(300);
    await p.click('#quiz-start'); mark('q1');
    await p.waitForTimeout(4200);
    await p.click(EN ? '.quiz-a:has-text("Hops")' : '.quiz-a:has-text("Humle")'); mark('a1');
    await p.waitForTimeout(2500);
  },
  // ---------- Uge 45 (2026) ----------
  quizmalana: (p, mark) => quizScene(p, mark, 'Hvilket land kommer Malana Cream fra', 'Indien', 'India'),
  quizbanner: (p, mark) => quizScene(p, mark, 'Hvilken sort har navn efter en tegneseriefigur', 'Bruce Banner', 'Bruce Banner'),
  quizlemon: (p, mark) => quizScene(p, mark, 'Hvilken terpen dufter af citron', 'Limonen', 'Limonene'),
  // Afstemning: tre spillere, tre straffe
  poll: async (p, mark) => {
    await spinSetup(p, mark, '2', ['Mads', 'Sofie', 'Jonas']);
    const tiles = ['turtle', 'diy', 'tornado'];
    for (let i = 1; i <= 3; i++) {
      await forceSpin2(p, tiles[i - 1]);
      await p.click('#spin2-btn'); mark('spin' + i);
      await p.waitForTimeout(3300); await showCard(p, '#spin2-card'); await p.waitForTimeout(200); mark('land' + i);
      await p.waitForTimeout(1500);
      if (i < 3) {
        await p.evaluate(() => document.getElementById('spin2-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
        await p.waitForTimeout(300);
      }
    }
    await p.waitForTimeout(1200);
  },
  // Vennen, der altid vælger Nem
  easy: async (p, mark) => {
    await go(p, 'spin'); mark('start');
    await addPlayers(p, '#spin-form', N(['Mads', 'Sofie', 'Jonas']));
    await p.evaluate(() => { window.scrollTo(0, 0); phoneScreen.scrollTop = 0; });
    await p.waitForTimeout(500);
    await p.click('[data-level=easy]'); mark('easy');
    await p.waitForTimeout(1600);
    await p.click('#spin-start');
    await p.waitForTimeout(700);
    await forceSpin1(p, 1, 'turtle');
    await p.click('#spin-btn'); mark('spin');
    await p.waitForTimeout(3300); await showCard(p, '#spin-card'); await p.waitForTimeout(200); mark('card');
    await p.waitForTimeout(2600);
  },
  // Rundtur: Håndbog → spil → Smoke Hub → ＋ (hvad vil du dele?)
  tour: async (p, mark) => {
    await p.evaluate(() => openView('handbook', 'hb-menu')); mark('start');
    await p.waitForTimeout(1600);
    await p.evaluate(() => goView('games')); mark('games');
    await p.waitForTimeout(2600);
    await p.evaluate(() => { window.scrollTo(0, 0); phoneScreen.scrollTop = 0; showPage('hub'); }); mark('hub');
    await p.waitForTimeout(1300);
    await p.click('#hub-new-btn'); mark('hub2');
    await p.waitForTimeout(3600);
  },
  // Udvikleren: et hurtigt klip fra to spil
  devstory: async (p, mark) => {
    await go(p, 'spin'); mark('start');
    await p.waitForTimeout(600);
    for (const l of ['easy', 'hard', 'impossible']) { await p.click(`[data-level=${l}]`); await p.waitForTimeout(450); }
    await p.click('[data-spin-mode="2"]'); await p.waitForTimeout(500);
    await addPlayers(p, '#spin-form', N(['Mads', 'Sofie']));
    await p.click('#spin-start'); mark('spin2');
    await p.waitForTimeout(600);
    await forceSpin2(p, 'chimney');
    await p.click('#spin2-btn');
    await p.waitForTimeout(3300); await showCard(p, '#spin2-card');
    await p.waitForTimeout(900);
    await p.evaluate(() => {
      const pick = (s) => QUIZ.find((q) => q.da[0].startsWith(s));
      pickQuizQuestions = () => [pick('Hvad kaldes duftstofferne')];
      openView('handbook', 'quiz');
    });
    await p.waitForTimeout(400);
    await p.click('#quiz-start'); mark('quiz');
    await p.waitForTimeout(4200);
  },
  // ---------- Uge 47 (2026) ----------
  quizbluedream: (p, mark) => quizScene(p, mark, 'Hvilken sort er en krydsning af Blueberry og Haze', 'Blue Dream', 'Blue Dream'),
  quiztrichomes: (p, mark) => quizScene(p, mark, 'Hvad kaldes de små krystaller', 'Trikomer', 'Trichomes'),
  quizpurple: (p, mark) => quizScene(p, mark, 'Hvilken farve er Granddaddy Purple', 'Lilla', 'Purple'),
  // Spin the Joint 1 eller 2: vis begge kort, spil 1, så 2
  modes: async (p, mark) => {
    await go(p, 'spin'); mark('start');
    await p.waitForTimeout(1400);
    await p.click('[data-spin-mode="1"]'); mark('one');
    await p.waitForTimeout(1400);
    await p.click('[data-spin-mode="2"]'); mark('two');
    await p.waitForTimeout(1400);
    await addPlayers(p, '#spin-form', N(['Mads', 'Sofie', 'Jonas']));
    await p.click('#spin-start'); mark('play');
    await p.waitForTimeout(600);
    await forceSpin2(p, 'chimney');
    await p.click('#spin2-btn');
    await p.waitForTimeout(3300); await showCard(p, '#spin2-card'); await p.waitForTimeout(200); mark('card');
    await p.waitForTimeout(2000);
  },
  // Stor gruppe: 8 spillere i Spin the Joint 1
  bigcrew: async (p, mark) => {
    await go(p, 'spin'); mark('start');
    await p.click('[data-spin-mode="1"]');
    await p.click('[data-level=hard]');
    const names = ['Jake', 'Mia', 'Liam', 'Emma', 'Noah', 'Zoe', 'Max', 'Lily'];
    for (const n of names) { await p.click('#spin-form input'); await p.keyboard.type(n, { delay: 35 }); await p.click('#spin-form button[type=submit]'); await p.waitForTimeout(120); }
    mark('added');
    await p.click('#spin-start'); mark('play');
    await p.waitForTimeout(800);
    await forceSpin1(p, 5, 'turtle');
    await p.click('#spin-btn'); mark('spin');
    await p.waitForTimeout(3300); await showCard(p, '#spin-card'); await p.waitForTimeout(200); mark('card');
    await p.waitForTimeout(2200);
  },
  // Weed Chess: startskærmen (selve spillet kræver en ven og login)
  chess: async (p, mark) => {
    await go(p, 'games'); mark('start');
    await p.waitForTimeout(1200);
    await p.evaluate(() => goView('chess')); mark('chess');
    await p.waitForTimeout(5200);
  },
  // Værten snurrer først
  hostfirst: async (p, mark) => {
    await spinSetup(p, mark, '2', ['Dig', 'Sofie', 'Jonas', 'Emma']);
    await forceSpin2(p, 'turtle');
    await p.click('#spin2-btn'); mark('spin');
    await p.waitForTimeout(3300); await showCard(p, '#spin2-card'); await p.waitForTimeout(200); mark('card');
    await p.waitForTimeout(2600);
  },
};
