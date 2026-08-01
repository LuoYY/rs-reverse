/**
 * 244_diff_huffman.js
 *
 * 对比真实 E（解密 target 得）和重现 E（numarrEncrypt(basearr)），找差异
 * 定位 huffman 解码误差
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

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const nextarr = plain.slice(4);
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);

  // 真实 E：解密 target
  const k17 = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];
  const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
  const Xreal = encryptMode2([...target], arr, 0);
  const Ereal = Xreal.slice();
  for (let i = 0; i < 16 && i < Ereal.length; i++) Ereal[i] ^= keys2[i];
  console.log('真实 E:', Ereal.length, 'B');
  console.log('真实 E 前 16:', Ereal.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 重现 E：numarrEncrypt(basearr)
  const bj = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_jsdom_xor16.json')));
  const ba = bj.basearr;
  const Emine = numarrEncryptBytes(ba, 0x68);
  console.log('重现 E:', Emine.length, 'B');
  console.log('重现 E 前 16:', Emine.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 对比
  const min = Math.min(Ereal.length, Emine.length);
  let firstDiff = -1;
  for (let i = 0; i < min; i++) {
    if (Ereal[i] !== Emine[i]) { firstDiff = i; break; }
  }
  console.log('长度差:', Ereal.length - Emine.length, '首个差异 @', firstDiff);
  if (firstDiff > 0) {
    console.log('真实 E @差异 附近:', Ereal.slice(Math.max(0, firstDiff - 4), firstDiff + 8).join(','));
    console.log('重现 E @差异 附近:', Emine.slice(Math.max(0, firstDiff - 4), firstDiff + 8).join(','));
  }
  // bit 级对比
  if (firstDiff > 0) {
    const bitReal = Ereal.map(b => b.toString(2).padStart(8, '0')).join('');
    const bitMine = Emine.map(b => b.toString(2).padStart(8, '0')).join('');
    const bitMin = Math.min(bitReal.length, bitMine.length);
    let bitDiff = -1;
    for (let i = 0; i < bitMin; i++) { if (bitReal[i] !== bitMine[i]) { bitDiff = i; break; } }
    console.log('bit 级首个差异 @', bitDiff, '(字节', Math.floor(bitDiff / 8), 'bit', bitDiff % 8, ')');
    console.log('真实 bit 段:', bitReal.slice(Math.max(0, bitDiff - 10), bitDiff + 20));
    console.log('重现 bit 段:', bitMine.slice(Math.max(0, bitDiff - 10), bitDiff + 20));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
