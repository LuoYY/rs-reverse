/** 567 精确 S1/S2 差异（167 vs 167 对齐）+ 与 keys 关系 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

const b1 = d[0].basearr, b2 = d[1].basearr;
const k1 = d[0].keys, k2 = d[1].keys;

// 全部差异位置
console.log('=== S1 vs S2 全部差异 ===');
const diffs = [];
for (let i = 0; i < Math.min(b1.length, b2.length); i++) {
  if (b1[i] !== b2[i]) {
    diffs.push(i);
    console.log(`[${i}] S1=${b1[i].toString(16).padStart(2,'0')} S2=${b2[i].toString(16).padStart(2,'0')} XOR=${(b1[i]^b2[i]).toString(16).padStart(2,'0')}`);
  }
}
console.log('差异位置:', diffs.join(','));

// 绑定字节（544 号）：[26-29]+[84-87]
console.log('\n=== 绑定字节 ===');
console.log('[26-29] S1:', b1.slice(26,30).map(x=>x.toString(16).padStart(2,'0')).join(' '));
console.log('[26-29] S2:', b2.slice(26,30).map(x=>x.toString(16).padStart(2,'0')).join(' '));
console.log('[84-87] S1:', b1.slice(84,88).map(x=>x.toString(16).padStart(2,'0')).join(' '));
console.log('[84-87] S2:', b2.slice(84,88).map(x=>x.toString(16).padStart(2,'0')).join(' '));

// 关键：动态段 [24-29] 与 execNumberByTime 关系
// execNumberByTime = 1500-2000ms 循环次数。S1/S2 的 [25-28] 是否循环次数？
const v1 = (b1[25]<<24|b1[26]<<16|b1[27]<<8|b1[28]) >>> 0;
const v2 = (b2[25]<<24|b2[26]<<16|b2[27]<<8|b2[28]) >>> 0;
console.log('\n[25-28] 大端值: S1=' + v1 + ' S2=' + v2);

// 检查 [24-29] 中是否有时间戳（unixtime 高 4 字节）
const now = Math.floor(Date.now()/1000);
console.log('当前时间:', now, 'hex:', now.toString(16));
// basearr 生成时间 vs 当前
const t1 = d[0].nsd, t2 = d[1].nsd;
console.log('nsd S1:', t1, 'S2:', t2);

// keys 差异
console.log('\n=== keys 差异（S1→S2）===');
for (let ki = 0; ki < k1.length; ki++) {
  const a = k1[ki], b = k2[ki];
  if (!a || !b) continue;
  const diffs2 = [];
  for (let j = 0; j < Math.min(a.length, b.length); j++) if (a[j] !== b[j]) diffs2.push(j);
  if (diffs2.length) console.log(`keys[${ki}] len=${a.length}/${b.length} diff@${diffs2.join(',')}`);
}

// 动态段与 keys2 的 XOR（[26-29] vs keys2 前 4）
console.log('\n[26-29] XOR keys2[0:4]:');
console.log('S1:', b1.slice(26,30).map((x,i)=>x^k1[2][i]).map(x=>x.toString(16).padStart(2,'0')).join(' '));
console.log('S2:', b2.slice(26,30).map((x,i)=>x^k2[2][i]).map(x=>x.toString(16).padStart(2,'0')).join(' '));

// [26-29] 大端
const bv1 = (b1[26]<<24|b1[27]<<16|b1[28]<<8|b1[29]) >>> 0;
const bv2 = (b2[26]<<24|b2[27]<<16|b2[28]<<8|b2[29]) >>> 0;
console.log('\n[26-29] 大端: S1=' + bv1 + ' S2=' + bv2);
console.log('[84-87] 大端: S1=' + ((b1[84]<<24|b1[85]<<16|b1[86]<<8|b1[87])>>>0) + ' S2=' + ((b2[84]<<24|b2[85]<<16|b2[86]<<8|b2[87])>>>0));
