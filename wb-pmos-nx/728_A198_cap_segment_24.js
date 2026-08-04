/**
 * 728_A198_cap_segment_24.js
 * 找 cap（明文）中 24 字节段，检查是否与 base[68:92] 相关（加密/变换）
 * cap = 明文 basearr（134B）；base[68:92] = 24B
 */
const fs = require('fs');

(async () => {
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const base = baseD.base, keys2 = baseD.keys2, keys17 = baseD.keys17;
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;
  const seg = base.slice(68, 92);

  console.log('cap(明文) len:', plain.length, 'base[68:92] len:', seg.length);

  // cap 中找 24 字节子段（含 113 头或模式）
  console.log('\n=== cap 的 24 字节块 ===');
  for (let off = 0; off <= plain.length - 24; off++) {
    const block = plain.slice(off, off + 24);
    console.log(`cap[${off}:${off + 24}]: ${block.join(',')}`);
  }

  // 检查 cap[68:92] 对齐（如果 cap 偏移与 base 相同）
  console.log('\ncap[68:92]:', plain.slice(68, 92).join(','));
  console.log('base[68:92]:', seg.join(','));

  // XOR 关系（cap 偏移 0-24, 24-48...）
  console.log('\n=== cap 各 24 字节块 ^ base[68:92] ===');
  for (let off = 0; off <= plain.length - 24; off++) {
    const block = plain.slice(off, off + 24);
    const x = block.map((v, i) => (v ^ seg[i]) & 0xff);
    // 检查 XOR 结果是否有模式（小值/可打印）
    const smallCount = x.filter(v => v < 128).length;
    console.log(`cap[${off}]^base[68:92]: ${x.join(',')} (小值${smallCount}/24)`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
