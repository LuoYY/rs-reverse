/**
 * 79_jsdom_random_test.js
 * 验证 jsdom keys2 随机性（同 cd 多次运行）+ O cookie 解密 keys2 方向
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM } = require('jsdom');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function httpGet(url) {
  return new Promise(r => {
    const req = https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', (e) => r({ status: 'ERR', body: '', headers: {} }));
    req.setTimeout(60000, () => { req.destroy(); r({ status: 'TIMEOUT', body: '', headers: {} }); });
  });
}
function decodeStr(s) {
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(s.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]], c3 = idxmap[s[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < s.length) { const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  else if (qi + 1 < s.length) bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4));
  return bytes;
}

async function jsdomKeys(nsd, cd, oCookie) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  if (oCookie) {
    let cj = oCookie;
    Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cj = cj ? cj + '; ' + v : v; }, configurable: true });
  }
  const found = [];
  const rec = (arr) => {
    if (!arr || typeof arr !== 'object') return;
    const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
    if (!a) return;
    if (a.length !== 48) return;
    if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
    if (a.filter(b => b >= 32 && b <= 126).length < a.length * 0.4) found.push(a);
  };
  for (const C of [window.Array, window.Uint8Array]) {
    if (!C) continue;
    for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
      const o = C.prototype[m];
      if (typeof o === 'function') C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
    }
  }
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 10000)); } catch (e) {}
  window.close();
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  return dedup(found)[0] || null;
}

(async () => {
  // 1. 拉挑战
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无挑战'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log('nsd:', nsd, 'O:', oCookie.substring(0, 25));

  // 2. jsdom 同 cd 多次运行（随机性验证）
  console.log('\n=== jsdom 同 cd 3 次 keys2（随机性验证）===');
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const k = await jsdomKeys(nsd, cd, oCookie);
    runs.push(k);
    console.log(`  运行${i}: ${k ? k.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无'}`);
  }
  const allSame = runs[0] && runs.every(k => k && k.every((v, i) => v === runs[0][i]));
  console.log('同 cd 确定性:', allSame ? 'YES（确定）' : 'NO（随机！）');

  // 3. O cookie 结构分析（是否含 keys2/时间戳）
  console.log('\n=== O cookie 解码 ===');
  const oBytes = decodeStr(oCookie.split('=')[1]);
  console.log('O 解码:', oBytes.length, 'B 头 20:', oBytes.slice(0, 20).join(','));
  // 找时间戳（大端 4 字节，接近 now）
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i + 4 <= oBytes.length; i++) {
    const v = (oBytes[i] << 24 | oBytes[i + 1] << 16 | oBytes[i + 2] << 8 | oBytes[i + 3]) >>> 0;
    if (Math.abs(v - now) < 3600) console.log('  可能时间戳 @' + i + ':', v, '差', v - now, '秒');
  }
  // 哈希测试：O 是否含可识别结构
  console.log('md5(O)[0:8]:', [...crypto.createHash('md5').update(Buffer.from(oCookie)).digest()].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 4. keys16 常量（验证站点常量）
  const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
  // 浏览器 keys2 参考（从 sync）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  if (syncFile) {
    const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
    console.log('\n参考 sync 浏览器 keys2:', sync.browserKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
