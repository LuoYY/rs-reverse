/**
 * 229_basestr_variants.js
 *
 * 浏览器 cookie 多 basestr × K16 解密 → uuid 校验
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const BASESTRS = {
  b64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  b64std: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  b86: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^'.slice(0, 64),
  rev: '_zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKJIHGFEDCBA9876543210-',
  num: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-',
  b86dot: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^'.slice(0, 64),
};

function decodeWith(str, basestr) {
  const idxmap = {}; for (let i = 0; i < basestr.length; i++) idxmap[basestr[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined || c1 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined || c1 === undefined || c2 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
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
  const K16 = sync.browserKeys.keys16;

  for (const [pname, payload] of Object.entries({ a: pCookie.slice(1), none: pCookie })) {
    for (const [bname, bs] of Object.entries(BASESTRS)) {
      const C = decodeWith(payload, bs);
      if (!C || C.length % 4 !== 0) { if (C) console.log('[' + pname + '/' + bname + '] ' + C.length + 'B 非4倍数'); continue; }
      try {
        const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
        const dec = encryptMode2([...C], arr, 1);
        const nextarr = dec.slice(4);
        const u4 = parser.numToNumarr4(parser.uuid(nextarr));
        const uuidOk = u4.every((v, i) => v === dec[i]);
        console.log('[' + pname + '/' + bname + '] C=' + C.length + 'B dec=' + dec.length + 'B uuid=' + (uuidOk ? '★★YES' : 'no') + ' nextarr[0]=' + dec[4] + ' IV前4:' + C.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
        if (uuidOk) {
          console.log('★★★ basestr=' + bname + ' 前缀=' + pname);
          fs.writeFileSync(path.join(OUT, 'browser_basestr_found.json'), JSON.stringify({ bname, pname, dec }));
          process.exit(0);
        }
      } catch (e) {
        console.log('[' + pname + '/' + bname + '] 错误:', e.message.substring(0, 30));
      }
    }
  }
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
