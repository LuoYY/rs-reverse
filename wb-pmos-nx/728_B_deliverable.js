/**
 * 728_B_deliverable.js
 * 最终交付分析：
 * 1. base179（179开头）= 当前服务器接受格式（实弹 200 验证）
 * 2. basearr_dataset（100开头）= 8月2日旧格式
 * 3. cap（113开头）= b86[2:] = 明文 basearr（中间数组，非最终 base179）
 * 4. base179[68:92] 敏感字节分布 + 可任意字节
 * 5. 敏感字节与 keys2/b86 无简单关系 → 内层 VM 产物
 */
const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

console.log('==============================================');
console.log(' base179 结构总结（pairs 10 + triple 8 样本）');
console.log('==============================================');
// 固定位置统计（对齐头部）
const allSamples = [...pairs.map(s => ({ ...s, base: s.base })), ...trip.map(s => ({ ...s, base: s.base }))];
const maxLen = Math.max(...allSamples.map(s => s.base.length));
const fixed = [], varPos = {};
for (let i = 0; i < maxLen; i++) {
  const vals = allSamples.map(s => s.base[i]).filter(v => v !== undefined);
  if (new Set(vals).size === 1) fixed.push(i);
  else varPos[i] = new Set(vals).size;
}
console.log('固定位置:', fixed.join(','));
console.log('\n可变位置(unique数):', Object.entries(varPos).map(([k, v]) => `${k}:${v}`).join('  '));

// 尾部对齐固定检查
console.log('\n尾部对齐固定检查（从尾部数）:');
const fixedTail = [];
for (let t = 1; t <= 50; t++) {
  const vals = allSamples.map(s => s.base[s.base.length - t]).filter(v => v !== undefined);
  if (new Set(vals).size === 1) fixedTail.push(-t);
}
console.log('尾部固定偏移(负数=从尾部数):', fixedTail.join(','));

// 关键：当前格式结论
console.log('\n==============================================');
console.log(' 敏感字节判定（基于当前会话逐字节+1 探测 nsd=105018）');
console.log('==============================================');
console.log('敏感(改→412/400): [22:29]全部, 68,69,71,80,83-91');
console.log('可任意(改→200):   70,72-79,81,82');
console.log('其中 90,91 → 400（业务层，cookie 层通过=长度字段）');

console.log('\n==============================================');
console.log(' 数据格式澄清（关键）');
console.log('==============================================');
console.log('1. basearr_dataset.json/full_keys_dataset.json（100开头）= 8月2日旧格式');
console.log('   - 534 当前运行已显示 basearrB[0]=b3(179) → 当前是 179 开头');
console.log('   - 旧格式的 [24-29] 动态段不再适用当前服务器');
console.log('2. base179（179开头, pairs/triple 的 base）= 当前服务器接受格式');
console.log('   - 实弹验证: base179 原样 Node 重构 → 200 ✓');
console.log('   - 结构: [0:22]固定 + [22:29]会话段 + [29:68]固定 + [68:92]动态 + [92:165]固定尾');
console.log('3. cap（113开头）= b86[2:2+len] = 明文 basearr（CDP 捕获的中间数组）');
console.log('   - 非服务器接受的最终 base179（B/C/D 变体全 412）');
console.log('   - 标记位 24+16k = 环境检测值');

console.log('\n==============================================');
console.log(' [68:92] 敏感字节 vs keys2/b86 关系结论');
console.log('==============================================');
console.log('× XOR keys2 无固定模式');
console.log('× b86 任意偏移 XOR 无固定模式');
console.log('× b86 切片匹配 <4/24');
console.log('→ base179[68:92] 是内层 VM 加密 cap 的产物（值域均匀=加密数据）');
console.log('→ [0:22]+[29:68] 是内层 VM 加密固定环境数据（跨会话恒定）');
console.log('→ 纯算法需内层 VM 生成 [68:92] 或反编译内层 VM');
