// Henter hitlisterne til Musical Marijuana 2 og gemmer dem i music/top.json.
// Køres hver dag af GitHub Actions (music.yml), som lægger filen på grenen "music".
// - Top dansk og Top engelsk: de mest spillede sange på Apple Music i Danmark
//   (danske sange skilles fra) plus de mest spillede i Storbritannien.
// - Top house: house og dance fra de mest spillede lister, kendte house-kunstnere
//   og toppen af iTunes' house-liste.
// Appen kan ikke selv hente Apple Musics hitliste (den tillader ikke andre hjemmesider),
// derfor gør dette job det.
import fs from "fs";

const MOST_PLAYED = (country) => `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/100/songs.json`;
const HOUSE = (country) => `https://itunes.apple.com/${country}/rss/topsongs/limit=100/genre=1048/json`;
const LOOKUP = (ids, country) => `https://itunes.apple.com/lookup?id=${ids.join(",")}&country=${country}&entity=song`;

async function json(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      console.log(`${res.status} ${url}`);
    } catch (err) {
      console.log(`${err.message} ${url}`);
    }
    await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
  }
  throw new Error(`Kunne ikke hente ${url}`);
}

const bigArt = (url) => (url || "").replace(/\/\d+x\d+bb\./, "/600x600bb.");
const key = (s) => s.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");

// Danske kunstnere (udvides automatisk med dem, der synger på dansk på listen)
const DANISH_ARTISTS = new Set([
  "annika", "christopher", "lamin", "kesi", "tobias rahim", "gilli", "benny jamz", "hjalmer", "ukendt kunstner",
  "andreas odbjerg", "malte ebert", "jada", "tessa", "medina", "l.o.c.", "rasmus seebach", "lukas graham", "suspekt",
  "burhan g", "specktors", "joey moe", "hans philip", "noah carter", "mas", "guldimund", "aphaca", "the minds of 99",
  "karoline mousing", "mads langer", "lea romea", "kundo", "fouli", "branco", "sivas", "icekiid", "artigeardit",
  "ude af kontrol", "mø", "thomas helmig", "sanne salomonsen", "alex vargas", "mille", "lord siva", "soleima",
  "peter a.g.", "mekdes", "saveus", "kidd", "kwamie liv", "freyy", "benjamin hav", "ella augusta", "clara",
  "drew sycamore", "hugo helmig", "kim larsen", "tv-2", "gnags", "anne linnet", "natasja", "outlandish",
  "barbara moleko", "karl william", "phlake", "jonah blacksmith", "folkeklubben", "magtens korridorer", "nik & jay",
  "anton westerlin", "gulddreng", "d-a-d", "volbeat", "alphabeat", "aqua", "infernal", "dúné", "shu-bi-dua",
]);
// Ord, der kun findes på dansk (ikke ord, der også er engelske, som "bare" og "over")
const DANISH_WORDS = new Set(("jeg det er ikke og et af på til med mig min mit din dit så vil ku kan har noget hvis uden " +
  "elsker natten nat himmel hjem hjerte aldrig altid igen ingen kom kun lidt mere når nu op ud ind ved vi vores os hvad " +
  "hvem hvor hvorfor fordi godt sammen stadig savner være været blive bliver drøm drømme lys mørke sne stjerne venner " +
  "pige dreng sommer vinter regn far mor hun han dem jer også eller men skal sku vil gerne mand kvinde aften morgen").split(" "));

const artistsOf = (name) => name.split(/,|&| x | og | feat\.? | med /i).map((s) => s.trim().toLowerCase()).filter(Boolean);
const cleanTitle = (t) => t.replace(/\((feat|with|med)[^)]*\)/gi, "").replace(/\[[^\]]*\]/g, "");

function looksDanish(song) {
  if (/[æøå]/i.test(cleanTitle(song.name))) return true;
  const words = cleanTitle(song.name).toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  return words.some((w) => DANISH_WORDS.has(w));
}

function isDanish(song) {
  return looksDanish(song) || artistsOf(song.artistName).some((a) => DANISH_ARTISTS.has(a));
}

// Apple Musics lister har ikke lydklip med, så de slås op i iTunes
async function withPreviews(songs, country) {
  const out = [];
  for (let i = 0; i < songs.length; i += 100) {
    const part = songs.slice(i, i + 100);
    const data = await json(LOOKUP(part.map((s) => s.id), country));
    const byId = new Map((data.results || []).map((r) => [String(r.trackId), r]));
    part.forEach((s) => {
      const r = byId.get(String(s.id));
      if (r && r.previewUrl) out.push({ t: s.name, a: s.artistName, art: bigArt(r.artworkUrl100 || s.artworkUrl100), p: r.previewUrl });
    });
  }
  return out;
}

function unique(list) {
  const seen = new Set();
  return list.filter((s) => {
    // "Losing It" og "Losing It (Radio Edit)" er den samme sang
    const k = key(s.t.replace(/\s*[([][^)\]]*[)\]]/g, "").replace(/ - .*$/, "") + "|" + s.a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const dk = (await json(MOST_PLAYED("dk"))).feed.results;
const gb = (await json(MOST_PLAYED("gb"))).feed.results;
// Kunstnere, der synger på dansk på listen, er danske
dk.filter(looksDanish).forEach((s) => artistsOf(s.artistName).forEach((a) => DANISH_ARTISTS.add(a)));
const dkDanish = dk.filter(isDanish);
const dkOther = dk.filter((s) => !isDanish(s));

const danish = unique(await withPreviews(dkDanish, "dk"));
const english = unique([...(await withPreviews(dkOther, "dk")), ...(await withPreviews(gb.filter((s) => !isDanish(s)), "gb"))]);

// Top house: house og dance fra de mest spillede lister i flere lande, de største
// house-kunstneres kendte sange og toppen af iTunes' house-liste
const HOUSE_GENRES = /dance|house|electronic/i;
const HOUSE_ARTISTS = ["Fred again..", "FISHER", "Dom Dolla", "John Summit", "Chris Lake", "Calvin Harris", "David Guetta",
  "Swedish House Mafia", "Avicii", "Peggy Gou", "Mau P", "Sonny Fodera", "Disclosure", "MK", "Purple Disco Machine", "Meduza",
  "James Hype", "Joel Corry", "Tiësto", "Martin Garrix", "Kungs", "Robin Schulz", "Lost Frequencies", "Acraze", "CASSÖ",
  "Jax Jones", "Becky Hill", "Sigala", "Gorgon City", "Duke Dumont", "CamelPhat", "Eric Prydz", "Kygo", "Alesso", "HUGEL",
  "Imanbek", "Anyma", "Vintage Culture", "Notre Dame", "Ferreck Dawn", "Belters Only", "Armand Van Helden", "Shouse"];
const house = [];
for (const country of ["dk", "gb", "us", "nl", "de"]) {
  const list = country === "dk" ? dk : country === "gb" ? gb : (await json(MOST_PLAYED(country))).feed.results;
  house.push(...(await withPreviews(list.filter((s) => (s.genres || []).some((g) => HOUSE_GENRES.test(g.name))), country)));
}
for (const artist of HOUSE_ARTISTS) {
  try {
    const data = await json(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&attribute=artistTerm&country=dk&limit=12`);
    (data.results || [])
      .filter((r) => r.previewUrl && HOUSE_GENRES.test(r.primaryGenreName || "") && key(r.artistName).includes(key(artist)))
      .slice(0, 5)
      .forEach((r) => house.push({ t: r.trackName, a: r.artistName, art: bigArt(r.artworkUrl100), p: r.previewUrl }));
  } catch (err) {
    console.log(err.message);
  }
  await new Promise((r) => setTimeout(r, 3200)); // iTunes tillader ca. 20 opslag i minuttet
}
const houseFeed = (await json(HOUSE("dk"))).feed;
[].concat(houseFeed.entry || []).slice(0, 30).forEach((x) => {
  const preview = (x.link || []).find((l) => l.attributes && l.attributes["im:assetType"] === "preview");
  const images = x["im:image"] || [];
  if (preview) house.push({ t: x["im:name"].label, a: x["im:artist"].label, art: bigArt(images.length ? images[images.length - 1].label : ""), p: preview.attributes.href });
});

const result = { updated: new Date().toISOString(), dk: danish, en: english, house: unique(house) };
console.log(`Top dansk: ${result.dk.length}, Top engelsk: ${result.en.length}, Top house: ${result.house.length}`);
console.log("Danske:", result.dk.slice(0, 15).map((s) => `${s.a} - ${s.t}`).join("; "));
console.log("House:", result.house.slice(0, 25).map((s) => `${s.a} - ${s.t}`).join("; "));
console.log("Engelske:", result.en.slice(0, 10).map((s) => `${s.a} - ${s.t}`).join("; "));
if (result.dk.length < 10 || result.en.length < 10 || result.house.length < 10) throw new Error("For få sange; gemmer ikke");
fs.mkdirSync("music", { recursive: true });
fs.writeFileSync("music/top.json", JSON.stringify(result));
