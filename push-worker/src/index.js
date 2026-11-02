// Flower: push-notifikationer fra en Cloudflare Worker.
// Kører hvert minut: logger ind som bot-kontoen, læser køen (pushQueue),
// sender til modtagernes telefoner (pushSubs) og sletter det sendte fra køen.
// Web Push krypteres her med WebCrypto (RFC 8291 og VAPID), så der ikke
// skal bruges ekstra biblioteker.

const API_KEY = "AIzaSyAGS0JZBnrk5ozRrSgmypds9dNnnoBriyo";
const PROJECT = "flower-438b9";
const VAPID_PUBLIC = "BCddMZ1dKlYPo9CdWxrjmrs1QyxwnmJ7gyQPWqDlkO-EOl96MrUSThl7oiB5LY4SiiqNewhoGXZLlECLP6fcLXI";
const VAPID_SUBJECT = "mailto:push@flower.app";
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const TEXT = {
  da: {
    chat: (n, t) => [n, t],
    request: (n) => ["Ny venneanmodning", `${n} vil gerne være venner`],
    accepted: (n) => ["I er nu venner", `${n} har accepteret din venneanmodning`],
    sesh: (n, t) => ["Sesh-invitation", `${n} inviterer til en sesh${t ? ` · ${t}` : ""}`],
    cheer: (n) => ["Du får et hep", `${n} hepper på din pause. Bliv ved!`],
    comment: (n, t) => [`${n} kommenterede dit opslag`, t],
    mention: (n, t) => [`${n} nævnte dig`, t],
    many: (k) => ["Flower", `Du har ${k} nye notifikationer`],
    test: () => ["Flower", "Notifikationer virker! 🎉"],
  },
  en: {
    chat: (n, t) => [n, t],
    request: (n) => ["New friend request", `${n} wants to be friends`],
    accepted: (n) => ["You're now friends", `${n} accepted your friend request`],
    sesh: (n, t) => ["Sesh invite", `${n} invites you to a sesh${t ? ` · ${t}` : ""}`],
    cheer: (n) => ["You got a cheer", `${n} is cheering on your break. Keep going!`],
    comment: (n, t) => [`${n} commented on your post`, t],
    mention: (n, t) => [`${n} mentioned you`, t],
    many: (k) => ["Flower", `You have ${k} new notifications`],
    test: () => ["Flower", "Notifications work! 🎉"],
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
    const subRes = await api(`/pushSubs/${encodeURIComponent(uid)}`);
    if (!subRes.ok) continue; // ingen telefon tilmeldt
    const subs = fields(await subRes.json()).subs || {};
    items.sort((a, b) => a.createdAt - b.createdAt);
    for (const [key, sub] of Object.entries(subs)) {
      const L = TEXT[sub.lang] || TEXT.da;
      // Højst 3 enkelte notifikationer; flere bliver samlet til én
      const messages = items.length > 3
        ? [{ title: L.many(items.length)[0], body: L.many(items.length)[1], tag: "many" }]
        : items.map((it) => {
          const [title, text] = (L[it.type] || L.mention)(it.fromName || "?", it.text || "");
          return { title, body: text, tag: it.type === "chat" ? `chat-${it.ref}` : undefined };
        });
      for (const msg of messages) {
        const r = await sendPush(sub, JSON.stringify(msg), env.VAPID_PRIVATE);
        // Gem svaret fra Apple/Google på telefonen, så fejl kan findes bagefter
        const detail = r.ok ? "" : (await r.text()).slice(0, 200);
        if (r.status !== 404 && r.status !== 410) {
          await api(`/pushSubs/${encodeURIComponent(uid)}?updateMask.fieldPaths=subs.${key}.lastStatus&updateMask.fieldPaths=subs.${key}.lastAt&updateMask.fieldPaths=subs.${key}.lastError`, {
            method: "PATCH",
            body: JSON.stringify({ fields: { subs: { mapValue: { fields: { [key]: { mapValue: { fields: {
              lastStatus: { integerValue: String(r.status) },
              lastAt: { integerValue: String(Date.now()) },
              lastError: { stringValue: detail },
            } } } } } } } }),
          });
        }
        if (r.ok) {
          sent++;
        } else if (r.status === 404 || r.status === 410) {
          // Telefonen er afmeldt: fjern den
          await api(`/pushSubs/${encodeURIComponent(uid)}?updateMask.fieldPaths=subs.${key}`, {
            method: "PATCH",
            body: JSON.stringify({ fields: {} }),
          });
          break;
        } else {
          console.error("Push fejlede:", r.status, detail);
        }
      }
    }
  }

  // Slet det sendte fra køen
  for (const item of queue) {
    await fetch(`https://firestore.googleapis.com/v1/${item.name}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }
  return `Sendt ${sent} notifikationer (${queue.length} i køen)`;
}

export default {
  // Hvert minut (se wrangler.toml)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env).then((msg) => console.log(msg)).catch((error) => console.error(error.message || error)));
  },
  // Åbner man Worker'ens adresse, ser man bare, at den kører
  async fetch() {
    return new Response("Flower push kører");
  },
};
