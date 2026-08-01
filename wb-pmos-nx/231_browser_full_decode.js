/**
 * 231_browser_full_decode.js
 *
 * 浏览器 cookie 完整解密（b86 basestr + K16 外层）→ nextarr → basearr 明文
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const B86 = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const BS64 = B86.slice(0, 64);

function decodeWith(str) {
  const idxmap = {}; for (let i = 0; i < BS64.length; i++) idxmap[BS64[i]] = i;
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
  const parser = require('@src/handler/parser');

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const pCookie = sync.cookies.find(c => c.name.endsWith('P')).value;
  const bk = sync.browserKeys;
  console.log('nsd:', sync.challenge.nsd, 'P cookie:', pCookie.length);
  console.log('bk.keys16:', bk.keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('bk.keys17:', bk.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('bk.keys2:', bk.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 外层解密（b86 + K16）
  const C = decodeWith(pCookie.slice(1));
  const arr = numarrAddTime([...bk.keys16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  const nextarr = dec.slice(4);
  const u4 = parser.numToNumarr4(parser.uuid(nextarr));
  console.log('\n外层: C=' + C.length + 'B dec=' + dec.length + 'B uuid=' + (u4.every((v, i) => v === dec[i]) ? 'YES' : 'NO'));
  console.log('nextarr len:', nextarr.length, 'nextarr[0]:', nextarr[0], '[1]:', nextarr[1]);

  // keys2 定位（browserKeys.keys2 前 8）
  const K2P = bk.keys2.slice(0, 8);
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  console.log('keys2@nextarr:', k2pos);
  if (k2pos < 0) { console.log('keys2 未找到! nextarr 前 40:', nextarr.slice(0, 40).join(',')); process.exit(1); }

  const head = nextarr.slice(0, k2pos);
  console.log('head:', head.length, 'B:', head.map(b => b.toString(16).padStart(2, '0')).join(' '));
  const afterK2 = nextarr.slice(k2pos + 48);
  console.log('afterKeys2:', afterK2.length, 'B 前 8:', afterK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // basearrEncrypt = [N][...N]（numarrJoin 模式）
  const N = afterK2[0];
  const baseEnc = afterK2.slice(1, 1 + N);
  console.log('N=' + N, 'basearrEncrypt=' + baseEnc.length + 'B 剩余:', afterK2.length - 1 - N, 'B');
  if (afterK2.length > 1 + N) console.log('剩余段前 16:', afterK2.slice(1 + N, 1 + N + Math.min(16, afterK2.length - 1 - N)).join(','));

  // 内层解密：keys17 候选（browser + jsdom 纯算法）
  const k17Cands = {
    browser: bk.keys17,
    jsdom: [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7],
  };
  for (const [kname, k17] of Object.entries(k17Cands)) {
    try {
      const arr2 = numarrAddTime([...k17], 0, 1 / 256)[0];
      const X = encryptMode2([...baseEnc], arr2, 0);
      if (X.length < 50) { console.log('\n[' + kname + '] 内层解密过短', X.length); continue; }
      const enc = [];
      for (let i = 0; i < X.length; i++) enc.push(X[i] ^ bk.keys2[i % 16]);
      const ba = numarrDecrypt(enc);
      console.log('\n[' + kname + '] k17:', k17.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  X:', X.length, 'B enc:', enc.length, 'B 解码 basearr:', ba.length, 'B 首:', ba[0], ba[1]);
      console.log('  basearr 前 30:', ba.slice(0, 30).join(','));
      if (ba.length > 100 && (ba[0] === 3 || ba[0] === 2)) {
        let p = 0, segs = [];
        while (p < ba.length - 2 && segs.length < 30) {
          const h = ba[p];
          if (h > 15) break;
          const l = ba[p + 1];
          segs.push([h, l, p]);
          p += 2 + l;
        }
        console.log('  段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
        fs.writeFileSync(path.join(OUT, 'basearr_browser_' + sync.challenge.nsd + '.json'), JSON.stringify({ nsd: sync.challenge.nsd, keyname: kname, k17, runTime: 0, basearr: ba, enc }));
        console.log('  ★ 已保存 basearr_browser_' + sync.challenge.nsd + '.json');
      }
    } catch (e) { console.log('[' + kname + '] 错误:', e.message.substring(0, 50)); }
  }
  // 保存 nextarr
  fs.writeFileSync(path.join(OUT, 'browser_nextarr_' + sync.challenge.nsd + '.json'), JSON.stringify({ nextarr, head, dec, bk }));
  console.log('\n已保存 browser_nextarr_' + sync.challenge.nsd + '.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
