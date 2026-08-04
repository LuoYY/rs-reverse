/**
 * 728_A147_base_vs_cap_blocks.js
 * 深挖 base[22:]（可变段）与 cap[24:]（明文可变段）的关系
 * 3 会话对比：寻找 base[i] = f(cap[i]) 或 base 独立生成
 */
const fs = require('fs');

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_747_data.json', 'utf8'));
  const cap = d.cap, base = d.base, b86 = d.b86, keys2 = d.keys2;

  // base 完整 16 字节块 vs cap 16 字节块
  console.log('=== base vs cap 逐块 ===');
  console.log('base len:', base.length, 'cap len:', cap.length);

  // base[22:] 是否 = cap[24:] 的加密（每块对应）
  // cap 块: 每16字节有标记位(第8字节), base 块结构?
  // 尝试: base[i] = cap[i+2] XOR 固定流?
  const x = [];
  for (let i = 0; i < Math.min(base.length, cap.length); i++) x.push((base[i] ^ cap[i]) & 0xff);
  console.log('base^cap[0:60]:', x.slice(0, 60).join(','));

  // 尝试 base[22:] 长度 146 vs cap[24:] 长度 143
  // base 长度比 cap 多 1-3 字节
  console.log('\nbase len-cap len:', base.length - cap.length);

  // base 后段是否 = cap 尾部的什么
  console.log('\nbase 尾 30:', base.slice(-30).join(','));
  console.log('cap 尾 30:', cap.slice(-30).join(','));

  // 检查 base 是否包含 keys2 痕迹
  console.log('\n=== base 中搜索 keys2 模式 ===');
  for (let i = 0; i <= base.length - 4; i++) {
    if (base[i] === keys2[0] && base[i + 1] === keys2[1] && base[i + 2] === keys2[2]) {
      console.log('base 中找到 keys2 前缀 @', i);
    }
  }

  // 关键：base[0:16] 固定 vs cap[0:16] 固定，两者关系？
  console.log('\nbase[0:16] 固定:', base.slice(0, 16).join(','));
  console.log('cap[0:16] 固定:', cap.slice(0, 16).join(','));
  const x0 = [];
  for (let i = 0; i < 16; i++) x0.push((base[i] ^ cap[i]) & 0xff);
  console.log('base[0:16]^cap[0:16]:', x0.join(','));
  // 对照 b86[0:16]
  console.log('b86[0:16]:', b86.slice(0, 16).join(','));
  const x1 = [];
  for (let i = 0; i < 16; i++) x1.push((base[i] ^ b86[i]) & 0xff);
  console.log('base[0:16]^b86[0:16]:', x1.join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
