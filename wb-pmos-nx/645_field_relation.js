/**
 * 645_field_relation.js
 * 多会话分析 [25-28] 与 [84-87] 及其他字段的关系
 * 服务器可能校验字段间一致性
 */
const fs = require('fs');

const d633 = JSON.parse(fs.readFileSync('/tmp/nx_633_data.json', 'utf8'));
const d535 = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

const sessions = [
  { name: '633', base: d633.bB, keys: d633.keys },
  { name: 'S1', base: d535[0].basearr, keys: d535[0].keys },
  { name: 'S2', base: d535[1].basearr, keys: d535[1].keys },
  { name: 'S3', base: d535[2].basearr, keys: d535[2].keys },
].filter(s => s.base && s.base.length > 87 && s.keys);

function BE(arr) { return arr.reduce((a, x) => a * 256 + x, 0); }
function LE(arr) { return arr.reduce((a, x, i) => a + (x << (8 * i)), 0) >>> 0; }
function hex(arr) { return arr.map(x => x.toString(16).padStart(2, '0')).join(' '); }

console.log('=== 多会话字段对比 ===');
for (const s of sessions) {
  const b = s.base;
  const k19 = +s.keys[19].map(c => String.fromCharCode(c)).join('');
  const k21 = +s.keys[21].map(c => String.fromCharCode(c)).join('');
  console.log(`\n${s.name}: len=${b.length}`);
  console.log(`  [25-28]: ${hex(b.slice(25, 29))} BE=${BE(b.slice(25, 29))}`);
  console.log(`  [29-32]: ${hex(b.slice(29, 33))}`);
  console.log(`  [69]: ${b[69].toString(16)} [70-72]: ${hex(b.slice(70, 73))}`);
  console.log(`  [84-87]: ${hex(b.slice(84, 88))} BE=${BE(b.slice(84, 88))}`);
  console.log(`  keys19=${k19} keys21=${k21}`);
  // [25-28] 与 keys19/21 差
  console.log(`  [25-28]BE - keys21 = ${BE(b.slice(25, 29)) - k21}`);
  console.log(`  [84-87]BE - keys21 = ${BE(b.slice(84, 88)) - k21}`);
  // [25-28] ^ [84-87]
  const x = b.slice(25, 29).map((v, i) => v ^ b[84 + i]);
  console.log(`  [25-28]^[84-87]: ${hex(x)}`);
  // [25-28] + [84-87]（mod 2^32）
  const sum = (BE(b.slice(25, 29)) + BE(b.slice(84, 88))) >>> 0;
  console.log(`  [25-28]+[84-87]: ${sum.toString(16)}`);
}

// 跨会话：[25-28] 差值 vs keys 差值
console.log('\n=== 跨会话差值 ===');
const ref = sessions[0];
for (const s of sessions.slice(1)) {
  const b = s.base;
  const k19 = +s.keys[19].map(c => String.fromCharCode(c)).join('');
  const k21 = +s.keys[21].map(c => String.fromCharCode(c)).join('');
  const rk19 = +ref.keys[19].map(c => String.fromCharCode(c)).join('');
  const rk21 = +ref.keys[21].map(c => String.fromCharCode(c)).join('');
  console.log(`${ref.name}->${s.name}: keys19差=${BE(s.keys[19]) - BE(ref.keys[19])} keys21差=${k21 - rk21} [25-28]差=${BE(b.slice(25, 29)) - BE(ref.base.slice(25, 29))}`);
}
