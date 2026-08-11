// 提取关键 op 的精确分支代码（从 _$c4 二分树）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const c4Start = c.indexOf('function _$c4(');
const c4End = (() => {
  let depth = 0;
  for (let i = c4Start; i < c.length; i++) {
    if (c[i] === '{') depth++;
    else if (c[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return c.length;
})();
const c4 = c.slice(c4Start, c4End);
console.log('_$c4 长度:', c4.length);

// 提取 op 分支：找 `_$pW===N)` 或 `_$jc===N)` 的完整语句
const keyOps = [265, 2131, 2137, 2139, 1842, 1582, 1601, 1593, 1599, 2144, 2128, 2141, 1527];
for (const op of keyOps) {
  // 在 _$c4 中搜 _$pW===op 或 _$jc===op
  const pats = [`_$pW===${op}`, `_$jc===${op}`];
  for (const pat of pats) {
    const i = c4.indexOf(pat);
    if (i >= 0) {
      // 提取到最近的 } 或 ;
      const seg = c4.slice(i, i + 250);
      console.log('\n=== op=' + op + ' (' + pat + ') ===');
      console.log(seg);
      break;
    }
  }
}
