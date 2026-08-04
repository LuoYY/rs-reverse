/**
 * 728_B_summary_verify.js
 * 最终验证脚本：确认本轮所有关键结论
 */
const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

// 1. 当前格式确认：534 当前运行 basearrB[0]=b3(179)，旧 basearr_dataset 是 100 开头
console.log('=== 格式对比 ===');
const oldData = JSON.parse(fs.readFileSync('/tmp/basearr_dataset.json', 'utf8'));
console.log('basearr_dataset（旧, 8/2）basearr[0]:', oldData.map(s => s.basearr[0]).join(','));
console.log('pairs base[0]（当前）:', pairs.map(s => s.base[0]).join(','));
console.log('triple base[0]（当前）:', trip.map(s => s.base[0]).join(','));

// 2. base179 固定头 [0:22]
console.log('\n=== base179 [0:22] 固定头 ===');
const head = pairs[0].base.slice(0, 22);
let headOK = true;
for (const s of [...pairs, ...trip]) {
  if (JSON.stringify(s.base.slice(0, 22)) !== JSON.stringify(head)) { headOK = false; console.log('  不一致 nsd=' + s.nsd); }
}
console.log('全部一致:', headOK, '=', head.join(','));

// 3. cap = b86[2:2+len] 除标记位
console.log('\n=== cap = b86[2:] 除标记位 ===');
const marks = [24, 40, 56, 72, 88, 104, 120, 136, 152, 168];
let nonMark = 0;
for (const s of trip) {
  const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  const idxmap = {};
  for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
  const str = s.cd;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  for (let i = 0; i < Math.min(s.cap.length, bytes.length - 2); i++) {
    if (!marks.includes(i) && s.cap[i] !== bytes[i + 2]) nonMark++;
  }
}
console.log('非标记位差异总数（应为0）:', nonMark);

// 4. 动态段 [25:30] = b86[27:32]
console.log('\n=== cap[25:30] vs b86[27:32]（动态段 5/6 字节纯 cd 切片）===');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
for (const s of trip.slice(0, 3)) {
  const idxmap = {};
  for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
  const str = s.cd;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  console.log(`nsd=${s.nsd}: cap[25:30]=${s.cap.slice(25, 30).join(',')} b86[27:32]=${bytes.slice(27, 32).join(',')}`);
}
