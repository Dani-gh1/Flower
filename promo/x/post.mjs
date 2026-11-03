// Poster det næste opslag fra promo/x/queue til X og flytter det til promo/x/posted.
// Et opslag er en .txt-fil (teksten) og evt. en .mp4 med samme navn. De tages i navne-rækkefølge.
// Kræver repo-secrets: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN og X_ACCESS_SECRET.
import { readdirSync, readFileSync, existsSync, renameSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { TwitterApi } from "twitter-api-v2";

const dir = new URL(".", import.meta.url).pathname;
const queue = join(dir, "queue");
const posted = join(dir, "posted");

// Mellemrum og linjeskift fra kopiering fjernes
const [X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET] =
  ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"].map((k) => (process.env[k] || "").trim());
const missing = Object.entries({ X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET }).filter(([, v]) => !v).map(([k]) => k);
if (missing.length === 4) {
  console.log("::warning::Tilføj X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN og X_ACCESS_SECRET under Settings → Secrets → Actions");
  process.exit(0);
}
if (missing.length) {
  console.log(`::error::Mangler ${missing.join(", ")} under Settings → Secrets → Actions`);
  process.exit(1);
}

const next = readdirSync(queue).filter((f) => f.endsWith(".txt")).sort()[0];
if (!next) {
  console.log("::warning::Køen i promo/x/queue er tom");
  process.exit(0);
}
const name = next.slice(0, -4);
const text = readFileSync(join(queue, next), "utf8").trim();
if ([...text].length > 280) throw new Error(`${next} er over 280 tegn`);
// Opslag med links koster ca. 13 gange mere på X, så linket står i profilens bio i stedet
if (/https?:\/\/|\bwww\.|\.(com|io|app|dk)\b/i.test(text)) throw new Error(`${next} indeholder et link: skriv "Link in bio" i stedet`);

const client = new TwitterApi({
  appKey: X_API_KEY,
  appSecret: X_API_SECRET,
  accessToken: X_ACCESS_TOKEN,
  accessSecret: X_ACCESS_SECRET,
});

// Tjek nøglerne først, så en fejl siger, om det er login eller upload, der fejler
try {
  const { data: me } = await client.v2.me();
  console.log(`Logget ind som @${me.username}`);
} catch (e) {
  // Vis kun længde og form, aldrig selve nøglerne (normalt ca. 25, 50, 50 og 45 tegn)
  const shape = (v) => `${v.length} tegn${/\s/.test(v) ? ", har mellemrum" : ""}`;
  console.log(`X_API_KEY: ${shape(X_API_KEY)}`);
  console.log(`X_API_SECRET: ${shape(X_API_SECRET)}`);
  console.log(`X_ACCESS_TOKEN: ${shape(X_ACCESS_TOKEN)}${/^\d+-/.test(X_ACCESS_TOKEN) ? "" : ", ligner ikke et Access Token (skal starte med tal og bindestreg)"}`);
  console.log(`X_ACCESS_SECRET: ${shape(X_ACCESS_SECRET)}`);
  console.log(`::error::X afviste nøglerne (${e.code}). Tjek de fire secrets: rigtige værdier i rigtige felter, ingen mellemrum, og at Access Token er lavet efter "Read and write" og efter sidste Consumer Key.`);
  process.exit(1);
}

const payload = {};
const video = join(queue, name + ".mp4");
if (existsSync(video)) {
  const mediaId = await client.v2.uploadMedia(readFileSync(video), { media_type: "video/mp4" });
  payload.media = { media_ids: [mediaId] };
}
const { data } = await client.v2.tweet(text, payload);
const url = `https://x.com/i/status/${data.id}`;
console.log(`Postet ${name}: ${url}`);

renameSync(join(queue, next), join(posted, next));
if (existsSync(video)) renameSync(video, join(posted, name + ".mp4"));
appendFileSync(join(posted, "log.md"), `- ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${name} · ${url}\n`);
