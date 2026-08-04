/**
 * 728_B_dyn_compare.js
 * 对比 basearr_dataset（64开头）vs pairs/triple（base）的头部，确认对象一致性
 * 并分析 [24:30] 6字节 TLV 结构与 cd/keys 关系
 */
const fs = require('fs');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decodeB86(str) {
  const idxmap = {};
  for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4));
  } else if (rem === 3) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  }
  return bytes;
}

const ba = JSON.parse(fs.readFileSync('/tmp/basearr_dataset.json', 'utf8'));
const fk = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

console.log('=========== basearr_dataset（3 会话，64开头）===========');
for (const s of ba) {
  console.log(`nsd=${s.nsd} len=${s.basearr.length} [0:30]=${s.basearr.slice(0, 30).join(',')}`);
  console.log(`  [24:30]=${s.basearr.slice(24, 30).join(',')}`);
}

console.log('\n=========== full_keys_dataset 头部 ===========');
for (const s of fk) {
  console.log(`nsd=${s.nsd} len=${s.basearr.length} [0:24]=${s.basearr.slice(0, 24).join(',')}  [24:30]=${s.basearr.slice(24, 30).join(',')}`);
}

console.log('\n=========== pairs base 头部 ===========');
for (const s of pairs.slice(0, 5)) {
  console.log(`nsd=${s.nsd} len=${s.base.length} [0:24]=${s.base.slice(0, 24).join(',')}  [24:30]=${s.base.slice(24, 30).join(',')}`);
}

console.log('\n=========== triple base 头部 ===========');
for (const s of trip.slice(0, 5)) {
  console.log(`nsd=${s.nsd} len=${s.base.length} [0:24]=${s.base.slice(0, 24).join(',')}  [24:30]=${s.base.slice(24, 30).join(',')}`);
}

// 关键分析：basearr_dataset [24:30] 的 TLV 结构
console.log('\n=========== basearr_dataset [24:30] TLV 分析 ===========');
for (const s of ba) {
  const d = s.basearr.slice(24, 30);
  // 每 2 字节一组：(d0,d1)(d2,d3)(d4,d5)
  console.log(`nsd=${s.nsd}: [${d.join(',')}] 组1=(${d[0]},${d[1]}) 组2=(${d[2]},${d[3]}) 组3=(${d[4]},${d[5]})`);
}
// 尝试 TLV 格式 [len,val,...]：若 d0=长度 d1..=数据
console.log('\nTLV 假设1 [len,data...]:');
for (const s of ba) {
  const d = s.basearr.slice(24, 30);
  console.log(`nsd=${s.nsd}: len=${d[0]} data=${d.slice(1).join(',')}`);
}
// TLV 假设2 [type,len,val,type,len,val] 或 [len,val,len,val,len,val]
console.log('\nTLV 假设3 [len,val]*3 (len 是奇数位):');
for (const s of ba) {
  const d = s.basearr.slice(24, 30);
  console.log(`nsd=${s.nsd}: len=(${d[0]},${d[2]},${d[4]}) val=(${d[1]},${d[3]},${d[5]})`);
}
console.log('\nTLV 假设4 [val,len]*3:');
for (const s of ba) {
  const d = s.basearr.slice(24, 30);
  console.log(`nsd=${s.nsd}: val=(${d[0]},${d[2]},${d[4]}) len=(${d[1]},${d[3]},${d[5]})`);
}
