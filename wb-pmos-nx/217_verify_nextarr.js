/**
 * 217_verify_nextarr.js
 *
 * 验证大[225] 是否为外层加密明文：
 * 1. uuid(大[225].slice(4)) == 大[225][0..3]？
 * 2. 若对：cookie 256B 解密（keys16 + 遍历 t）→ 对比整个明文
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
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const parser = require('@src/handler/parser');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const { pCookie } = trap;
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const big225s = dedup.filter(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);

  console.log('大[225] 候选:', big225s.length);
  for (const b of big225s) {
    const nextarr = b.slice(4);
    const u = parser.uuid(nextarr);
    const u4 = parser.numToNumarr4(u);
    console.log('uuid(nextarr):', u4.map(x => x.toString(16).padStart(2, '0')).join(' '));
    console.log('大[225] 前 4B:', b.slice(0, 4).map(x => x.toString(16).padStart(2, '0')).join(' '));
    console.log('uuid 匹配:', u4.every((v, i) => v === b[i]) ? '★★★ YES' : 'NO');
  }

  // 尝试把大[225] + uuid 加密（encryptMode1）对比 cookie
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
