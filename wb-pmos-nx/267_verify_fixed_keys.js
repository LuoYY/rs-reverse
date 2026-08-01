/**
 * 267_verify_fixed_keys.js
 *
 * 用修复的纯算法 keys（keys17 正确）解密浏览器 basearr + 重现验证
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

  // 修复的 keys（从 keys_fixed_*.json）
  const kf = fs.readdirSync(OUT).filter(f => f.startsWith('keys_fixed_')).sort().pop();
  const keysData = JSON.parse(fs.readFileSync(path.join(OUT, kf)));
  const keys = keysData.keys;
  console.log('修复 keys[17]:', JSON.stringify(keys[17]));
  console.log('修复 keys[2]:', JSON.stringify(keys[2]).substring(0, 60));
  console.log('修复 keys[16]:', JSON.stringify(keys[16]));

  // 浏览器 nextarr
  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const nextarr = nd.nextarr;
  // 定位 keys2（用修复的 keys2 前 8）
  const K2P = keys[2].slice(0, 8);
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  console.log('keys2@nextarr:', k2pos);
  if (k2pos < 0) { console.log('keys2 未找到'); process.exit(1); }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);
  console.log('flag=' + flag, 'N=' + N, 'basearrEncrypt:', target.length, 'B');

  // 用修复 keys17 解密
  const k17 = keys[17];
  const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
  const X = encryptMode2([...target], arr, 0);
  const E = X.slice();
  for (let i = 0; i < 16 && i < E.length; i++) E[i] ^= keys[2][i];
  const ba = numarrDecrypt(E);
  console.log('basearr:', ba.length, 'B 首 20:', ba.slice(0, 20).join(','));

  // round-trip 验证
  const back = numarrEncrypt([...ba]);
  const ok = back.length === E.length && back.every((v, i) => v === E[i]);
  let fd = -1;
  for (let i = 0; i < Math.min(back.length, E.length); i++) if (back[i] !== E[i]) { fd = i; break; }
  console.log('round-trip:', ok ? '★★★ YES' : 'NO 差异@' + fd + ' E尾:' + E.slice(-4).join(',') + ' back尾:' + back.slice(-4).join(','));

  // 保存
  fs.writeFileSync(path.join(OUT, 'basearr_browser_fixed.json'), JSON.stringify({ basearr: ba, keys }));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
