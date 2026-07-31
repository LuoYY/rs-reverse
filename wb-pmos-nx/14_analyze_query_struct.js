/**
 * 14_analyze_query_struct.js
 *
 * 用 xj basestr（字符集相同）解码 nx query，分析 88B 结构
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'captures');
const XJ_BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeStr(s) {
  const payload = s;
  const idxmap = {};
  for (let i = 0; i < XJ_BASESTR.length; i++) idxmap[XJ_BASESTR[i]] = i;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) { console.log('非法字符 @' + qi); break; }
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < payload.length) {
    bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi+1]] >> 4), ((idxmap[payload[qi+1]] & 15) << 4) | (idxmap[payload[qi+2]] >> 2));
  } else if (qi + 1 < payload.length) {
    bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi+1]] >> 4));
  }
  return bytes;
}

const f = fs.readdirSync(OUT).filter(x => x.startsWith('query_')).sort().pop();
const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));

console.log('=== 解码 query[1..] 分析 88B 结构 ===');
d.queries.forEach((q, qi) => {
  const bytes = decodeStr(q.query.slice(1));
  console.log('\n[' + qi + '] len=' + bytes.length);
  console.log('  crc   :', bytes.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  b[4..10]:', bytes.slice(4, 11).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  b[11..20]:', bytes.slice(11, 21).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  b[21..40]:', bytes.slice(21, 41).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  b[41..60]:', bytes.slice(41, 61).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  b[61..87]:', bytes.slice(61, 88).map(b => b.toString(16).padStart(2, '0')).join(' '));
});

// 多 query 对比：找固定/变化边界
console.log('\n=== 跨 query 字节级对比 ===');
const allDec = d.queries.map(q => decodeStr(q.query.slice(1)));
const minLen = Math.min(...allDec.map(b => b.length));
console.log('最小长度:', minLen);
for (let i = 0; i < minLen; i++) {
  const set = new Set(allDec.map(b => b[i]));
  if (set.size > 1) {
    console.log('  byte' + i + ' 变化:', [...set].map(x => x.toString(16).padStart(2, '0')).join(' '));
  }
}
