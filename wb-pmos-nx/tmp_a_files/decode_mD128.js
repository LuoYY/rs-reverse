// 解码 _$mD[615] 的 128B 输出（numarr 流）→ 看内容是否 = base 会话段/时间戳
const calls = require('./nx_mD_calls.json');
const c128 = calls.filter(c => c.after && c.after.length === 128);
const c230 = calls.filter(c => c.after && c.after.length === 230);

// numarr 解码（TLV 变长）
function getLensGo(numarr, idx) {
  const item = numarr[idx]; idx++;
  let lens;
  if ((item & 128) === 0) lens = item;
  else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
  else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
  else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
  else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
  else lens = item;
  return [lens, idx];
}
function numarrDecode(arr) {
  // 尝试：每个元素 = 长度前缀 + 值
  const vals = [];
  let idx = 0;
  while (idx < arr.length) {
    const item = arr[idx];
    // 如果 item 是普通值（<128）直接输出？还是长度前缀？
    vals.push(item);
    idx++;
  }
  return vals;
}
// 简单尝试：128B 的每字节 ASCII
console.log('=== 128B #0 内容分析 ===');
const a0 = c128[0].after;
console.log('原始:', a0.slice(0, 40).join(','));
console.log('ASCII:', a0.slice(0, 40).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join(''));
console.log('pl(时间戳):', c128[0].pl);
console.log();
// 128B 数组与 base 会话段的可能关系：看是否含 keys2 或时间戳
console.log('=== 230B #0 内容分析 ===');
const b0 = c230[0].after;
console.log('ASCII:', b0.slice(0, 40).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join(''));
console.log('ez:', c230[0].ez, 'pl:', c230[0].pl);
// 对比 128B 序列（pl 递增）→ 数组是否 = 时间戳的某种编码
console.log('\n=== 128B 序列对比（pl 递增）===');
for (let i = 0; i < Math.min(5, c128.length); i++) {
  const c = c128[i];
  console.log('#' + i + ' pl=' + c.pl + ' head4=' + c.after.slice(0, 4).join(','));
}
// 检查 128B 是否含 base 的 fixedHead（179,0,127,12）
c128.forEach((c, i) => {
  const idx = c.after.indexOf(179);
  if (idx >= 0) console.log('128B #' + i + ' 含 179 @' + idx);
});
c230.forEach((c, i) => {
  const idx = c.after.indexOf(179);
  if (idx >= 0) console.log('230B #' + i + ' 含 179 @' + idx);
});
