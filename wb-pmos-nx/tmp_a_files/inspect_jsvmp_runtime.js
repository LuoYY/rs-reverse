// 查看 JSVMP 运行时初始化区（@62169 附近）的完整结构
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 初始化区开始（解释器变量声明）
let k = c.indexOf('_$oi,_$_R,_$gx,_$gB,_$pC,_$f1;');
console.log('初始化区 @' + k);
// 打印到下一个大边界（比如找到第 N 个 function 定义）
if (k >= 0) {
  // 向后找 6000 字符
  const seg = c.slice(k, k + 6000);
  // 统计函数定义
  const fns = seg.match(/function (_[$][a-zA-Z0-9]+)\(/g);
  console.log('函数定义:', fns ? fns.length : 0, fns ? fns.join(' ') : '');
  // 打印前 3000
  console.log('=== 前 3000 字符 ===');
  console.log(seg.slice(0, 3000));
}
