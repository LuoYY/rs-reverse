// 深度数学分析 [78:90]（12B 内容校验段）与 keys/cd 的关系
// 目标：找确定性 f 公式
const samples = require('./nx_full_samples.json');
const crypto = require('crypto');

console.log('=== 样本元数据 ===');
samples.forEach((s, i) => console.log('#' + i, 'nsd=' + s.nsd, 'cdLen=' + s.cd.length, 'k2=' + s.keys2.slice(0,4).join(','), 'k17=' + s.keys17.slice(0,4).join(',')));

// 1. 检查 [78:90] 是否 = keys2 XOR keys17 某组合
console.log('\n=== [78:90] vs keys 组合 ===');
const segs = samples.map(s => s.base.slice(78, 90));
// 检查 [78:90] = k2[i:i+12] 或 k2 的某种变换
for (const [name, fn] of [
  ['k2', s => s.keys2],
  ['k17', s => s.keys17],
  ['cd解密', s => { /* 简化：跳过 */ return []; }],
]) {
  for (const s of samples.slice(0, 2)) {
    const k = fn(s);
    const seg = segs[samples.indexOf(s)];
    for (let off = 0; off <= Math.max(0, k.length - 12); off++) {
      if (k.slice(off, off + 12).join(',') === seg.join(',')) {
        console.log('★ ' + name + '[' + off + ':] 直接相等!');
      }
    }
  }
}

// 2. 检查 [78:90] 每字节的确定性来源（跨样本比较变化模式）
console.log('\n=== 跨样本变化模式 ===');
// 看哪些字节位置在6个样本中"部分相同"
for (let p = 78; p < 90; p++) {
  const vals = samples.map(s => s.base[p]);
  const uniq = new Set(vals);
  if (uniq.size <= 3) console.log('[' + p + '] ' + vals.join(',') + ' ← 仅' + uniq.size + '种值');
}

// 3. 用 [78:90] 尝试常见哈希：md5/sha1 of keys2, keys17, cd
console.log('\n=== 哈希尝试 ===');
function bytesHex(b) { return Buffer.from(b).toString('hex'); }
for (const s of samples.slice(0, 2)) {
  const seg = segs[samples.indexOf(s)];
  const k2h = bytesHex(s.keys2), k17h = bytesHex(s.keys17), cdh = bytesHex(Buffer.from(s.cd));
  const segHex = bytesHex(seg);
  for (const [name, h] of [
    ['md5(k2)', crypto.createHash('md5').update(Buffer.from(s.keys2)).digest('hex')],
    ['md5(k17)', crypto.createHash('md5').update(Buffer.from(s.keys17)).digest('hex')],
    ['md5(k2+k17)', crypto.createHash('md5').update(Buffer.concat([Buffer.from(s.keys2), Buffer.from(s.keys17)])).digest('hex')],
    ['md5(cd)', crypto.createHash('md5').update(s.cd).digest('hex')],
    ['sha1(k2)', crypto.createHash('sha1').update(Buffer.from(s.keys2)).digest('hex')],
    ['sha1(k17)', crypto.createHash('sha1').update(Buffer.from(s.keys17)).digest('hex')],
    ['sha1(k2+k17)', crypto.createHash('sha1').update(Buffer.concat([Buffer.from(s.keys2), Buffer.from(s.keys17)])).digest('hex')],
    ['crc32-like', (s.keys2[0]*31 + s.keys17[0]).toString(16)],
  ]) {
    // 检查 segHex 是否出现在 h 中（部分匹配）
    if (h.includes(segHex) || segHex.includes(h.slice(0, 24))) {
      console.log('★ ' + name + ' 相关! ' + h.slice(0, 32));
    }
  }
  console.log('#' + samples.indexOf(s) + ' seg=' + segHex + ' md5k2=' + crypto.createHash('md5').update(Buffer.from(s.keys2)).digest('hex').slice(0, 24));
}

// 4. 检查 [78:90] 与 r2mka/startT 的关系
console.log('\n=== [78:90] vs 时间戳 ===');
samples.forEach((s, i) => {
  console.log('#' + i, 'r2mka=' + s.r2mka, 'startT=' + s.startT, '[78:90]=' + segs[i].join(','));
});

// 5. 检查 [78:90] 是否跨样本共享子串（滚动窗口？）
console.log('\n=== [78:90] 滚动验证 ===');
// 收集 [78:95] 长段
samples.forEach((s, i) => console.log('#' + i, '[78:95]=' + s.base.slice(78, 95).join(',')));
