/**
 * 216_find_nextarr.js
 *
 * 在数组陷阱里找含纯算法 keys2 前缀的数组 → 确定 nextarr/basearr 结构
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

(async () => {
  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  const K2P = [165, 114, 155, 62, 19, 210, 122, 197]; // a5 72 9b 3e 13 d2 7a c5

  console.log('=== 含 keys2 前缀的数组 ===');
  const matches = [];
  for (const a of dedup) {
    for (let i = 0; i + 8 <= a.length; i++) {
      if (a.slice(i, i + 8).every((v, j) => v === K2P[j])) {
        matches.push({ len: a.length, at: i });
        break;
      }
    }
  }
  matches.sort((x, y) => x.at - y.at);
  matches.forEach(m => console.log('  len=' + m.len, 'keys2@' + m.at));

  // dump 前几个含 keys2 的数组结构
  console.log('\n=== 含 keys2 数组的完整结构 ===');
  let shown = 0;
  for (const a of dedup) {
    for (let i = 0; i + 8 <= a.length; i++) {
      if (a.slice(i, i + 8).every((v, j) => v === K2P[j])) {
        if (shown >= 6) break;
        shown++;
        console.log('  [' + a.length + 'B] keys2@' + i + ' 前 ' + i + ' 字节:', a.slice(0, i).join(','));
        console.log('    keys2:', a.slice(i, i + 12).join(','));
        console.log('    尾 20:', a.slice(-20).join(','));
        break;
      }
    }
    if (shown >= 6) break;
  }

  // 找外层加密输出：高熵大数组（前 4 字节 = IV ints 之一？）
  console.log('\n=== 高熵 240-260 数组 ===');
  dedup.filter(a => a.length >= 240 && a.length <= 260)
    .filter(a => a.filter(v => v >= 32 && v <= 126).length < a.length * 0.5)
    .forEach(a => {
      console.log('  [' + a.length + '] 前 16:', a.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    });

  // 找含加密特征（高熵）的 220-240 数组
  console.log('\n=== 高熵 220-239 数组 ===');
  dedup.filter(a => a.length >= 220 && a.length < 240)
    .filter(a => a.filter(v => v >= 32 && v <= 126).length < a.length * 0.5)
    .forEach(a => {
      console.log('  [' + a.length + '] 前 16:', a.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    });

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
