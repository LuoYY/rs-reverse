/**
 * 728_C_tail_window.js
 * 验证 base 尾部滑动窗口假设：
 * base[68:]（含[68:92]动态段 + [92:]编码敏感区）是固定数据序列，各样本窗口偏移不同
 * 方法：找各样本 base 尾部的公共锚点，向前对齐
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179 });
for (const s of pairs) samples.push({ src: 'pairs', nsd: s.nsd, base: s.base });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base });
console.log('样本数:', samples.length);

// 打印 base[60:110]（含动态段 + 编码敏感区开头）
console.log('\n=== base[60:110] ===');
for (const s of samples) {
  console.log(`[${s.src} ${s.nsd}] len=${s.base.length}: ${s.base.slice(60, 110).join(',')}`);
}

// 找尾部锚点：base 尾部 139,176,0,0 或固定锚
console.log('\n=== 尾部最后 30 字节 ===');
for (const s of samples) {
  const b = s.base;
  console.log(`[${s.src} ${s.nsd}] len=${b.length}: tail30=${b.slice(b.length - 30, b.length).join(',')}`);
}

// 关键：对齐检查。假设尾部有固定锚序列，找各样本从尾部算起的公共前缀长度
// 先找两两样本尾部最长公共子串（LCS 简单版：从尾部对齐）
console.log('\n=== 两两样本尾部对齐公共前缀（从尾部数）===');
for (let i = 0; i < Math.min(samples.length, 5); i++) {
  for (let j = i + 1; j < Math.min(samples.length, 5); j++) {
    const a = samples[i].base, b = samples[j].base;
    let k = 0;
    while (k < 30 && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
    console.log(`${samples[i].src}${samples[i].nsd} vs ${samples[j].src}${samples[j].nsd}: 尾部公共 ${k} 字节`);
  }
}

// 尾部锚点搜索：每个样本 base 中找 [139,176,0,0] 位置
console.log('\n=== 锚点 [139,176,0,0] 位置 ===');
for (const s of samples) {
  const b = s.base;
  let pos = -1;
  for (let i = 0; i < b.length - 3; i++) {
    if (b[i] === 139 && b[i + 1] === 176 && b[i + 2] === 0 && b[i + 3] === 0) { pos = i; break; }
  }
  console.log(`[${s.src} ${s.nsd}] len=${b.length}: 锚点@${pos} 锚点前20=${pos >= 0 ? b.slice(Math.max(0, pos - 20), pos + 4).join(',') : 'none'}`);
}
