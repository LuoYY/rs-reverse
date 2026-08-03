/**
 * 629_extract_funcs.js
 * 从 nx 外层 JS（2437991.js）提取 basearr 构造相关函数源码
 * 628 号调用栈：_$$8 → _$hY → _$kz → _$kv
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const code = fs.readFileSync(OUTER_JS, 'utf8');
console.log('外层 JS len:', code.length);

// 提取函数定义（function _$kv(...) {...} 或 _$kv = function 或 _$kv=function）
function extractFn(name) {
  // 模式1: function _$kv( 
  let idx = code.indexOf('function ' + name);
  if (idx >= 0) {
    return code.substring(idx, Math.min(idx + 5000, code.length));
  }
  // 模式2: _$kv=function 或 _$kv = function
  const re = new RegExp(name + '\\s*=\\s*function', 'g');
  const m = re.exec(code);
  if (m) {
    const start = m.index;
    // 找函数体（第一个 { 到匹配的 }）
    let brace = code.indexOf('{', m.index + m[0].length);
    if (brace < 0) return null;
    let depth = 0;
    for (let i = brace; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') { depth--; if (depth === 0) return code.substring(start, i + 1); }
    }
  }
  return null;
}

const names = ['_$kv', '_$kz', '_$$8', '_$hY', '_$mi', '_$ml'];
for (const n of names) {
  const def = extractFn(n);
  if (def) {
    console.log(`\n=== ${n} (${def.length} 字符) ===`);
    console.log(def.substring(0, 1500));
    fs.writeFileSync('/tmp/nx_fn_' + n + '.js', def);
  } else {
    console.log(`\n${n}: 未找到`);
  }
}
