// Laver sangene til Musical Marijuana 2 og gemmer dem i music/top.json.
// Køres hver dag af GitHub Actions (music.yml), som lægger filen på grenen "music".
//
// Stilen er party-house, hiphop/R&B og festklassikere (tools/music-style.json):
// - Kunstnerne i stil-filen: deres største sange fra iTunes. Sværhedsgraden kommer
//   fra kunstnerens niveau (1 = meget kendt, 3 = mere niche), og mindre kendte
//   sange er et niveau sværere.
// - Hitlister fra Apple Music (mest spillede): de danske sange i Danmark og
//   hiphop, R&B og dance fra Danmark, Storbritannien og USA. Høj placering = let.
// Appen kan ikke selv hente Apple Musics hitliste (den tillader ikke andre
// hjemmesider), derfor gør dette job det.
// Hver sang får l: 1 = let, 2 = mellem, 3 = svær at gætte.
import fs from "fs";

const STYLE = JSON.parse(fs.readFileSync(new URL("./music-style.json", import.meta.url), "utf8"));
const MOST_PLAYED = (country) => `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/100/songs.json`;
const LOOKUP = (ids, country) => `https://itunes.apple.com/lookup?id=${ids.join(",")}&country=${country}&entity=song`;
const SEARCH = (artist) => `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&attribute=artistTerm&country=dk&limit=25`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      console.log(`${res.status} ${url}`);
      // 403 = iTunes vil have en pause
      await sleep(res.status === 403 ? 30000 : 3000 * (i + 1));
    } catch (err) {
      console.log(`${err.message} ${url}`);
      await sleep(3000 * (i + 1));
    }
  }
  throw new Error(`Kunne ikke hente ${url}`);
}

const bigArt = (url) => (url || "").replace(/\/\d+x\d+bb\./, "/600x600bb.");
const key = (s) => s.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");
// "Losing It" og "Losing It (Radio Edit)" er den samme sang
const baseTitle = (t) => key(t.replace(/\s*[([][^)\]]*[)\]]/g, "").replace(/ - .*$/, ""));
const EXCLUDE = STYLE.exclude.map((x) => x.split("|"));
const excluded = (artist, title) => {
  const a = key(artist);
  const t = baseTitle(title);
  return EXCLUDE.some(([ea, et]) => et === t && a.includes(ea));
};
// Versioner, der ikke er gode at gætte på
const BAD_VERSION = /sped up|slowed|instrumental|karaoke|acapella|a cappella|\blive\b|commentary|interview/i;

// Danske kunstnere (udvides automatisk med dem, der synger på dansk på listen)
const DANISH_ARTISTS = new Set(Object.values(STYLE.dk).flat().map((a) => a.toLowerCase()));
["andreas odbjerg", "jada", "tessa", "rasmus seebach", "lukas graham", "aphaca", "the minds of 99", "karoline mousing",
  "mads langer", "lea romea", "kundo", "mø", "thomas helmig", "sanne salomonsen", "alex vargas", "mille", "soleima",
  "peter a.g.", "mekdes", "kwamie liv", "freyy", "benjamin hav", "ella augusta", "clara", "anton westerlin"].forEach((a) => DANISH_ARTISTS.add(a));
// Ord, der kun findes på dansk (ikke ord, der også er engelske, som "bare" og "over")
const DANISH_WORDS = new Set(("jeg det er ikke og et af på til med mig min mit din dit så vil ku kan har noget hvis uden " +
  "elsker natten nat himmel hjem hjerte aldrig altid igen ingen kom kun lidt mere når nu op ud ind ved vi vores os hvad " +
  "hvem hvor hvorfor fordi godt sammen stadig savner være været blive bliver drøm drømme lys mørke sne stjerne venner " +
  "pige dreng sommer vinter regn far mor hun han dem jer også eller men skal sku vil gerne mand kvinde aften morgen").split(" "));

const artistsOf = (name) => name.split(/,|&| x | og | feat\.? | med /i).map((s) => s.trim().toLowerCase()).filter(Boolean);
const cleanTitle = (t) => t.replace(/\((feat|with|med)[^)]*\)/gi, "").replace(/\[[^\]]*\]/g, "");
function looksDanish(song) {
  if (/[æøå]/i.test(cleanTitle(song.name))) return true;
  return cleanTitle(song.name).toLowerCase().split(/[^\p{L}]+/u).some((w) => DANISH_WORDS.has(w));
}
const isDanish = (song) => looksDanish(song) || artistsOf(song.artistName).some((a) => DANISH_ARTISTS.has(a));

// Placering på en hitliste → sværhedsgrad (øverste tredjedel er let)
const levelByRank = (i, n) => 1 + Math.min(2, Math.floor((i / n) * 3));

// Apple Musics lister har ikke lydklip med, så de slås op i iTunes
async function chartSongs(songs, country) {
  const out = [];
  for (let i = 0; i < songs.length; i += 100) {
    const part = songs.slice(i, i + 100);
    const data = await json(LOOKUP(part.map((s) => s.id), country));
    const byId = new Map((data.results || []).map((r) => [String(r.trackId), r]));
    part.forEach((s, j) => {
      const r = byId.get(String(s.id));
      if (r && r.previewUrl && !excluded(s.artistName, s.name)) {
        out.push({ t: s.name, a: s.artistName, art: bigArt(r.artworkUrl100 || s.artworkUrl100), p: r.previewUrl, l: levelByRank(i + j, songs.length) });
      }
    });
  }
  return out;
}

// De største sange fra hver kunstner i stil-filen
async function artistSongs(tiers) {
  const out = [];
  for (const [tier, artists] of Object.entries(tiers)) {
    const take = tier === "1" ? 5 : tier === "2" ? 4 : 3;
    for (const artist of artists) {
      try {
        const want = key(artist);
        const seen = new Set();
        const songs = ((await json(SEARCH(artist))).results || []).filter((r) => {
          const k = baseTitle(r.trackName);
          if (!r.previewUrl || !key(r.artistName).includes(want) || BAD_VERSION.test(r.trackName) || seen.has(k)) return false;
          if (excluded(r.artistName, r.trackName)) return false;
          seen.add(k);
          return true;
        }).slice(0, take);
        songs.forEach((r, i) => out.push({
          t: r.trackName, a: r.artistName, art: bigArt(r.artworkUrl100), p: r.previewUrl,
          // De 2 største sange får kunstnerens niveau, resten er lidt sværere
          l: Math.min(3, Number(tier) + (i >= 2 ? 1 : 0)),
        }));
      } catch (err) {
        console.log(err.message);
      }
      await sleep(3300); // iTunes tillader ca. 20 opslag i minuttet
    }
  }
  return out;
}

function unique(list) {
  const seen = new Set();
  return list.filter((s) => {
    const k = baseTitle(s.t) + "|" + key(s.a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const primaryGenre = (s) => ((s.genres || []).find((g) => g.name !== "Music") || {}).name || "";
const EN_GENRES = /hip-hop|rap|r&b|soul|dance|house|electronic|reggae|latin|afrobeats/i;
const HOUSE_GENRES = /dance|house|electronic/i;

const charts = {};
for (const country of ["dk", "gb", "us"]) charts[country] = (await json(MOST_PLAYED(country))).feed.results;

// Kunstnere, der synger på dansk på listen, er danske
charts.dk.filter(looksDanish).forEach((s) => artistsOf(s.artistName).forEach((a) => DANISH_ARTISTS.add(a)));

const dk = [...(await chartSongs(charts.dk.filter(isDanish), "dk")), ...(await artistSongs(STYLE.dk))];
const en = [];
const house = [];
for (const country of ["dk", "gb", "us"]) {
  const foreign = charts[country].filter((s) => !isDanish(s));
  en.push(...(await chartSongs(foreign.filter((s) => EN_GENRES.test(primaryGenre(s)) && !HOUSE_GENRES.test(primaryGenre(s))), country)));
  house.push(...(await chartSongs(foreign.filter((s) => HOUSE_GENRES.test(primaryGenre(s))), country)));
}
en.push(...(await artistSongs(STYLE.en)));
house.push(...(await artistSongs(STYLE.house)));

const result = { updated: new Date().toISOString(), dk: unique(dk), en: unique(en), house: unique(house) };
for (const cat of ["dk", "en", "house"]) {
  const list = result[cat];
  const levels = [1, 2, 3].map((l) => list.filter((s) => s.l === l).length).join("/");
  console.log(`${cat}: ${list.length} sange (let/mellem/svær: ${levels})`);
  console.log("  " + list.slice(0, 12).map((s) => `${s.a} - ${s.t} [${s.l}]`).join("; "));
}
if (result.dk.length < 20 || result.en.length < 20 || result.house.length < 20) throw new Error("For få sange; gemmer ikke");
fs.mkdirSync("music", { recursive: true });
fs.writeFileSync("music/top.json", JSON.stringify(result));
