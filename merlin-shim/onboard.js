'use strict';

// Onboarder akun Merlin -> entry MERLIN_ACCOUNTS (headless, via Firebase REST).
//
// Pemakaian:
//   node onboard.js --email X --password Y            (login akun email/pass)
//   node onboard.js --signup --email X --password Y   (bikin akun baru email/pass)
//   node onboard.js --refresh <refreshToken>          (akun Google: token dari bookmarklet)
// Opsi:
//   --env /path/.env     append ke MERLIN_ACCOUNTS di file .env (shim mode)
//   --file /path/merlin-accounts.json  append ke JSON array file (native 9router mode — tanpa env)
//   --test               kirim 1 pesan uji (sekaligus bikin thread via root-branch)

const fs = require('node:fs');
const crypto = require('node:crypto');
const { ProxyAgent, fetch } = require('undici'); // fetch undici: sepasang dgn ProxyAgent

const FB = process.env.FIREBASE_API_KEY || 'AIzaSyAvCgtQ4XbmlQGIynDT-v_M8eLaXrKmtiM';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const UNIFIED = 'https://www.getmerlin.in/arcane/api/v2/thread/unified';

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (n) => process.argv.includes(n);

// Proxy opsional (--proxy URL atau ONBOARD_PROXY); kosong = koneksi langsung.
const PROXY = arg('--proxy') || process.env.ONBOARD_PROXY || '';
const dispatcher = PROXY ? new ProxyAgent(PROXY) : undefined;

async function identity(method, body) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${FB}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
    dispatcher,
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j;
}

async function getRefreshToken() {
  const refresh = arg('--refresh');
  if (refresh) return refresh;
  const email = arg('--email');
  const password = arg('--password');
  if (!email || !password) {
    throw new Error('butuh --email + --password, atau --refresh <token>');
  }
  const method = has('--signup') ? 'signUp' : 'signInWithPassword';
  const j = await identity(method, { email, password });
  return j.refreshToken;
}

async function refreshToIdToken(refreshToken) {
  const url = `https://securetoken.googleapis.com/v1/token?key=${FB}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
    dispatcher,
  });
  const j = await res.json();
  if (!j.id_token) throw new Error('refresh gagal: ' + JSON.stringify(j).slice(0, 150));
  return j.id_token;
}

// Kirim 1 pesan uji (parentId "root" → bikin thread + isolasi konteks).
async function testMessage(idToken, chatId) {
  const body = {
    attachments: [],
    chatId,
    language: 'AUTO',
    message: {
      childId: crypto.randomUUID(),
      id: crypto.randomUUID(),
      content: 'Say only: ONBOARD OK',
      context: '',
      parentId: 'root',
    },
    mode: 'UNIFIED_CHAT',
    model: 'gemini-2.5-flash-lite',
    metadata: {
      noTask: true, isWebpageChat: false, deepResearch: false,
      webAccess: false, proFinderMode: false,
      mcpConfig: { isEnabled: false }, merlinMagic: false,
    },
  };
  const res = await fetch(UNIFIED, {
    method: 'POST',
    headers: {
      accept: 'text/event-stream', 'content-type': 'application/json',
      authorization: `Bearer ${idToken}`, 'x-merlin-version': 'web-merlin',
      'user-agent': UA,
    },
    body: JSON.stringify(body),
    dispatcher,
  });
  const txt = await res.text();
  if (txt.includes('event: error')) throw new Error('Merlin tolak akun ini');
  return txt;
}

function appendToEnv(envPath, account) {
  const src = fs.readFileSync(envPath, 'utf8');
  const lines = src.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('MERLIN_ACCOUNTS='));
  let list = [];
  if (idx >= 0) {
    try { list = JSON.parse(lines[idx].slice('MERLIN_ACCOUNTS='.length)); } catch {}
  }
  if (list.some((a) => a.refreshToken === account.refreshToken)) {
    throw new Error('akun (refreshToken sama) sudah ada di .env');
  }
  list.push(account);
  const line = 'MERLIN_ACCOUNTS=' + JSON.stringify(list);
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  fs.writeFileSync(envPath, lines.join('\n'));
}

function appendToFile(filePath, account) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
  if (!Array.isArray(list)) list = [];
  if (list.some((a) => a.refreshToken === account.refreshToken)) {
    throw new Error('akun (refreshToken sama) sudah ada di file');
  }
  list.push(account);
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
}

async function main() {
  const refreshToken = await getRefreshToken();
  const account = {
    refreshToken,
    chatId: crypto.randomUUID(),
    key: crypto.randomBytes(16).toString('hex'), // kunci 9router per-akun
  };
  if (PROXY) account.proxy = PROXY; // runtime shim ikut lewat proxy ini

  if (has('--test')) {
    const idToken = await refreshToIdToken(refreshToken);
    await testMessage(idToken, account.chatId);
    console.error('[onboard] uji OK — akun valid & thread dibuat');
  }

  const envPath = arg('--env');
  const filePath = arg('--file');
  if (envPath) {
    appendToEnv(envPath, account);
    console.error(`[onboard] ditambahkan ke ${envPath} — restart container shim.`);
    console.log('KEY=' + account.key); // stdout: kode 9router per-akun (dibaca skrip bulk)
  } else if (filePath) {
    appendToFile(filePath, account);
    console.error(`[onboard] ditambahkan ke ${filePath} — ${PROXY ? 'pakai proxy ' + PROXY : 'koneksi langsung'}.`);
    console.log('KEY=' + account.key);
  } else {
    console.log(JSON.stringify(account));
  }
}

main().catch((e) => {
  console.error('[onboard] GAGAL:', e.message);
  process.exit(1);
});
