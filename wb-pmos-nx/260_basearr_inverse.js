/**
 * 260_basearr_inverse.js
 *
 * 317B basearr 各种逆变换 → 检查 numarrJoin 结构
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
function checkJoin(ba, label) {
  if (!ba || ba.length < 50) return;
  // 连贯段头解析
  let p = 0, segs = [];
  let ok = true;
  while (p < ba.length - 1 && segs.length < 30) {
    const h = ba[p];
    if (h > 15) { ok = false; break; }
    const l = ba[p + 1];
    if (p + 2 + l > ba.length) { ok = false; break; }
    segs.push([h, l]);
    p += 2 + l;
  }
  if (ok && segs.length >= 2) console.log('  ★ ' + label + ': 首=' + ba[0] + ' 段:', segs.map(s => '[' + s[0] + ']l' + s[1]).join(' '));
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const d = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_browser_plain.json')));
  const ba = d.basearr; // 317B
  console.log('basearr:', ba.length, 'B 首:', ba[0]);

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bk = sync.browserKeys;

  // 各种变换
  const K16 = bk.keys16, k2 = bk.keys2, k17 = bk.keys17;
  const variants = {
    'xor k2前16': ba.map((v, i) => i < 16 ? v ^ k2[i] : v),
    'xor k2循环': ba.map((v, i) => v ^ k2[i % 48]),
    'xor k16前16': ba.map((v, i) => i < 16 ? v ^ K16[i] : v),
    'xor k17前16': ba.map((v, i) => i < 16 ? v ^ k17[i] : v),
    'xor k2首字节': ba.map(v => v ^ k2[0]),
  };
  for (const [n, v] of Object.entries(variants)) checkJoin(v, n);

  // encryptMode2
  for (const [kn, key] of Object.entries({ k16: K16, k17, k2: k2.slice(0, 16) })) {
    for (const f of [0, 1]) {
      try {
        const arr = numarrAddTime([...key], 0, 1 / 256)[0];
        const X = encryptMode2([...ba], arr, f);
        checkJoin(X, 'encryptMode2(' + kn + ',flag' + f + ') len=' + X.length);
      } catch (e) {}
    }
  }

  // numarrDecrypt + 变换
  const d2 = numarrDecrypt(ba);
  checkJoin(d2, 'numarrDecrypt len=' + d2.length);
  checkJoin(d2.map((v, i) => i < 16 ? v ^ k2[i] : v), 'numarrDecrypt+xor k2');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
