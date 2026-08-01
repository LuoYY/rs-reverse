/**
 * 176_cdp_closures.js
 *
 * 提取瑞数函数的 [[Scopes]] 闭包变量 → 找 basestr（64 字符含 - 不含 .）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
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
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(7000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(15000);

    // 找 window 上的函数（瑞数 _$xxx）
    const { result } = await cdp.send('Runtime.evaluate', { expression: `(function(){ var fs = []; for (var k in window) { if (k.indexOf('_$') === 0 && typeof window[k] === 'function') fs.push(k); } return fs.slice(0, 30); })()`, returnByValue: true });
    const funcs = result.value || [];
    console.log('window 上的 _$ 函数:', funcs.join(', '));

    const strCandidates = new Map();
    async function scanScopes(objectId) {
      try {
        const { result: props } = await cdp.send('Runtime.getProperties', { objectId, ownProperties: true });
        for (const p of props || []) {
          const v = p.value;
          if (!v) continue;
          if (v.type === 'string' && v.value && v.value.length >= 55 && v.value.length <= 95 && v.value.includes('-')) {
            strCandidates.set(v.value, (strCandidates.get(v.value) || 0) + 1);
          }
          if (v.type === 'object' && v.objectId) {
            // 递归一层
            try {
              const { result: p2 } = await cdp.send('Runtime.getProperties', { objectId: v.objectId, ownProperties: true });
              for (const p of p2 || []) {
                const v2 = p.value;
                if (v2 && v2.type === 'string' && v2.value && v2.value.length >= 55 && v2.value.length <= 95 && v2.value.includes('-')) {
                  strCandidates.set(v2.value, (strCandidates.get(v2.value) || 0) + 1);
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }

    // 对每个函数提取 [[Scopes]]
    for (const fn of funcs.slice(0, 8)) {
      try {
        const { result: fr } = await cdp.send('Runtime.evaluate', { expression: `window.${fn}`, returnByValue: false });
        if (fr.objectId) {
          const { result: props } = await cdp.send('Runtime.getProperties', { objectId: fr.objectId, ownProperties: true });
          for (const p of props || []) {
            if (p.name === '[[Scopes]]' && p.value && p.value.objectId) {
              const { result: scopes } = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
              for (const s of scopes || []) {
                if (s.value && s.value.objectId) await scanScopes(s.value.objectId);
              }
            }
          }
        }
      } catch (e) {}
    }

    console.log('闭包字符串候选:');
    const sorted = [...strCandidates.entries()].sort((a, b) => b[1] - a[1]);
    sorted.slice(0, 15).forEach(([s, c]) => console.log('  [' + c + '次] len=' + s.length, JSON.stringify(s)));

    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    console.log('P cookie 前 22:', pc ? pc.value.substring(0, 22) : '无');
    if (challenge && strCandidates.size) {
      fs.writeFileSync(path.join(OUT, 'cdp_closures_' + challenge.nsd + '.json'), JSON.stringify({ nsd: challenge.nsd, cd: challenge.cd, candidates: [...strCandidates.keys()], funcs, pCookie: pc ? pc.value : '' }));
      console.log('已保存');
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
