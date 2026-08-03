/**
 * 686_bytecode_gen.js
 * 分析 dynCode 里 bytecode 生成（_$hN）和解码（_$m3）函数
 * 目标：提取 basearr 子程序的 bytecode 序列
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_cur.js', 'utf8');

// 找 _$hN 函数定义
const hNIdx = code.indexOf('function _$hN');
console.log('function _$hN @', hNIdx);
if (hNIdx > 0) {
  const openBrace = code.indexOf('{', hNIdx);
  let stack = 0, end = -1;
  for (let i = openBrace; i < Math.min(openBrace + 50000, code.length); i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  console.log('_$hN 定义:', code.substring(hNIdx, Math.min(end + 1, hNIdx + 800)));
  fs.writeFileSync('/tmp/nx_fn_hN.js', code.substring(hNIdx, end + 1));
}

// 找 _$m3 函数定义（bytecode 解码）
const m3Idx = code.indexOf('function _$m3');
console.log('\nfunction _$m3 @', m3Idx);
if (m3Idx > 0) {
  const openBrace = code.indexOf('{', m3Idx);
  let stack = 0, end = -1;
  for (let i = openBrace; i < Math.min(openBrace + 50000, code.length); i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  console.log('_$m3 定义:', code.substring(m3Idx, Math.min(end + 1, m3Idx + 800)));
  fs.writeFileSync('/tmp/nx_fn_m3.js', code.substring(m3Idx, end + 1));
}

// 找 @104953 的 bytecode 对象构造（_$$a._$kN=_$hN()）上下文
console.log('\n=== @104953 上下文（bytecode 对象构造）===');
console.log(code.substring(104953 - 400, 104953 + 300));
