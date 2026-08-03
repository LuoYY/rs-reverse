/**
 * 642_extract_dyn_funcs.js
 * 从 dynCode 提取 basearr 构造函数（_$pg/_$pn/_$js）
 * 632 号调用栈：basearr 由 _$pg → _$pn → _$js 构造
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dynFile = '/tmp/nx_dyn_full.js';
const code = fs.readFileSync(dynFile, 'utf8');
console.log('dynCode len:', code.length);

// 提取函数定义
function extractFn(name) {
  // 模式1: function _$pg(
  let idx = code.indexOf('function ' + name);
  if (idx >= 0) {
    // 找函数体
    const openBrace = code.indexOf('{', idx);
    let stack = 0;
    for (let i = openBrace; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) return code.substring(idx, i + 1); }
    }
  }
  // 模式2: _$pg=function 或 _$pg = function
  const re = new RegExp(name + '\\s*=\\s*function', 'g');
  const m = re.exec(code);
  if (m) {
    const openBrace = code.indexOf('{', m.index + m[0].length);
    let stack = 0;
    for (let i = openBrace; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) return code.substring(m.index, i + 1); }
    }
  }
  return null;
}

const names = ['_$pg', '_$pn', '_$js', '_$hY', '_$$8', '_$kz', '_$kv', '_$gr'];
for (const n of names) {
  const def = extractFn(n);
  if (def) {
    console.log(`\n=== ${n} (${def.length} 字符) ===`);
    console.log(def.substring(0, 800));
    fs.writeFileSync('/tmp/nx_dyn_fn_' + n + '.js', def);
  } else {
    console.log(`\n${n}: 未找到`);
  }
}
