/**
 * 254_raw_keys17.js
 *
 * 尝试 encryptMode2(target, keys17原始16B, 0)（不走 numarrAddTime）
 * 对比 numarrAddTime 版本，验证 getCfg time 处理
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
  console.log('target:', target.length, 'B');

  // 版本 A：numarrAddTime(keys17, t, ele)
  for (const t of [0, 1785580000, Math.floor(Date.now() / 1000)]) {
    for (const ele of [1, 2, 3]) {
      const arr = numarrAddTime([...k17], t, ele / 256)[0];
      const X = encryptMode2([...target], arr, 0);
      const E = X.slice();
      for (let i = 0; i < 16 && i < E.length; i++) E[i] ^= keys2[i];
      const ba = numarrDecrypt(E);
      const back = numarrEncrypt([...ba]);
      const ok = back.length === E.length && back.every((v, i) => v === E[i]);
      let fd = -1;
      for (let i = 0; i < Math.min(back.length, E.length); i++) if (back[i] !== E[i]) { fd = i; break; }
      console.log('[addTime t=' + t + ' ele=' + ele + '] X=' + X.length + ' 解码=' + ba.length + ' round-trip=' + (ok ? 'YES' : 'NO') + (fd >= 0 ? ' 差异@' + fd : ''));
    }
  }
  // 版本 B：原始 keys17（16B）
  try {
    const X2 = encryptMode2([...target], [...k17], 0);
    const E2 = X2.slice();
    for (let i = 0; i < 16 && i < E2.length; i++) E2[i] ^= keys2[i];
    const ba2 = numarrDecrypt(E2);
    const back2 = numarrEncrypt([...ba2]);
    const ok2 = back2.length === E2.length && back2.every((v, i) => v === E2[i]);
    console.log('[原始 keys17] X=' + X2.length + ' 解码=' + ba2.length + ' round-trip=' + (ok2 ? 'YES' : 'NO'));
  } catch (e) { console.log('[原始 keys17] 错误:', e.message.substring(0, 50)); }

  // 版本 C：keys17 反转或其他
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
