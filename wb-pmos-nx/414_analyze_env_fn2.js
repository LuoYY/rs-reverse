/**
 * 414_analyze_env_fn2.js
 * 离线分析：opcode46 调用函数 → 函数体 → documentMode 访问（索引数组值）
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// 找 opcode46 调用函数
const m46 = code.match(/([_$\w]+)=([_$\w]+)\(([_$\w]+)\[12\]\);/);
if (!m46) { console.log('无 opcode46'); process.exit(1); }
const fnName = m46[2];
const argArr = m46[3];
console.log('调用函数:', fnName, '参数数组:', argArr);

// 找函数定义（多种形式）
const esc = fnName.replace(/\$/g, '\\$');
const patterns = [
  new RegExp('function\\s+' + esc + '\\s*\\('),
  new RegExp(esc + '\\s*=\\s*function'),
  new RegExp(esc + '\\s*:\\s*function'),
  new RegExp('var\\s+' + esc),
  new RegExp(esc + '\\s*=\\s*[_$]\\w+'),  // 别名
];
let found = null;
for (const re of patterns) {
  const mm = re.exec(code);
  if (mm) { found = { re: re.source, idx: mm.index, match: mm[0] }; break; }
}
if (found) {
  console.log('函数定义:', found.match, '@' + found.idx);
  console.log('\n=== 函数体（500 字符）===');
  console.log(code.substring(found.idx, found.idx + 500).replace(/\n/g, ' '));
} else {
  console.log('未找到函数定义');
}

// 分析参数数组 _$bm 的 [12] 元素（属性名索引）
// 找 argArr 数组定义（含字符串元素的数组）
const arrIdx = code.indexOf(argArr + '=[');
if (arrIdx >= 0) {
  console.log('\n=== 参数数组 ' + argArr + ' 开头 ===');
  console.log(code.substring(arrIdx, arrIdx + 300).replace(/\n/g, ' '));
}
