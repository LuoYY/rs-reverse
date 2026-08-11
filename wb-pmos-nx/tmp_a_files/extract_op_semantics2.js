// 提取关键 opcode 语义（_$pW===N 或 _$jZ===N 分支）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

// 从整个 dynCode 中提取 op 分支（不限 _$c4，因为 _$c4 可能用不同变量名）
const keyOps = [1673, 737, 386, 445, 282, 1078, 1596, 1593, 1464, 1465, 405, 611, 378, 1075, 1348, 1536, 813];
for (const op of keyOps) {
  // 搜索所有 _$X===op 模式
  const pats = [`===${op}){`, `===${op}){_`, `_$pW===${op}`, `_$jc===${op}`, `_$jZ===${op}`];
  let found = false;
  for (const pat of pats) {
    const i = c.indexOf(pat);
    if (i >= 0) {
      // 找语句结束（}else if 或 ;）
      const seg = c.slice(i - 10, i + 200);
      console.log('\n=== op=' + op + ' ===');
      console.log(seg);
      found = true;
      break;
    }
  }
  if (!found) console.log('\n=== op=' + op + ' === 未找到');
}
