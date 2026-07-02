#!/usr/bin/env node
'use strict';

// Proxy checker & rotator untuk Merlin farming.
// Tes tiap proxy → tandai yg mati → buang dari pool.
//
// Pemakaian:
//   node proxy-check.js [proxies.txt]        tes semua proxy (default: ./proxies.txt)
//   node proxy-check.js --json               output hasil sebagai JSON
//   node proxy-check.js --clean              hapus proxy mati dari file

const fs = require('node:fs');
const { ProxyAgent, fetch } = require('undici');

const TEST_URL = 'https://www.google.com';
const TIMEOUT = 10000;
const PROXYFILE = process.argv.find(a => a.endsWith('.txt')) || './proxies.txt';
const wantJson = process.argv.includes('--json');
const doClean = process.argv.includes('--clean');

function loadProxies() {
  if (!fs.existsSync(PROXYFILE)) return [];
  return fs.readFileSync(PROXYFILE, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

async function checkProxy(proxy) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const agent = new ProxyAgent({ uri: proxy });
    const res = await fetch(TEST_URL, {
      method: 'GET',
      dispatcher: agent,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    return { proxy, ok: res.ok, status: res.status, latency: ms };
  } catch (e) {
    return { proxy, ok: false, error: e.message };
  }
}

async function main() {
  const proxies = loadProxies();
  console.error(`[proxy-check] testing ${proxies.length} proxies...\n`);

  const results = [];
  for (let i = 0; i < proxies.length; i++) {
    const r = await checkProxy(proxies[i]);
    results.push(r);
    const icon = r.ok ? '\x1b[32mOK\x1b[0m' : '\x1b[31mDEAD\x1b[0m';
    const host = proxies[i].replace(/https?:\/\/([^@]*@)?/, '').split(':')[0];
    if (wantJson) {
      console.error(`  [${i + 1}/${proxies.length}] ${icon} ${host} (${r.latency || r.error || '?'})`);
    } else {
      console.log(`${r.ok ? 'OK' : 'DEAD'} ${host} ${r.latency ? r.latency + 'ms' : r.error || '?'}`);
    }
  }

  const alive = results.filter(r => r.ok);
  const dead = results.filter(r => !r.ok);
  const avg = alive.length ? Math.round(alive.reduce((s, r) => s + (r.latency || 0), 0) / alive.length) : 0;

  if (wantJson) {
    console.log(JSON.stringify({ total: proxies.length, alive: alive.length, dead: dead.length, avgLatency: avg, results }, null, 2));
  } else {
    console.error(`\n[proxy-check] ${alive.length}/${proxies.length} alive | avg latency: ${avg}ms | dead: ${dead.map(d => d.proxy.replace(/https?:\/\/([^@]*@)?/, '').split(':')[0]).join(', ')}`);
  }

  if (doClean && dead.length > 0) {
    const aliveLines = alive.map(r => r.proxy);
    fs.writeFileSync(PROXYFILE, aliveLines.join('\n') + '\n');
    console.error(`[proxy-check] cleaned ${dead.length} dead proxies from ${PROXYFILE}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
