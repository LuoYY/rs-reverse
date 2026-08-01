/**
 * 251_browser_inner_rt.js
 *
 * 浏览器内层 round-trip 诊断：keys17(browser) 解密 304B → E → huffman 解码 → 编码
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) {
      if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
    }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function numarrDecrypt(bytes) {
  const tree = getTree();
  let bits = '';
  for (let i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (node && node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return out;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bk = sync.browserKeys;
  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const nextarr = nd.nextarr;
  const K2P = bk.keys2.slice(0, 8);
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);
  console.log('浏览器 basearrEncrypt:', target.length, 'B');

  // 密钥组合
  const combos = {
    'bk17/bk2': { k17: bk.keys17, k2: bk.keys2 },
    'bk17/pure2': { k17: bk.keys17, k2: [165, 114, 155, 62, 19, 210, 122, 197, 10, 57, 186, 65, 46, 47, 42, 112, 186, 34, 101, 70, 207, 51, 173, 4, 171, 173, 31, 224, 42, 79, 121, 31, 35, 237, 195, 77, 235, 237, 232, 148, 190, 86, 20, 164, 49, 94, 186, 109] },
    'pure17/bk2': { k17: [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7], k2: bk.keys2 },
    'pure17/pure2': { k17: [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7], k2: [165, 114, 155, 62, 19, 210, 122, 197, 10, 57, 186, 65, 46, 47, 42, 112, 186, 34, 101, 70, 207, 51, 173, 4, 171, 173, 31, 224, 42, 79, 121, 31, 35, 237, 195, 77, 235, 237, 232, 148, 190, 86, 20, 164, 49, 94, 186, 109] },
  };

  for (const [cname, { k17, k2 }] of Object.entries(combos)) {
    for (const f of [0, 1]) {
      try {
        const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
        const X = encryptMode2([...target], arr, f);
        if (X.length < 100) continue;
        const E = X.slice();
        for (let i = 0; i < 16 && i < E.length; i++) E[i] ^= k2[i];
        const ba = numarrDecrypt(E);
        const back = numarrEncrypt([...ba]);
        const ok = back.length === E.length && back.every((v, i) => v === E[i]);
        let fd = -1;
        for (let i = 0; i < Math.min(back.length, E.length); i++) if (back[i] !== E[i]) { fd = i; break; }
        console.log('[' + cname + '] flag=' + f, 'X=' + X.length, 'E=' + E.length, '解码=' + ba.length, 'round-trip=' + (ok ? 'YES' : 'NO') + (fd >= 0 ? ' 差异@' + fd + ' 尾: ' + back.slice(-4).join(',') + ' vs ' + E.slice(-4).join(',') : ''));
        if (ok && ba.length > 100) {
          console.log('  ★ basearr=' + ba.length + 'B 首:', ba[0], ba[1], '前 20:', ba.slice(0, 20).join(','));
          fs.writeFileSync(path.join(OUT, 'basearr_browser_rt.json'), JSON.stringify({ cname, basearr: ba }));
        }
      } catch (e) { console.log('[' + cname + '] 错误:', e.message.substring(0, 40)); }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
