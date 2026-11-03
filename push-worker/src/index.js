// Flower: push-notifikationer fra en Cloudflare Worker.
// Kører hvert minut: logger ind som bot-kontoen, læser køen (pushQueue),
// sender til modtagernes telefoner (pushSubs) og sletter det sendte fra køen.
// Web Push krypteres her med WebCrypto (RFC 8291 og VAPID), så der ikke
// skal bruges ekstra biblioteker.

const API_KEY = "AIzaSyAGS0JZBnrk5ozRrSgmypds9dNnnoBriyo";
const PROJECT = "flower-438b9";
const VAPID_PUBLIC = "BCddMZ1dKlYPo9CdWxrjmrs1QyxwnmJ7gyQPWqDlkO-EOl96MrUSThl7oiB5LY4SiiqNewhoGXZLlECLP6fcLXI";
const VAPID_SUBJECT = "mailto:push@flower.app";
const REMINDER_HOUR = 20;
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Kun disse notifikationer sendes: "Smoker nu", venneanmodninger, nyt opslag,
// roll, munchies og smoke spot fra en ven, den daglige påmindelse og test-knappen.
const TEXT = {
  da: {
    smoking: (n) => [`${n} smoker nu 💨`, "Skal du med?"],
    request: (n) => ["Ny venneanmodning", `${n} vil gerne være venner`],
    post: (n, t) => [`${n} har lagt et nyt opslag op`, t || "Se det i Smoke Hub"],
    roll: (n) => [`${n} har delt en roll`, "Giv den en rating i Rate the Roll"],
    munchie: (n) => [`${n} har delt sine munchies`, "Se dem i Munchies"],
    spot: (n, t) => [`${n} har tilføjet et smoke spot`, t || "Se det på kortet"],
    reminder: () => ["Husk at logge din smoke 🌿", "Har du røget i dag? Log det i Flower"],
    test: () => ["Flower", "Notifikationer virker! 🎉"],
    many: (k) => ["Flower", `Du har ${k} nye notifikationer`],
  },
  en: {
    smoking: (n) => [`${n} is smoking now 💨`, "Want to join?"],
    request: (n) => ["New friend request", `${n} wants to be friends`],
    post: (n, t) => [`${n} shared a new post`, t || "See it in Smoke Hub"],
    roll: (n) => [`${n} shared a roll`, "Rate it in Rate the Roll"],
    munchie: (n) => [`${n} shared their munchies`, "See them in Munchies"],
    spot: (n, t) => [`${n} added a smoke spot`, t || "See it on the map"],
    reminder: () => ["Remember to log your smoke 🌿", "Did you smoke today? Log it in Flower"],
    test: () => ["Flower", "Notifications work! 🎉"],
    many: (k) => ["Flower", `You have ${k} new notifications`],
  },
};

// ---------- Små hjælpere til bytes og base64url ----------
const enc = new TextEncoder();

function b64urlToBytes(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes) {
  let bin = "";
  new Uint8Array(bytes).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  parts.forEach((p) => { out.set(p, i); i += p.length; });
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// ---------- VAPID: beviser over for push-tjenesten, at beskeden kommer fra Flower ----------
let vapidKey = null;

async function vapidHeader(endpoint, privateKey) {
  if (!vapidKey) {
    const pub = b64urlToBytes(VAPID_PUBLIC);
    vapidKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", d: privateKey, x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  }
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  })));
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidKey, enc.encode(unsigned));
  return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${VAPID_PUBLIC}`;
}

// ---------- Kryptering af selve beskeden (aes128gcm, RFC 8291) ----------
export async function encryptPayload(sub, payload) {
  const uaPublic = b64urlToBytes(sub.keys.p256dh);
  const authSecret = b64urlToBytes(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plain));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

async function sendPush(sub, payload, privateKey) {
  const body = await encryptPayload(sub, payload);
  return fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, privateKey),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body,
  });
}

// ---------- Firestore ----------
// Firestore REST giver værdier som { stringValue: "..." } osv.
function plain(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("mapValue" in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = plain(v);
    return out;
  }
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(plain);
  return undefined;
}

function fields(doc) {
  return plain({ mapValue: { fields: doc.fields || {} } });
}

async function signIn(env) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.PUSH_EMAIL.trim(), password: env.PUSH_PASSWORD, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error("Kunne ikke logge ind som bot: " + JSON.stringify(json.error || json));
  return json.idToken;
}

// ---------- Send til alle en brugers telefoner ----------
// makeMessages får teksterne på telefonens sprog og giver de beskeder, der skal sendes
async function sendToUser(api, env, uid, makeMessages, subs = null) {
  if (!subs) {
    const subRes = await api(`/pushSubs/${encodeURIComponent(uid)}`);
    if (!subRes.ok) return 0; // ingen telefon tilmeldt
    subs = fields(await subRes.json()).subs || {};
  }
  let sent = 0;
  for (const [key, sub] of Object.entries(subs)) {
    if (!sub || !sub.endpoint) continue;
    for (const msg of makeMessages(TEXT[sub.lang] || TEXT.da)) {
      const r = await sendPush(sub, JSON.stringify(msg), env.VAPID_PRIVATE);
      // Gem svaret fra Apple/Google på telefonen, så fejl kan findes bagefter
      const detail = r.ok ? "" : (await r.text()).slice(0, 200);
      if (r.status === 404 || r.status === 410) {
        // Telefonen er afmeldt: fjern den
        await api(`/pushSubs/${encodeURIComponent(uid)}?updateMask.fieldPaths=subs.${key}`, {
          method: "PATCH",
          body: JSON.stringify({ fields: {} }),
        });
        break;
      }
      await api(`/pushSubs/${encodeURIComponent(uid)}?updateMask.fieldPaths=subs.${key}.lastStatus&updateMask.fieldPaths=subs.${key}.lastAt&updateMask.fieldPaths=subs.${key}.lastError`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { subs: { mapValue: { fields: { [key]: { mapValue: { fields: {
          lastStatus: { integerValue: String(r.status) },
          lastAt: { integerValue: String(Date.now()) },
          lastError: { stringValue: detail },
        } } } } } } } }),
      });
      if (r.ok) sent++;
      else console.error("Push fejlede:", r.status, detail);
    }
  }
  return sent;
}

// Dansk tid lige nu: { date: "2026-11-03", hour: 20 }
function copenhagen(time = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(time)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// ---------- Daglig påmindelse kl. 20 (dansk tid) ----------
// Sendes til alle med en tilmeldt telefon, undtagen dem der allerede har logget i dag.
export async function remind(env) {
  if (copenhagen().hour !== REMINDER_HOUR) return "Ikke tid til påmindelse";
  const token = await signIn(env);
  const api = (path, options = {}) =>
    fetch(DOCS + path, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const res = await api("/pushSubs?pageSize=300");
  const body = await res.json();
  if (!res.ok) throw new Error("Kunne ikke læse pushSubs: " + JSON.stringify(body.error || body));
  const today = copenhagen().date;
  let sent = 0;
  for (const doc of body.documents || []) {
    const data = fields(doc);
    const uid = data.uid || doc.name.split("/").pop();
    // Har de logget en smoke i dag, får de ingen påmindelse
    const profile = await api(`/profiles/${encodeURIComponent(uid)}`);
    if (profile.ok) {
      const last = fields(await profile.json()).lastSmokeAt;
      if (last && copenhagen(last).date === today) continue;
    }
    sent += await sendToUser(api, env, uid, (L) => [{ title: L.reminder()[0], body: L.reminder()[1], tag: "reminder" }], data.subs || {});
  }
  return `Påmindelse sendt til ${sent} telefoner`;
}

// ---------- Selve arbejdet ----------
export async function run(env) {
  if (!env.PUSH_EMAIL || !env.PUSH_PASSWORD || !env.VAPID_PRIVATE) {
    return "Mangler secrets (PUSH_EMAIL, PUSH_PASSWORD, VAPID_PRIVATE)";
  }
  const token = await signIn(env);
  const api = (path, options = {}) =>
    fetch(DOCS + path, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });

  const res = await api("/pushQueue?pageSize=300");
  const body = await res.json();
  if (!res.ok) throw new Error("Kunne ikke læse køen: " + JSON.stringify(body.error || body));
  const queue = (body.documents || []).map((d) => ({ name: d.name, ...fields(d) }));
  if (!queue.length) return "Køen er tom";

  // Gruppér pr. modtager
  const byUser = new Map();
  for (const item of queue) {
    if (!item.to) continue;
    if (!byUser.has(item.to)) byUser.set(item.to, []);
    byUser.get(item.to).push(item);
  }

  let sent = 0;
  for (const [uid, items] of byUser) {
    items.sort((a, b) => a.createdAt - b.createdAt);
    // Typer, der ikke længere sendes (fx fra en gammel version af appen), springes over
    const known = items.filter((it) => TEXT.da[it.type] && it.type !== "many" && it.type !== "reminder");
    if (!known.length) continue;
    sent += await sendToUser(api, env, uid, (L) => (known.length > 3
      ? [{ title: L.many(known.length)[0], body: L.many(known.length)[1], tag: "many" }]
      : known.map((it) => {
        const [title, text] = L[it.type](it.fromName || "?", it.text || "");
        return { title, body: text, tag: `${it.type}-${it.ref || it.from || ""}` };
      })));
  }

  // Slet det sendte fra køen
  for (const item of queue) {
    await fetch(`https://firestore.googleapis.com/v1/${item.name}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }
  return `Sendt ${sent} notifikationer (${queue.length} i køen)`;
}

export default {
  // Hvert minut: send køen. Kl. 18 og 19 UTC: tjek om det er kl. 20 i Danmark (vinter- og sommertid)
  async scheduled(event, env, ctx) {
    const job = event.cron === "* * * * *" ? run(env) : remind(env);
    ctx.waitUntil(job.then((msg) => console.log(msg)).catch((error) => console.error(error.message || error)));
  },
  // Åbner man Worker'ens adresse, ser man bare, at den kører
  async fetch() {
    return new Response("Flower push kører");
  },
};
