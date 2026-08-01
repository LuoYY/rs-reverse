/**
 * 252_find_basearr_structure.js
 *
 * 系统寻找 nx basearr 明文（numarrJoin 结构）：
 * 解密 target → X → 各种变换 → huffman 解码 → 首字节 3 校验
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
function checkJoin(ba) {
  if (ba.length < 50) return null;
  // numarrJoin 结构：开头 [h][len][data]...
  const res = [];
  let p = 0;
  let ok = true;
  let h0 = ba[0];
  while (p < ba.length - 1 && res.length < 30) {
    const h = ba[p];
    if (h > 15) { ok = false; break; }
    const l = ba[p + 1];
    if (p + 2 + l > ba.length) { ok = false; break; }
    res.push([h, l]);
    p += 2 + l;
  }
  if (ok && res.length >= 2) return { h0, res };
  return null;
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
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const k17 = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);
  console.log('jsdom basearrEncrypt:', target.length, 'B');

  // 密钥候选：keys17（纯算法）+ keys16 + 其他
  const keyCands = { k17: k17, K16: K16 };

  for (const [kn, key] of Object.entries(keyCands)) {
    for (const f of [0, 1]) {
      try {
        const arr = numarrAddTime([...key], 0, 1 / 256)[0];
        const X = encryptMode2([...target], arr, f);
        if (X.length < 50) continue;
        // X 的变换
        const variants = {
          raw: X,
          xorK2_16: X.map((v, i) => i < 16 ? v ^ keys2[i] : v),
          xorK2_48: X.map((v, i) => v ^ keys2[i % 48]),
          xorK16: X.map((v, i) => v ^ K16[i % 16]),
          xorK2_16_all: X.map((v, i) => v ^ keys2[i % 16]),
        };
        for (const [vn, E] of Object.entries(variants)) {
          // 直接解码
          const ba = numarrDecrypt(E);
          const j = checkJoin(ba);
          if (j) {
            console.log('★★★ [' + kn + '] flag=' + f + ' ' + vn + ' 解码=' + ba.length + 'B 首=' + j.h0);
            console.log('  段:', j.res.map(s => '[' + s[0] + ']l' + s[1]).join(' '));
            console.log('  前 40:', ba.slice(0, 40).join(','));
          }
          // 再解码
          const ba2 = numarrDecrypt(E.map((v, i) => i < 16 ? v ^ keys2[i] : v));
          const j2 = checkJoin(ba2);
          if (j2) {
            console.log('★★★ [' + kn + '] flag=' + f + ' ' + vn + ' 二次解码=' + ba2.length + 'B 首=' + j2.h0);
            console.log('  段:', j2.res.map(s => '[' + s[0] + ']l' + s[1]).join(' '));
          }
        }
      } catch (e) {}
    }
  }
  console.log('扫描完成');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
