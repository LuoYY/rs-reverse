/**
 * 728_A190_varint_parse.js
 * 解析 base 的 varint 长度头结构
 * base[22]=159(0x9F) 是 varint 多字节长度
 * 验证：base 是否 = [长度头][数据段...] 的嵌套结构
 */
const fs = require('fs');

(async () => {
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const base = baseD.base;

  // 标准 varint 解码
  function readVarint(bytes, pos) {
    let result = 0, shift = 0, b;
    do {
      b = bytes[pos];
      if (pos >= bytes.length) return { value: null, pos };
      result |= (b & 0x7f) << shift;
      shift += 7;
      pos++;
    } while (b & 0x80);
    return { value: result, pos };
  }

  console.log('=== base[22] 起 varint 解析 ===');
  const r = readVarint(base, 22);
  console.log('varint value:', r.value, 'next pos:', r.pos);
  console.log('base[22-23]:', base[22], base[23]);

  // 尝试：base[22] 开始的 varint = 数据长度？base 全长 159
  // 如果 varint(159,9,...) 是长度 → 数据应占多少？
  // 标准 varint：0x9F 0x09 = (0x1F) | (0x09 << 7) = 31 + 1152 = 1183？不对
  // 0x9F & 0x7F = 0x1F = 31; 0x09 << 7 = 1152; 31 + 1152 = 1183（太大）
  // 或者用其他编码

  // 检查 base[0] 起 varint
  console.log('\n=== base[0] 起 varint ===');
  const r0 = readVarint(base, 0);
  console.log('base[0]=179 varint:', r0.value, 'next:', r0.pos);

  // 看各段长度是否与 varint 对应
  // 段长度序列（0 分隔）：1,7,13,3,1,7,18,5,3,2,21,2,3,2,13,10,1,8,12,4
  const segLens = [1,7,13,3,1,7,18,5,3,2,21,2,3,2,13,10,1,8,12,4];
  console.log('\n段长度序列:', segLens.join(','));
  console.log('段总数:', segLens.length);
  console.log('段长度和:', segLens.reduce((a, b) => a + b, 0), '+ 0分隔符', segLens.length - 1, '=', segLens.reduce((a, b) => a + b, 0) + segLens.length - 1, 'vs base len', base.length);

  // 21 个段 + 22 个 0（含开头/结尾？） 
  // 0 值 23 个：1,9,10,24,28,30,38,57,63,67,70,92,95,99,100,103,104,118,129,130,132,141,154
  // 段间 0 是分隔符，但 9,10 连续两个 0（段为空？）

  // 尝试另一种解释：base = [固定头][varint数据段1][0][段2][0]...
  // 分析 varint 编码的段长度是否在数据中
  console.log('\n=== 从 base[22] 逐段解析 ===');
  // base[22] 可能是主长度 varint
  // 假设 base = [22B 头][varint 长度][...数据...]
  // base[22]=159, base[23]=9 → 尝试 LEB128: 0x9F 0x09 = 0x49F = 1183? 太长
  // 尝试 base[22] 单独 = 159（长度 159-22=137 数据？接近）
  console.log('base[22]=159, base[22:]-实际数据长度 =', base.length - 22, '=', base.length - 22);
  console.log('若 base[22] 是长度 137 则一致');

  // 关键：base[22] 可能 = 数据段长度（不含头）
  console.log('\nbase[22] (159) vs 剩余长度 (137): 差 22 = 头长度');
  console.log('→ base = [22B 头][159 数据]? 但 159+22=181 ≠ 159');
  // 或 base[22] 是 varint 首字节，需要后续字节
  console.log('base[23]=9, base[24]=0 → 0x9F 0x09 0x00...');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
