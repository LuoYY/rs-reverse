// 提取 base 编码核心函数 + _$k0 常量解析
// _$hB 变长编码 / _$eb 1B / _$op 2B / _$mX 4B / _$_c 除法编码 / _$pJ 数组
const fs = require('fs');
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const k0 = tables._$k0.val;
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');

// _$k0 相关常量
console.log('=== _$k0 关键常量 ===');
[2, 3, 5, 8, 9, 10, 15, 48, 50, 51, 60, 70, 71, 114, 150, 159, 211, 252].forEach(i => {
  console.log('_$k0[' + i + '] = ' + k0[i]);
});

// 提取编码函数
function extractFn(name) {
  const idx = code.indexOf('function ' + name + '(');
  if (idx < 0) return 'N/A';
  let depth = 0, end = -1;
  for (let i = idx; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return code.slice(idx, end + 1);
}
['_$eb', '_$op', '_$mX', '_$_c', '_$oH', '_$hB', '_$pJ', '_$$y'].forEach(fn => {
  const body = extractFn(fn);
  console.log('\n=== ' + fn + ' ===');
  console.log(body.slice(0, 600));
});
