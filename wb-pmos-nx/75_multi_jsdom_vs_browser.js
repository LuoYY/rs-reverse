/**
 * 75_multi_jsdom_vs_browser.js
 *
 * 多会话 jsdom vs 浏览器 keys 对比（同 cd 权威对照）
 * 目标：找 jsdom keys 与浏览器 keys 的确定性关系（XOR/变换）
 * 方法：同一 nsd/cd → jsdom 数组陷阱抓 keys + Patchright 注入同 cd 抓浏览器 keys
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM } = require('jsdom');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function httpGet(url, timeout = 60000) {
  return new Promise(r => {
    const req = https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', (e) => r({ status: 'ERR', body: '', headers: {}, error: e.message }));
    req.setTimeout(timeout, () => { req.destroy(); r({ status: 'TIMEOUT', body: '', headers: {} }); });
  });
}

/** jsdom 数组陷阱抓 keys（同 cd）——Array + Uint8Array 双陷阱 */
async function jsdomKeys(nsd, cd) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  // 数组陷阱：抓 16/48 字节全字节数组（Array + Uint8Array）
  const found = [];
  const rec = (arr) => {
    if (!arr || typeof arr !== 'object') return;
    const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
    if (!a) return;
    if (a.length !== 16 && a.length !== 48) return;
    if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
    if (found.length < 100) found.push(a);
  };
  for (const C of [window.Array, window.Uint8Array]) {
    if (!C) continue;
    for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
      const o = C.prototype[m];
      if (typeof o === 'function') C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
    }
  }
  const origPush = Array.prototype.push;
  Array.prototype.push = function () { rec(this); rec(Array.prototype.slice.call(arguments)); return origPush.apply(this, arguments); };
  const origFrom = window.Array.from;
  if (origFrom) window.Array.from = function () { const r = origFrom.apply(this, arguments); rec(r); return r; };
  try {
    window.eval(fs.readFileSync(OUTER_JS, 'utf8'));
    await new Promise(r => setTimeout(r, 10000));
  } catch (e) {}
  window.close();
  return found;
}

/** 从 16/48 数组集合识别 keys16/keys17/keys2 */
function identifyKeys(arrs) {
  const count16 = {}, count48 = {};
  for (const a of arrs) {
    const key = a.join(',');
    if (a.length === 16) count16[key] = (count16[key] || 0) + 1;
    if (a.length === 48) count48[key] = (count48[key] || 0) + 1;
  }
  // keys16：出现最多的 16 字节（站点常量）
  const top16 = Object.entries(count16).sort((a, b) => b[1] - a[1]);
  const keys16 = top16[0] ? top16[0][0].split(',').map(Number) : null;
  // keys17：非 keys16 的 16 字节
  const keys17 = top16.filter(([k]) => k !== (top16[0] || [])[0]).map(([k]) => k.split(',').map(Number))[0] || null;
  // keys2：48 字节
  const keys2 = Object.entries(count48).sort((a, b) => b[1] - a[1])[0] ? Object.entries(count48).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number) : null;
  return { keys16, keys17, keys2, counts: { c16: Object.keys(count16).length, c48: Object.keys(count48).length } };
}

/** 浏览器数组陷阱抓 keys（自然 cd）——返回 { keys, challenge } */
async function browserKeys(browser, nsdCd) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  // 注入数组陷阱（不注入 $_ts，浏览器自然跑）
  await context.addInitScript(() => {
    const found = [];
    window.__arrs = found;
    const rec = (arr) => {
      if (!arr || typeof arr !== 'object') return;
      const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
      if (!a) return;
      if ((a.length === 16 || a.length === 48) && a.every(b => typeof b === 'number' && b >= 0 && b <= 255) && found.length < 100) found.push(a);
    };
    for (const C of [Array, Uint8Array]) {
      if (!C) continue;
      for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
        const o = C.prototype[m];
        if (typeof o === 'function') C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
      }
    }
    const of = Array.from;
    if (of) Array.from = function () { const r = of.apply(this, arguments); rec(r); return r; };
  });
  const page = await context.newPage();
  let challenge = null;
  page.on('response', async (resp) => {
    if (resp.status() === 412 && !challenge) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
      } catch (e) {}
    }
  });
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(12000);
  await page.evaluate(() => { try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.setRequestHeader('Content-Type', 'application/json'); x.send('{}'); } catch (e) {} }).catch(() => {});
  await page.waitForTimeout(1000);
  const brArrs = await page.evaluate(() => window.__arrs).catch(() => []);
  const keys = identifyKeys(brArrs || []);
  await context.close();
  return { keys, challenge, count: (brArrs || []).length };
}

async function main() {
  const nSessions = parseInt(process.argv[2] || '3');
  const sessions = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    for (let si = 0; si < nSessions; si++) {
      console.log(`\n===== 会话 ${si} =====`);
      // 1. 浏览器先跑（自然 cd）→ 抓浏览器 keys + challenge
      const br = await browserKeys(browser);
      console.log('浏览器 nsd:', br.challenge ? br.challenge.nsd : '无', '数组:', br.count, '个');
      console.log('浏览器 keys2:', br.keys.keys2 ? br.keys.keys2.slice(0, 8).map(b => b.toString(16)).join(' ') : '无');
      if (!br.challenge || !br.keys.keys2) { console.log('浏览器数据不完整，跳过'); continue; }
      const { nsd, cd } = br.challenge;

      // 2. jsdom 喂浏览器 cd → jsdom keys
      const jsArrs = await jsdomKeys(nsd, cd);
      const jsK = identifyKeys(jsArrs);
      console.log('jsdom keys2:', jsK.keys2 ? jsK.keys2.slice(0, 8).map(b => b.toString(16)).join(' ') : '无');

      sessions.push({ si, nsd, cdLen: cd.length, jsdom: jsK, browser: br.keys });
    }
  } finally {
    await browser.close();
  }
  // 保存
  const fname = path.join(OUT, 'multi_jsdom_browser_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(sessions, null, 2));
  console.log('\n已保存:', fname);

  // 4. 对比分析
  console.log('\n===== jsdom vs 浏览器 keys 对比 =====');
  for (const s of sessions) {
    const j = s.jsdom, b = s.browser;
    console.log(`\n会话 ${s.si} (nsd=${s.nsd})`);
    if (j.keys2 && b.keys2) {
      const same = j.keys2.length === b.keys2.length && j.keys2.every((v, i) => v === b.keys2[i]);
      console.log('keys2 相同:', same ? 'YES' : 'NO');
      if (!same) {
        console.log('  jsdom  :', j.keys2.slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(' '));
        console.log('  浏览器 :', b.keys2.slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(' '));
        console.log('  XOR    :', j.keys2.slice(0, 8).map((x, i) => (x ^ b.keys2[i]).toString(16).padStart(2, '0')).join(' '));
      }
    } else console.log('  keys2 缺失: jsdom=' + !!j.keys2 + ' browser=' + !!b.keys2);
    if (j.keys16 && b.keys16) {
      console.log('keys16 相同:', j.keys16.every((v, i) => v === b.keys16[i]) ? 'YES' : 'NO');
    }
    if (j.keys17 && b.keys17) {
      console.log('keys17 相同:', j.keys17.every((v, i) => v === b.keys17[i]) ? 'YES' : 'NO');
      if (!j.keys17.every((v, i) => v === b.keys17[i])) {
        console.log('  jsdom  :', j.keys17.slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(' '));
        console.log('  浏览器 :', b.keys17.slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(' '));
      }
    }
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
