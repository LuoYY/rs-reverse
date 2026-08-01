/**
 * 238_decrypt_xor16.js
 *
 * 修正：xor(numarrEncrypt(basearr), keys2, 16) 只 XOR 前 16 字节！
 * 解密：X = encryptMode2(304B, keys17, 0)，E = X（前16 ^= keys2[0..15]），huffman → basearr
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
  const flag = nextarr[k2pos + 48];
  const N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const baseEnc = nextarr.slice(k2pos + 50, k2pos + 50 + len);
  console.log('basearrEncrypt:', baseEnc.length, 'B');
  console.log('browser keys17:', bk.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('browser keys2 前16:', bk.keys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  const k17Cands = {
    browser: bk.keys17,
    jsdom: [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7],
  };
  for (const [kname, k17] of Object.entries(k17Cands)) {
    try {
      const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
      const X = encryptMode2([...baseEnc], arr, 0);
      if (X.length < 100) continue;
      // E = X，前 16B xor keys2 前 16B
      const E = X.slice();
      for (let i = 0; i < 16 && i < E.length; i++) E[i] ^= bk.keys2[i];
      const ba = numarrDecrypt(E);
      console.log('\n[' + kname + '] X=' + X.length + 'B E=' + E.length + 'B 解码=' + ba.length + 'B');
      console.log('  basearr 前 40:', ba.slice(0, 40).join(','));
      if (ba.length > 100) {
        // 解析 numarrJoin 结构
        let p = 0, segs = [];
        while (p < ba.length - 2 && segs.length < 30) {
          const h = ba[p];
          if (h > 15) break;
          const l = ba[p + 1];
          segs.push([h, l, p]);
          p += 2 + l;
        }
        console.log('  段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
        fs.writeFileSync(path.join(OUT, 'basearr_browser_xor16.json'), JSON.stringify({ kname, basearr: ba, E, X }));
      }
    } catch (e) { console.log('[' + kname + '] 错误:', e.message.substring(0, 50)); }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
