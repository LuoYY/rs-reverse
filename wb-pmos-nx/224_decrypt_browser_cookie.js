/**
 * 224_decrypt_browser_cookie.js
 *
 * 决定性：解密浏览器真实 cookie（sync 采集）→ nextarr → basearr 明文
 * 外层：keys16(browserKeys) + base64url + 'a'前缀 + 任意 t（getCfg strips time）
 * 内层：keys17(browserKeys) 解密 basearrEncrypt → xor keys2 → huffman → basearr 明文
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
  const pCookie = sync.cookies.find(c => c.name.endsWith('P')).value;
  const bk = sync.browserKeys;
  console.log('nsd:', sync.challenge.nsd, 'P cookie:', pCookie.length, '前 8:', pCookie.substring(0, 8));
  console.log('browser keys16:', bk.keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('browser keys17:', bk.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('browser keys2:', bk.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 外层解密
  const C = decodeWith(pCookie.slice(1));
  console.log('\n外层密文:', C.length, 'B');
  const arr = numarrAddTime([...bk.keys16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  console.log('外层明文:', dec.length, 'B');
  console.log('明文前 16:', dec.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // uuid 校验
  const parser = require('@src/handler/parser');
  const nextarr = dec.slice(4);
  const u4 = parser.numToNumarr4(parser.uuid(nextarr));
  console.log('uuid 校验:', u4.every((v, i) => v === dec[i]) ? '★★★ YES' : 'NO');
  console.log('nextarr len:', nextarr.length, 'nextarr[0]:', nextarr[0], '[1]:', nextarr[1]);

  // 定位 keys2
  const K2P = bk.keys2.slice(0, 8);
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  console.log('keys2@nextarr:', k2pos);
  if (k2pos < 0) {
    console.log('keys2 未找到，dump nextarr 前 40:', nextarr.slice(0, 40).map(b => b.toString(16).padStart(2, '0')).join(' '));
    fs.writeFileSync(path.join(OUT, 'browser_nextarr_' + sync.challenge.nsd + '.json'), JSON.stringify({ nextarr, dec, bk }));
    process.exit(0);
  }
  const head = nextarr.slice(0, k2pos);
  console.log('head:', head.length, 'B:', head.map(b => b.toString(16).padStart(2, '0')).join(' '));
  const afterKeys2 = nextarr.slice(k2pos + 48);
  console.log('keys2 后:', afterKeys2.length, 'B');
  console.log('afterKeys2 前 16:', afterKeys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 尝试内层解密：basearrEncrypt = afterKeys2（可能带 N 标记）
  // 方案 A：afterKeys2 直接是 basearrEncrypt
  // 方案 B：[N][basearrEncrypt]（N=afterKeys2[0]）
  for (const [scheme, baseEnc] of Object.entries({
    'A直接': afterKeys2,
    'B带N': afterKeys2[0] < 200 ? afterKeys2.slice(1, 1 + afterKeys2[0]) : afterKeys2,
  })) {
    if (baseEnc.length % 4 !== 0) { console.log('\n[' + scheme + '] basearrEncrypt ' + baseEnc.length + 'B 非4倍数'); continue; }
    console.log('\n[' + scheme + '] basearrEncrypt ' + baseEnc.length + 'B');
    try {
      const arr2 = numarrAddTime([...bk.keys17], 0, 1 / 256)[0];
      const X = encryptMode2([...baseEnc], arr2, 0);
      console.log('  内层解密 X:', X.length, 'B 前 16:', X.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      if (X.length > 50) {
        const enc = [];
        for (let i = 0; i < X.length; i++) enc.push(X[i] ^ bk.keys2[i % 16]);
        const ba = numarrDecrypt(enc);
        console.log('  huffman 解码:', ba.length, 'B 首字节:', ba[0]);
        console.log('  basearr 前 30:', ba.slice(0, 30).join(','));
        // 段结构
        let p = 0, segs = [];
        while (p < ba.length - 2 && segs.length < 30) {
          const h = ba[p];
          if (h > 15) break;
          const l = ba[p + 1];
          segs.push([h, l]);
          p += 2 + l;
        }
        console.log('  段:', segs.map(s => '[' + s[0] + ']l' + s[1]).join(' '));
        // 验证 huffman 正向
        const enc2 = numarrEncryptBytes(ba, 0x68);
        console.log('  huffman 正向验证:', enc2.slice(0, 16).every((v, i) => v === enc[i]) ? '★★★ YES' : 'NO');
        if (segs.length >= 3 || (ba[0] === 3 || ba[0] === 2)) {
          fs.writeFileSync(path.join(OUT, 'basearr_browser_' + sync.challenge.nsd + '.json'), JSON.stringify({ nsd: sync.challenge.nsd, scheme, basearr: ba, enc, keys17: bk.keys17, keys2: bk.keys2 }));
          console.log('  ★ 已保存 basearr_browser_' + sync.challenge.nsd + '.json');
        }
      }
    } catch (e) { console.log('  错误:', e.message.substring(0, 60)); }
  }
  // 保存 nextarr 供分析
  fs.writeFileSync(path.join(OUT, 'browser_nextarr_' + sync.challenge.nsd + '.json'), JSON.stringify({ nextarr, dec, bk }));
  console.log('\n已保存 browser_nextarr_' + sync.challenge.nsd + '.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
