import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const ACCOUNTS_FILE =
  process.env.MERLIN_ACCOUNTS_FILE || join(process.env.DATA_DIR || "/app/data", "merlin-accounts.json");
const FB_KEY = process.env.FIREBASE_API_KEY || "";
const FB_IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";
const FB_TOKEN = "https://securetoken.googleapis.com/v1/token";

function loadAccounts() {
  try {
    if (!existsSync(ACCOUNTS_FILE)) return [];
    const raw = readFileSync(ACCOUNTS_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  mkdirSync(dirname(ACCOUNTS_FILE), { recursive: true });
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

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

export async function GET() {
  try {
    const accounts = loadAccounts().map((a, i) => ({
      index: i,
      chatId: a.chatId || "",
      proxy: a.proxy || "",
      hasRefresh: !!a.refreshToken,
    }));
    return NextResponse.json({ accounts, file: ACCOUNTS_FILE, firebaseKey: !!FB_KEY });
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
      const rt = await firebaseSignup(newEmail, newPass);
      const account = { refreshToken: rt, chatId: randomUUID(), proxy: proxy || "" };
      const accounts = loadAccounts();
      accounts.push(account);
      saveAccounts(accounts);
      return NextResponse.json({ ok: true, email: newEmail, password: newPass, total: accounts.length }, { status: 201 });
    }

    if (action === "add") {
      if (!FB_KEY) return NextResponse.json({ error: "FIREBASE_API_KEY not set" }, { status: 400 });
      const rt = await getRefreshToken({ email, password, refreshToken, signup: body.signup });
      const account = { refreshToken: rt, chatId: randomUUID(), proxy: proxy || "" };
      const accounts = loadAccounts();
      accounts.push(account);
      saveAccounts(accounts);
      return NextResponse.json({ ok: true, total: accounts.length }, { status: 201 });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const idx = parseInt(searchParams.get("index") || "-1", 10);
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
