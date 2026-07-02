#!/usr/bin/env node
'use strict';

// Generate random realistic Gmail addresses for Merlin farming.
//
// Pemakaian:
//   node gen-email.js [count]        cetak N email ke stdout (default 1)
//   node gen-email.js --loop [delay]  stream email tanpa henti tiap N detik
//   node gen-email.js --prefix mybot  pakai prefix custom

const crypto = require('node:crypto');

const FIRSTS = [
  'ali', 'amir', 'budi', 'citra', 'dewi', 'eko', 'fajar', 'gilang',
  'hendra', 'indah', 'joko', 'kiki', 'lina', 'maya', 'nanda', 'okta',
  'putri', 'qory', 'rizal', 'sari', 'tio', 'umi', 'vino', 'wulan',
  'yoga', 'zahra', 'adit', 'bella', 'cahyo', 'dina',
  'alex', 'brian', 'chris', 'david', 'emma', 'frank', 'grace', 'henry',
  'ivan', 'jack', 'kate', 'leo', 'mia', 'noah', 'olivia', 'paul',
  'quin', 'rose', 'sam', 'tina', 'vince',
];

const LASTS = [
  'pratama', 'wijaya', 'kusuma', 'santoso', 'hartono', 'susanto',
  'handoko', 'setiawan', 'gunawan', 'mahendra', 'pamungkas',
  'saputra', 'permata', 'lestari', 'anggoro', 'purnomo',
  'johnson', 'smith', 'brown', 'davis', 'miller', 'wilson',
  'moore', 'taylor', 'anderson', 'thomas', 'jackson', 'white',
  'harris', 'martin', 'lee', 'perez', 'thompson',
];

const DOMAINS = [
  'gmail.com', 'gmail.com', 'gmail.com', 'gmail.com',  // 80% Gmail
  'outlook.com',
  'yahoo.com',
];

function pick(arr) {
  return arr[crypto.randomInt(0, arr.length)];
}

function genEmail(prefix) {
  const first = pick(FIRSTS);
  const last = pick(LASTS);
  const domain = pick(DOMAINS);
  const rnd = crypto.randomInt(10, 9999);
  const name = prefix || first;
  const mid = crypto.randomInt(0, 3) === 0 ? '' : `${crypto.randomInt(1, 99)}`;
  const sep = ['.', '', '_'][crypto.randomInt(0, 3)];
  const variants = [
    `${name}${sep}${last}${mid}@${domain}`,
    `${name}${rnd}@${domain}`,
    `${name}${sep}${last}${rnd}@${domain}`,
    `${last}${sep}${name}${mid}@${domain}`,
  ];
  return pick(variants);
}

function genPassword() {
  const upper = String.fromCharCode(65 + crypto.randomInt(0, 26));
  const hex = crypto.randomBytes(4).toString('hex');
  const sym = '!@#$%'[crypto.randomInt(0, 5)];
  return `${upper}${hex}${sym}Flv`;
}

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (n) => process.argv.includes(n);

const prefix = arg('--prefix') || '';
const count = parseInt(arg('--count') || process.argv[2] || '1', 10);
const loop = has('--loop');
const delay = parseInt(arg('--delay') || arg('--loop') || process.argv[3] || '30', 10);

if (loop) {
  let n = 0;
  const tick = () => {
    const email = genEmail(prefix);
    const pass = genPassword();
    console.log(`${email},${pass}`);
    n++;
    if (n % 10 === 0) console.error(`[gen-email] ${n} generated`);
    setTimeout(tick, delay * 1000);
  };
  tick();
  process.on('SIGINT', () => { console.error(`\n[gen-email] stopped after ${n}`); process.exit(0); });
} else {
  const fmt = has('--csv');
  for (let i = 0; i < count; i++) {
    const email = genEmail(prefix);
    if (fmt) console.log(`${email},${genPassword()}`);
    else console.log(email);
  }
}
