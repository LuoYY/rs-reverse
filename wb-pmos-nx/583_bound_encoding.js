/**
 * 583_bound_encoding.js
 * 穷举 nx 绑定字节 [26-29] 的编码变体
 * keys19/keys21(时间)/keys24(flag)/keys[0]/keys[1]... 各种数字编码
 * 覆盖：大端/小端/XOR/+/时间戳组合
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

function ascii(arr) { return arr.map(c => String.fromCharCode(c)).join(''); }
function BE(arr) { return arr.slice(26, 30).reduce((a, x) => a * 256 + x, 0); }
function LE(arr) { return arr.slice(26, 30).reduce((a, x, i) => a + (x << (8 * i)), 0); }
function BE84(arr) { return arr.slice(84, 88).reduce((a, x) => a * 256 + x, 0); }

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  console.log(`\n=== S${i + 1} ===`);
  const v26 = BE(b), v84 = BE84(b);
  console.log('[26-29] BE:', v26, 'LE:', LE(b), '[84-87] BE:', v84);
  console.log('[26-29] hex:', b.slice(26, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));

  // 收集所有 keys 数字
  const numKeys = {};
  for (let ki = 0; ki < k.length; ki++) {
    if (!k[ki]) continue;
    // ASCII 数字串
    const s = ascii(k[ki]);
    if (/^\d+$/.test(s)) numKeys[`keys[${ki}]`] = parseInt(s, 10);
    // 大端/小端数值
    numKeys[`keys[${ki}]BE`] = k[ki].reduce((a, x) => a * 256 + x, 0);
    numKeys[`keys[${ki}]LE`] = k[ki].reduce((a, x, j) => a + (x << (8 * j)), 0);
  }

  // 检查匹配
  for (const [name, val] of Object.entries(numKeys)) {
    if (val === v26) console.log(`★ [26-29] == ${name} = ${val}`);
    if (val === v84) console.log(`★ [84-87] == ${name} = ${val}`);
  }
  console.log('数字 keys:', Object.entries(numKeys).filter(([, v]) => v > 1000000).map(([n, v]) => `${n}=${v}`).join(' | '));

  // 时间候选：当前时间（采集时）
  console.log('basearr 采集时间未知，测试时间戳:');
  // keys21 是 r2mkaTime 吗？
  if (k[21]) console.log('  keys21:', ascii(k[21]), '→', parseInt(ascii(k[21]), 10));
  // 当前时间戳 4B 大端
  const now = Math.floor(Date.now() / 1000);
  console.log('  now:', now, 'hex:', now.toString(16));
}
