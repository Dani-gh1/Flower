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
    await go(p, 'spin'); mark('start');
    await p.waitForTimeout(700);
    await p.click('[data-level=impossible]'); mark('umulig');
    await p.waitForTimeout(600);
    await addPlayers(p, '#spin-form', N(['Mads', 'Sofie', 'Jonas', 'Emma']));
    await p.evaluate(() => document.getElementById('spin-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
    await p.waitForTimeout(600);
    await forceSpin1(p, 2, 'tornado');
    await p.click('#spin-btn'); mark('spin');
    await p.waitForTimeout(3350); await showCard(p, '#spin-card'); await p.waitForTimeout(250); mark('card');
    await p.waitForTimeout(1600);
    await p.click('[data-spin-pass]'); mark('pass');
    await p.waitForTimeout(2200);
  },
  // 2: POV lykkehjulet hader dig
  hjul: async (p, mark) => {
    await go(p, 'spin2'); mark('start');
    await addPlayers(p, '#spin2-form', N(['Dig', 'Sofie', 'Jonas']));
    await p.evaluate(() => document.getElementById('spin2-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
    await p.waitForTimeout(500);
    for (let i = 1; i <= 3; i++) {
      await forceSpin2(p, 'tornado');
      await p.click('#spin2-btn'); mark('spin' + i);
      await p.waitForTimeout(3300); await showCard(p, '#spin2-card'); await p.waitForTimeout(200); mark('land' + i);
      await p.waitForTimeout(1300);
      if (i < 3) { // Sofie og Jonas springes over, så det er "Dig" hver gang
        await p.evaluate(() => { spin2Turn = 0; });
        await p.evaluate(() => document.getElementById('spin2-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
        await p.waitForTimeout(300);
      }
    }
    await p.waitForTimeout(1500);
  },
  // 3: Nem, Svær eller Umulig
  levels: async (p, mark) => {
    await go(p, 'spin'); mark('start');
    await addPlayers(p, '#spin-form', N(['Mads', 'Sofie', 'Emma']));
    await p.evaluate(() => document.getElementById('spin-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
    const plan = [['easy', 0, 'chimney'], ['hard', 1, 'diy'], ['impossible', 2, 'tornado']];
    for (const [lvl, w, c] of plan) {
      await p.evaluate(() => window.scrollTo(0, 0)); await p.evaluate(() => { phoneScreen.scrollTop = 0; });
      await p.waitForTimeout(400);
      await p.click(`[data-level=${lvl}]`); mark(lvl);
      await p.waitForTimeout(500);
      await p.evaluate(() => document.getElementById('spin-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
      await p.waitForTimeout(500);
      await forceSpin1(p, w, c);
      await p.click('#spin-btn');
      await p.waitForTimeout(3300); await showCard(p, '#spin-card'); await p.waitForTimeout(200); mark(lvl + 'Card');
      await p.waitForTimeout(1400);
    }
  },
  // 4: Spil-menuen
  menu: async (p, mark) => {
    await p.evaluate(() => openView('handbook', 'hb-menu')); mark('start');
    await p.waitForTimeout(1000);
    await p.evaluate(() => goView('games')); mark('games');
    await p.waitForTimeout(1500);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(250); }
    mark('scrolled');
    await p.waitForTimeout(1200);
    await p.evaluate(() => { window.scrollTo(0, 0); phoneScreen.scrollTop = 0; });
    await p.waitForTimeout(500);
    await p.evaluate(() => goView('spin2')); mark('spin2');
    await addPlayers(p, '#spin2-form', N(['Mads', 'Emma']));
    await p.evaluate(() => document.getElementById('spin2-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
    await p.waitForTimeout(400);
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
    await go(p, 'spin2'); mark('start');
    await addPlayers(p, '#spin2-form', N(['Mads', 'Sofie', 'Jonas']));
    await p.evaluate(() => document.getElementById('spin2-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
    await p.waitForTimeout(400);
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
    await p.evaluate(() => document.getElementById('spin-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
    await p.waitForTimeout(500);
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
    await p.waitForTimeout(1200);
    for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 110); await p.waitForTimeout(220); }
    await p.waitForTimeout(800);
    await p.evaluate(() => { window.scrollTo(0, 0); phoneScreen.scrollTop = 0; showPage('hub'); }); mark('hub');
    await p.waitForTimeout(1300);
    await p.click('#hub-new-btn'); mark('hub2');
    await p.waitForTimeout(3600);
  },
  // Udvikleren: et hurtigt klip fra tre spil
  devstory: async (p, mark) => {
    await go(p, 'spin'); mark('start');
    await p.waitForTimeout(600);
    for (const l of ['easy', 'hard', 'impossible']) { await p.click(`[data-level=${l}]`); await p.waitForTimeout(450); }
    await p.waitForTimeout(600);
    await go(p, 'spin2'); mark('spin2');
    await addPlayers(p, '#spin2-form', N(['Mads', 'Sofie']));
    await p.evaluate(() => document.getElementById('spin2-btn').scrollIntoView({ block: 'end', behavior: 'smooth' }));
    await p.waitForTimeout(300);
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
};
