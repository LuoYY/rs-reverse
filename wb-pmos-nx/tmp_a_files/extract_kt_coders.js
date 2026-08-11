// 提取 base 会话段编码函数：_$op/_$mX/_$hB/_$eb/_$pJ（_$kt 写入用）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
function extractFn(name, startPos) {
  let i = startPos !== undefined ? startPos : c.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, end = -1;
  for (let j = c.indexOf('{', i); j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
// @343521 附近的函数（_$op/_$mX/_$hB 等）
console.log('=== @343400-344200 区域 ===');
console.log(c.slice(343400, 344200));
