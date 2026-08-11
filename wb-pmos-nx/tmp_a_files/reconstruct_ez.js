// 重建 _$ez：keys 段 → numarr 编码
// 验证：_$ez = f(keys) 可离线计算（符号执行器基石）
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

// numarr 编码：把字节数组编码为 \x01<digits> 流（与捕获的 _$ez 格式一致）
function numarrEncode(arr) {
  const out = [];
  for (const v of arr) {
    if (v === 0) { out.push(0); continue; }
    if (v === 1) { out.push(1, 49); continue; } // \x01 + '1'
    const digits = String(v).split('').map(c => c.charCodeAt(0));
    out.push(1, ...digits);
  }
  return out;
}

// 对比捕获的 _$ez 编码格式
// 从 nx_ez_full_final.json 看 head: [51,2,54,52,2,54,52,48,...]
// 51='3' 2=??? 54='6' 52='4' ... 这不是 \x01 格式！
// 实际格式: 51,2,54,52 → '3',2,'6','4' → 3,2,6,4?
// 更可能: 每个 base 字节 → 2 个值 (a,b) 其中 a=高位数字+偏移, b=低位
// 51,2,54,52 → 3.64 → 数字 "3" 然后 2,6,4?
// 观察: 51='3' 2 54='6' 52='4' 2 54='6' 52='4' 48='0'
// 模式: [num_char, 2?, num_char, num_char, 2?, ...] 但 2 不是字符
// 实际是: '3'=51, 2, '6'=54, '4'=52 → 这编码了 3, 64?
// 或者: 51,2,54,52 = 3 个数字 "3" "6" "4" + 控制符 2?
// 让我看完整捕获格式
const fs = require('fs');
const ezSnap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = ezSnap[0].ez.v;
console.log('_$ez 头 30:', ez.slice(0, 30).join(','));
console.log('_$ez 头 30 字符:', ez.slice(0, 30).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// 分析编码模式：_$ez 是"数字字符 + 控制"流
// 51='3', 2, 54='6', 52='4', 2, 54='6', 52='4', 48='0'
// 解码: 3, 2, 6, 4, 2, 6, 4, 0 → "32642640"? 
// 但 2 是控制符... 或 51='3' 表示数字3, 2 可能是"结束"标记?
// 实际 numarr 编码（瑞数）: 字节 → 1-3 位数字，0 分隔
// 51,2,54,52,2,54,52,48 → 但 2 不该出现
// 等等: 51='3', 2=?, 54='6', 52='4' → "3?64" 
// 可能格式: [值][数字流] 模式，2 是特殊标记
// 让我数实际模式
console.log('\n_$ez 中 2 的位置:', ez.map((v, i) => v === 2 ? i : -1).filter(x => x >= 0).slice(0, 20).join(','));
console.log('_$ez 中 0 的位置:', ez.map((v, i) => v === 0 ? i : -1).filter(x => x >= 0).slice(0, 20).join(','));
console.log('_$ez 中 1 的位置:', ez.map((v, i) => v === 1 ? i : -1).filter(x => x >= 0).slice(0, 20).join(','));
