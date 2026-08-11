// TLV 解码 128B 输出（_$mD[615] 用 e=128 编码的结果），验证 = 时间戳编码
const calls = require('./nx_mD_calls.json');
const c128 = calls.filter(c => c.after && c.after.length === 128);
const c230 = calls.filter(c => c.after && c.after.length === 230);

// numarr/TLV 解码（_$hB 逆过程）
function tlvDecode(arr) {
  const vals = [];
  let idx = 0;
  while (idx < arr.length) {
    const item = arr[idx];
    let v;
    if ((item & 128) === 0) { v = item; idx += 1; }
    else if ((item & 192) === 128) { v = ((item & 63) << 8) | arr[idx + 1]; idx += 2; }
    else if ((item & 224) === 192) { v = ((item & 31) << 16) | (arr[idx + 1] << 8) | arr[idx + 2]; idx += 3; }
    else if ((item & 240) === 224) { v = ((item & 15) << 24) | (arr[idx + 1] << 16) | (arr[idx + 2] << 8) | arr[idx + 3]; idx += 4; }
    else if ((item & 248) === 240) { v = (arr[idx + 1] << 24) | (arr[idx + 2] << 16) | (arr[idx + 3] << 8) | arr[idx + 4]; idx += 5; }
    else { v = item; idx += 1; }
    vals.push({ raw: item, len: idx, v });
  }
  return vals;
}

console.log('=== 128B #0 TLV 解码 ===');
const d0 = tlvDecode(c128[0].after);
console.log('pl(输入时间戳):', c128[0].pl);
console.log('解码值数:', d0.length);
console.log('解码值:', d0.slice(0, 15).map(x => x.v).join(','));
console.log('前 10 个 raw+len:', d0.slice(0, 10).map(x => x.raw + '(' + x.len + ')').join(' '));
console.log();

// 128B #1 对比
console.log('=== 128B #1 TLV 解码 ===');
const d1 = tlvDecode(c128[1].after);
console.log('pl(输入时间戳):', c128[1].pl);
console.log('解码值:', d1.slice(0, 15).map(x => x.v).join(','));
console.log();

// 128B #0 的解码值是否 = 时间戳 521019866 相关？
console.log('=== 128B #0 vs 时间戳 ===');
console.log('pl=521019866, 解码值前5:', d0.slice(0, 5).map(x => x.v).join(','));
// 检查 521019866 是否出现在解码值中
const hasTs = d0.find(x => x.v === 521019866);
console.log('解码含 521019866:', !!hasTs);

// 230B 解码
console.log('\n=== 230B #0 TLV 解码 ===');
const d230 = tlvDecode(c230[0].after);
console.log('ez:', c230[0].ez, 'pl:', c230[0].pl);
console.log('解码值数:', d230.length);
console.log('解码值前 10:', d230.slice(0, 10).map(x => x.v).join(','));
