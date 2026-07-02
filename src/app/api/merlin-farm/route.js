import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const ACCOUNTS_FILE =
  process.env.MERLIN_ACCOUNTS_FILE || join(DATA_DIR, "merlin-accounts.json");
const PROXIES_FILE = join(DATA_DIR, "merlin-proxies.json");
const CRED_FILE = join(DATA_DIR, "merlin-credentials.json");
const FB_KEY = process.env.FIREBASE_API_KEY || "";
const FB_IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";

function loadFile(path) {
  try {
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, "utf8"));
  } catch { return []; }
}
function saveFile(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function loadAccounts() { return loadFile(ACCOUNTS_FILE); }
function saveAccounts(data) { saveFile(ACCOUNTS_FILE, data); }
function loadProxies() { return loadFile(PROXIES_FILE); }
function saveProxies(data) { saveFile(PROXIES_FILE, data); }
function loadCreds() { return loadFile(CRED_FILE); }
function saveCreds(data) { saveFile(CRED_FILE, data); }

async function firebaseSignup(email, password) {
  const res = await fetch(`${FB_IDENTITY}:signUp?key=${FB_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.refreshToken;
}

async function firebaseSignin(email, password) {
  const res = await fetch(`${FB_IDENTITY}:signInWithPassword?key=${FB_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.refreshToken;
}

async function getRefreshToken(opts) {
  if (opts.refreshToken) return opts.refreshToken;
  if (!opts.email || !opts.password) throw new Error("email + password or refreshToken required");
  return opts.signup
    ? firebaseSignup(opts.email, opts.password)
    : firebaseSignin(opts.email, opts.password);
}

function genEmail() {
  const firsts = ["ali","amir","budi","citra","dewi","eko","fajar","gilang","hendra","indah","joko","kiki","lina","maya","nanda","okta","putri","qory","rizal","sari","tio","umi","vino","wulan","yoga","zahra"];
  const lasts = ["pratama","wijaya","kusuma","santoso","hartono","susanto","handoko","setiawan","gunawan","mahendra","pamungkas","saputra","permata","lestari","anggoro","purnomo"];
  const first = firsts[Math.floor(Math.random() * firsts.length)];
  const last = lasts[Math.floor(Math.random() * lasts.length)];
  const rnd = Math.floor(Math.random() * 9999) + 1;
  return `${first}.${last}${rnd}@gmail.com`;
}

function genPassword() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return `Fl${pw}!9`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const what = searchParams.get("type") || "accounts";

    if (what === "proxies") {
      return NextResponse.json({ proxies: loadProxies() });
    }

    if (what === "export") {
      const creds = loadCreds();
      const lines = ["email,password,chatId,key,proxy"];
      for (const c of creds) {
        lines.push([c.email || "", c.password || "", c.chatId || "", c.key || "", c.proxy || ""].join(","));
      }
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="merlin-accounts.csv"',
        },
      });
    }

    const accounts = loadAccounts().map((a, i) => ({
      index: i,
      chatId: a.chatId || "",
      proxy: a.proxy || "",
      hasRefresh: !!a.refreshToken,
    }));
    const creds = loadCreds();
    return NextResponse.json({
      accounts,
      creds,
      proxies: loadProxies(),
      file: ACCOUNTS_FILE,
      firebaseKey: !!FB_KEY,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, email, password, refreshToken, proxy } = body;

    if (action === "farm") {
      if (!FB_KEY) return NextResponse.json({ error: "FIREBASE_API_KEY not set" }, { status: 400 });
      const newEmail = email || genEmail();
      const newPass = password || genPassword();
      let proxyToUse = proxy || "";
      if (!proxyToUse) {
        const proxies = loadProxies();
        if (proxies.length > 0) proxyToUse = proxies[Math.floor(Math.random() * proxies.length)];
      }
      const rt = await firebaseSignup(newEmail, newPass);
      const key = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
      const account = { refreshToken: rt, chatId: randomUUID(), proxy: proxyToUse, key };
      const accounts = loadAccounts();
      accounts.push(account);
      saveAccounts(accounts);
      const creds = loadCreds();
      creds.push({ email: newEmail, password: newPass, chatId: account.chatId, proxy: proxyToUse, key });
      saveCreds(creds);
      return NextResponse.json({ ok: true, email: newEmail, password: newPass, proxy: proxyToUse, key, total: accounts.length }, { status: 201 });
    }

    if (action === "add") {
      if (!FB_KEY) return NextResponse.json({ error: "FIREBASE_API_KEY not set" }, { status: 400 });
      const rt = await getRefreshToken({ email, password, refreshToken, signup: body.signup });
      const proxyToUse = proxy || "";
      const key = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
      const account = { refreshToken: rt, chatId: randomUUID(), proxy: proxyToUse, key };
      const accounts = loadAccounts();
      accounts.push(account);
      saveAccounts(accounts);
      const creds = loadCreds();
      creds.push({ email: email || "(refresh)", password: password || "", chatId: account.chatId, proxy: proxyToUse, key });
      saveCreds(creds);
      return NextResponse.json({ ok: true, key, total: accounts.length }, { status: 201 });
    }

    if (action === "add-proxy") {
      if (!body.proxyUrl) return NextResponse.json({ error: "proxyUrl required" }, { status: 400 });
      const proxies = loadProxies();
      if (!proxies.includes(body.proxyUrl)) proxies.push(body.proxyUrl);
      saveProxies(proxies);
      return NextResponse.json({ ok: true, total: proxies.length }, { status: 201 });
    }

    if (action === "import-proxies") {
      if (!body.text) return NextResponse.json({ error: "text required" }, { status: 400 });
      const newProxies = body.text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      const proxies = loadProxies();
      for (const p of newProxies) { if (!proxies.includes(p)) proxies.push(p); }
      saveProxies(proxies);
      return NextResponse.json({ ok: true, added: newProxies.length, total: proxies.length }, { status: 201 });
    }

    if (action === "set-email-prefix") {
      const file = join(DATA_DIR, "merlin-farm-config.json");
      const config = loadFile(file);
      config.emailPrefix = body.prefix || "";
      saveFile(file, config);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const what = searchParams.get("type") || "accounts";
    const idx = parseInt(searchParams.get("index") || "-1", 10);

    if (what === "proxies") {
      if (idx < 0) return NextResponse.json({ error: "invalid index" }, { status: 400 });
      const proxies = loadProxies();
      proxies.splice(idx, 1);
      saveProxies(proxies);
      return NextResponse.json({ ok: true, total: proxies.length });
    }

    if (what === "credentials") {
      saveCreds([]);
      return NextResponse.json({ ok: true });
    }

    const accounts = loadAccounts();
    if (idx < 0 || idx >= accounts.length) {
      return NextResponse.json({ error: "invalid index" }, { status: 400 });
    }
    accounts.splice(idx, 1);
    saveAccounts(accounts);
    return NextResponse.json({ ok: true, total: accounts.length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
