/**
 * 253_fix_basearr_target.js
 *
 * 以 nextarr 里的 basearrEncrypt（160B）为目标：
 * 暴力枚举 basearr 尾部字符 → numarrEncrypt → xor keys2前16 → encryptMode1(keys17,0)
 * → 完全匹配 160B
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
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const nextarr = plain.slice(4);
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  const k17 = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);
  console.log('target basearrEncrypt:', target.length, 'B');

  // 解密 target 拿 Ereal（作为参考）
  const arr0 = numarrAddTime([...k17], 0, 1 / 256)[0];
  const Xreal = encryptMode2([...target], arr0, 0);
  const Ereal = Xreal.slice();
  for (let i = 0; i < 16 && i < Ereal.length; i++) Ereal[i] ^= keys2[i];
  const ba = numarrDecrypt(Ereal);
  console.log('解码 basearr:', ba.length, 'B');

  // 暴力尾部 1-4 字符
  for (let keep = ba.length - 4; keep <= ba.length; keep++) {
    const prefix = ba.slice(0, keep);
    const remain = ba.length - keep;
    if (remain > 3) continue;
    const maxVals = [];
    if (remain === 0) maxVals.push([[]]);
    if (remain === 1) { for (let a = 0; a < 256; a++) maxVals.push([a]); }
    if (remain === 2) { for (let a = 0; a < 256 && maxVals.length < 500; a++) for (let b = 0; b < 256 && maxVals.length < 500; b++) maxVals.push([a, b]); }
    if (remain === 3) { for (let a = 0; a < 256 && maxVals.length < 300; a++) for (let b = 0; b < 256 && maxVals.length < 300; b++) for (let c = 0; c < 256 && maxVals.length < 300; c++) maxVals.push([a, b, c]); }
    console.log('keep=' + keep + ' 枚举尾部组合:', maxVals.length);
    for (const tail of maxVals) {
      const cand = [...prefix, ...tail];
      // 快速预筛：长度/首字节
      const E = numarrEncryptBytes(cand, 0x68);
      if (E.length !== Ereal.length) continue;
      const X = E.slice();
      for (let i = 0; i < 16 && i < X.length; i++) X[i] ^= keys2[i];
      const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
      const re = encryptMode1([...X], arr, 0);
      if (re.length === target.length && re.every((v, i) => v === target[i])) {
        console.log('★★★ 命中! basearr=' + cand.length + 'B 尾部:', tail.join(','));
        console.log('basearr 前 30:', cand.slice(0, 30).join(','));
        console.log('basearr 完整:', JSON.stringify(cand));
        fs.writeFileSync(path.join(OUT, 'basearr_jsdom_final.json'), JSON.stringify({ basearr: cand }));
        process.exit(0);
      }
    }
  }
  console.log('无命中');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
