/**
 * 76_jsdom_vs_sync.js
 *
 * 用 sync 会话（浏览器 keys 已知，同 cd）跑 jsdom 数组陷阱
 * → 对比 jsdom keys2 vs 浏览器 keys2（同 cd）
 * 找确定性关系（XOR/变换/哈希）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

async function jsdomKeys(nsd, cd) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  const found = [];
  const rec = (arr) => {
    if (!arr || typeof arr !== 'object') return;
    const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
    if (!a) return;
    if (a.length !== 16 && a.length !== 48) return;
    if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
    found.push(a);
  };
  for (const C of [window.Array, window.Uint8Array]) {
    if (!C) continue;
    for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
      const o = C.prototype[m];
      if (typeof o === 'function') C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
    }
  }
  const of = window.Array.from;
  if (of) window.Array.from = function () { const r = of.apply(this, arguments); rec(r); return r; };
  try {
    window.eval(fs.readFileSync(OUTER_JS, 'utf8'));
    await new Promise(r => setTimeout(r, 10000));
  } catch (e) {}
  window.close();
  return found;
}

(async () => {
  // 读所有 sync（浏览器 keys + cd）
  const syncFiles = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort();
  console.log('sync 会话:', syncFiles.length);
  const results = [];
  for (const sf of syncFiles.slice(-4)) {
    const sync = JSON.parse(fs.readFileSync(path.join(OUT, sf)));
    const { nsd, cd } = sync.challenge;
    const bK2 = sync.browserKeys.keys2;
    console.log(`\n=== sync ${sf.substring(5, 20)} nsd=${nsd} ===`);
    console.log('浏览器 keys2:', bK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

    // jsdom 同 cd 数组陷阱
    const arrs = await jsdomKeys(nsd, cd);
    console.log('jsdom 数组:', arrs.length, '个');
    // 找 48 字节候选（keys2）
    const k48 = arrs.filter(a => a.length === 48);
    const count48 = {};
    for (const a of k48) count48[a.join(',')] = (count48[a.join(',')] || 0) + 1;
    const top48 = Object.entries(count48).sort((a, b) => b[1] - a[1]);
    if (top48.length) {
      const jsK2 = top48[0][0].split(',').map(Number);
      const same = jsK2.length === bK2.length && jsK2.every((v, i) => v === bK2[i]);
      console.log('jsdom keys2:', jsK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '), same ? '★★★ 相同!' : '');
      if (!same) {
        const xor = jsK2.slice(0, 8).map((v, i) => v ^ bK2[i]);
        console.log('XOR 前8:', xor.map(b => b.toString(16).padStart(2, '0')).join(' '));
        // 更多分析：XOR 是否 = 某哈希
        const md5k = [...crypto.createHash('md5').update(Buffer.from(jsK2)).digest()].slice(0, 8);
        const sha1k = [...crypto.createHash('sha1').update(Buffer.from(jsK2)).digest()].slice(0, 8);
        console.log('XOR==md5(jsK2)[0:8]:', xor.every((v, i) => v === md5k[i]) ? 'YES' : 'NO');
        console.log('XOR==sha1(jsK2)[0:8]:', xor.every((v, i) => v === sha1k[i]) ? 'YES' : 'NO');
        // XOR 是否恒定（跨会话）→ 存结果
        results.push({ nsd, jsK2: jsK2.slice(0, 8), bK2: bK2.slice(0, 8), xor });
      }
    } else {
      console.log('jsdom 无 48 字节候选');
      // 打印所有长度分布
      const lens = {};
      for (const a of arrs) lens[a.length] = (lens[a.length] || 0) + 1;
      console.log('长度分布:', JSON.stringify(lens));
    }
  }
  // 跨会话 XOR 对比
  if (results.length >= 2) {
    console.log('\n===== 跨会话 XOR 对比（是否恒定）=====');
    for (let i = 1; i < results.length; i++) {
      const a = results[0].xor, b = results[i].xor;
      console.log(`会话0 vs ${i}: XOR 相同:`, a.every((v, j) => v === b[j]) ? 'YES（恒定掩码!）' : 'NO');
    }
    results.forEach(r => console.log('  nsd=' + r.nsd + ' XOR:', r.xor.map(x => x.toString(16).padStart(2, '0')).join(' ')));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
