// Diagnose af push-notifikationer. Køres af GitHub Actions (diag.yml) og
// skriver en rapport uden personlige oplysninger (ingen navne, id'er eller beskeder).
// Kørsel nr. 5
const API_KEY = "AIzaSyAGS0JZBnrk5ozRrSgmypds9dNnnoBriyo";
const DOCS = "https://firestore.googleapis.com/v1/projects/flower-438b9/databases/(default)/documents";
const { PUSH_EMAIL, PUSH_PASSWORD, CF_TOKEN, CF_ACCOUNT } = process.env;
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
const ago = (t) => (t ? `${Math.round((Date.now() - t) / 60000)} min siden` : "ukendt");

function plain(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  return undefined;
}

log(`Tidspunkt: ${new Date().toISOString()}`);
const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: (PUSH_EMAIL || "").trim(), password: PUSH_PASSWORD || "", returnSecureToken: true }),
}).then((r) => r.json());
log(`Bot-login: ${login.idToken ? "OK" : "FEJL " + JSON.stringify(login.error && login.error.message)}`);

if (login.idToken) {
  const auth = { headers: { Authorization: `Bearer ${login.idToken}` } };
  const q = await fetch(`${DOCS}/pushQueue?pageSize=300`, auth);
  const qj = await q.json();
  if (!q.ok) log(`pushQueue: FEJL ${q.status} ${JSON.stringify(qj.error && qj.error.message)}`);
  else {
    const docs = (qj.documents || []).map((d) => plain({ mapValue: { fields: d.fields } }));
    const oldest = docs.reduce((m, d) => Math.min(m, d.createdAt || Infinity), Infinity);
    log(`pushQueue: ${docs.length} i køen${docs.length ? `, ældste ${ago(oldest)}, typer: ${[...new Set(docs.map((d) => d.type))].join(", ")}` : ""}`);
    if (docs.length && Date.now() - oldest > 3 * 60000) log("  ⚠️ Der ligger gamle beskeder i køen: Cloudflare-afsenderen kører ikke eller fejler");
  }
  const s = await fetch(`${DOCS}/pushSubs?pageSize=300`, auth);
  const sj = await s.json();
  if (!s.ok) log(`pushSubs: FEJL ${s.status} ${JSON.stringify(sj.error && sj.error.message)}`);
  else {
    const docs = (sj.documents || []).map((d) => plain({ mapValue: { fields: d.fields } }));
    log(`pushSubs: ${docs.length} brugere har tilmeldt en telefon`);
    docs.forEach((d, i) => {
      Object.values(d.subs || {}).forEach((sub) => {
        let host = "?";
        try { host = new URL(sub.endpoint).host; } catch {}
        log(`  bruger ${i + 1}: ${host}, sprog ${sub.lang}, tilmeldt ${ago(sub.at)}, nøgler ${sub.keys && sub.keys.p256dh && sub.keys.auth ? "OK" : "MANGLER"}`
          + (sub.lastAt ? `, sidst sendt ${ago(sub.lastAt)} → svar ${sub.lastStatus}${sub.lastError ? " " + sub.lastError : ""}` : ", intet sendt endnu (efter logning blev slået til)"));
      });
    });
  }
}

if (CF_TOKEN && CF_ACCOUNT) {
  const cf = (path, opt = {}) => fetch(`https://api.cloudflare.com/client/v4${path}`, { ...opt, headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" } }).then((r) => r.json());
  const sched = await cf(`/accounts/${CF_ACCOUNT}/workers/scripts/flower-push/schedules`);
  log(`Cloudflare cron: ${sched.success ? JSON.stringify(sched.result.schedules.map((x) => x.cron)) : "FEJL " + JSON.stringify(sched.errors)}`);
  const since = new Date(Date.now() - 6 * 3600000).toISOString();
  const gql = await cf(`/graphql`, { method: "POST", body: JSON.stringify({ query: `{ viewer { accounts(filter: {accountTag: "${CF_ACCOUNT}"}) { workersInvocationsAdaptive(limit: 20, filter: {scriptName: "flower-push", datetime_geq: "${since}"}) { sum { requests errors } dimensions { status } } } } }` }) });
  const inv = gql && gql.data && gql.data.viewer.accounts[0] && gql.data.viewer.accounts[0].workersInvocationsAdaptive;
  log(`Cloudflare kørsler sidste 6 timer: ${inv ? JSON.stringify(inv.map((x) => ({ status: x.dimensions.status, antal: x.sum.requests, fejl: x.sum.errors }))) : "kunne ikke læses " + JSON.stringify(gql.errors || gql).slice(0, 300)}`);
}

import fs from "fs";
fs.writeFileSync("push-diagnose.txt", lines.join("\n") + "\n");
