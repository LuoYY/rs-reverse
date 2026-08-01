/**
 * 237_decrypt_304.js
 *
 * 解密浏览器 basearrEncrypt（304B，hasDebug flag 模式）：
 * encryptMode2(304B, keys17, 0) → xor keys2 → huffman → basearr 明文
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
function numarrEncryptBytes(numarr, pad) {
  const tree = getTree();
  const map = {};
  (function walk(node, bits) { if (node.idx !== undefined) { map[node.idx] = bits; return; } walk(node.first, bits + '0'); walk(node.second, bits + '1'); })(tree, '');
  let bitstr = '';
  for (const b of numarr) bitstr += map[b] || '';
  const out = [];
  let one = 0, two = 0;
  for (const c of bitstr) { one = (one << 1) | +c; two++; if (two === 8) { out.push(one); one = 0; two = 0; } }
  if (two > 0) out.push(one << (8 - two) | (pad >> two));
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

  // 从 browser_nextarr 拿 nextarr
  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const nextarr = nd.nextarr;
  console.log('nextarr len:', nextarr.length);

  // keys2 定位
  const K2P = bk.keys2.slice(0, 8);
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  console.log('keys2@' + k2pos);
  const flag = nextarr[k2pos + 48];
  const N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  console.log('flag=' + flag + '(0x' + flag.toString(16) + ') N=' + N + ' basearrEncrypt len=' + len);
  const baseEnc = nextarr.slice(k2pos + 50, k2pos + 50 + len);
  console.log('basearrEncrypt:', baseEnc.length, 'B 前 16:', baseEnc.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // keys17 候选（browser + jsdom 纯算法）
  const k17Cands = {
    browser: bk.keys17,
    jsdom: [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7],
  };
  for (const [kname, k17] of Object.entries(k17Cands)) {
    for (const flag2 of [0, 1]) {
      try {
        const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
        const X = encryptMode2([...baseEnc], arr, flag2);
        console.log('\n[' + kname + '] flag=' + flag2, 'X=' + X.length + 'B 前 16:', X.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
        if (X.length < 100) continue;
        const enc = [];
        for (let i = 0; i < X.length; i++) enc.push(X[i] ^ bk.keys2[i % 16]);
        const ba = numarrDecrypt(enc);
        console.log('  huffman 解码:', ba.length, 'B 首:', ba[0], ba[1]);
        if (ba.length > 100) {
          console.log('  basearr 前 30:', ba.slice(0, 30).join(','));
          let p = 0, segs = [];
          while (p < ba.length - 2 && segs.length < 30) {
            const h = ba[p];
            if (h > 15) break;
            const l = ba[p + 1];
            segs.push([h, l, p]);
            p += 2 + l;
          }
          console.log('  段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
          if (ba[0] === 3 || ba[0] === 2) {
            const enc2 = numarrEncryptBytes(ba, 0x68);
            console.log('  huffman 正向验证:', enc2.slice(0, 16).every((v, i) => v === enc[i]) ? '★★★ YES' : 'NO');
            fs.writeFileSync(path.join(OUT, 'basearr_browser_final.json'), JSON.stringify({ kname, flag2, basearr: ba, enc }));
            console.log('  ★ 已保存 basearr_browser_final.json');
          }
        }
      } catch (e) { console.log('[' + kname + '] 错误:', e.message.substring(0, 50)); }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
