// 解码 _$ez[1532]：numarr 编码 → base 还原
// 同时用样本中真实 base 对照
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = snap[0].ez.v;
console.log('_$ez len:', ez.length);

// numarr 解码尝试1：数字字符流，\x01 前缀标记 + 数字字符
// 看 head: 51='3',2,54='6',52='4',2,54='6',52='4',48='0',74,239,100,9,224,22,221,67,119,136,121,248
// 前 8 字节 [51,2,54,52,2,54,52,48] = "3",2,"6","4",2,"6","4","0"
// 这像 base[0:8] 的 numarr 编码（每个 base 字节→ 1-3 数字字符）
// base[0:8] = [59,148,7,120,19,0,0,0]？不对，sdenv 环境是 [59,148,7,120,...]
// 让我解析：找到数字字符 → 组成数，\x01 表示新字节开始
console.log('\n=== 手动解析 ===');
// 解释：瑞数 numarr 编码：字节 → 十进制字符串，每字符 +48 或特殊编码
// 尝试：把 ez 按 [1,数字,0] 或 [1,数字] 模式切分
let i = 0, out = [];
while (i < ez.length) {
  const b = ez[i];
  if (b === 1) { // \x01 前缀
    const digits = [];
    i++;
    while (i < ez.length && ez[i] >= 48 && ez[i] <= 57) { digits.push(ez[i]); i++; }
    if (digits.length) out.push(parseInt(digits.map(d => String.fromCharCode(d)).join(''), 10));
    else { out.push('?'); }
  } else if (b === 0) {
    out.push('|'); // 分隔符
    i++;
  } else if (b >= 48 && b <= 57) {
    // 可能是裸数字
    const digits = [];
    while (i < ez.length && ez[i] >= 48 && ez[i] <= 57) { digits.push(ez[i]); i++; }
    out.push(parseInt(digits.map(d => String.fromCharCode(d)).join(''), 10));
  } else {
    out.push('[' + b + ']');
    i++;
  }
}
console.log('解析结果(前80):', out.slice(0, 80).join(' '));
