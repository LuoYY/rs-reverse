/**
 * 225_browser_cookie_variants.js
 *
 * 浏览器 cookie 外层解密全变体测试：
 * 前缀 a/无/0 + flag 0/1 + 密钥 keys16/keys17(两种) + t 无关性验证
 * 校验：uuid / nextarr[0] / 明文熵
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function decodeWith(str) {
  const idxmap = {}; for (let i = 0; i < B64.length; i++) idxmap[B64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const pCookie = sync.cookies.find(c => c.name.endsWith('P')).value;
  const bk = sync.browserKeys;

  const K16 = bk.keys16; // = K16
  const k17browser = bk.keys17;
  const k17jsdom = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];

  const prefixes = { a: pCookie.slice(1), none: pCookie, '0': pCookie[0] === '0' ? pCookie.slice(1) : pCookie, a0: pCookie[0] === 'a' ? pCookie.slice(1) : pCookie };

  for (const [pname, payload] of Object.entries(prefixes)) {
    const C = decodeWith(payload);
    if (!C) { console.log('[' + pname + '] 解码失败'); continue; }
    console.log('\n=== 前缀 ' + pname + ' 密文 ' + C.length + 'B ===');
    for (const [kname, key] of Object.entries({ K16, k17b: k17browser, k17j: k17jsdom })) {
      for (const flag of [1, 0]) {
        try {
          const arr = numarrAddTime([...key], 0, 1 / 256)[0];
          const dec = encryptMode2([...C], arr, flag);
          const nextarr = dec.slice(4);
          const u4 = parser.numToNumarr4(parser.uuid(nextarr));
          const uuidOk = u4.every((v, i) => v === dec[i]);
          const entropy = dec.filter(v => v >= 32 && v <= 126).length / dec.length;
          console.log('  [' + kname + '] flag=' + flag, 'dec=' + dec.length + 'B', 'uuid=' + (uuidOk ? '★★YES' : 'no'), 'nextarr[0]=' + dec[4], 'ascii=' + entropy.toFixed(2), '前6:', dec.slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(' '));
        } catch (e) {
          console.log('  [' + kname + '] flag=' + flag, '错误:', e.message.substring(0, 40));
        }
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
