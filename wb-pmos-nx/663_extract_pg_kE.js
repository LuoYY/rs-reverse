/**
 * 663_extract_pg_kE.js
 * 提取内层 VM 核心解释器（_$pg / _$kE / _$ml）完整源码
 * 理解 basearr 构造（[25-28] 生成）
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');

function extractFn(name) {
  // function name(
  const idx = code.indexOf('function ' + name);
  if (idx >= 0) {
    const openBrace = code.indexOf('{', idx);
    let stack = 0, end = -1;
    for (let i = openBrace; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
    }
    return { pos: idx, src: code.substring(idx, end + 1) };
  }
  // name=function
  const re = new RegExp(name + '\\s*=\\s*function', 'g');
  const m = re.exec(code);
  if (m) {
    const openBrace = code.indexOf('{', m.index + m[0].length);
    let stack = 0, end = -1;
    for (let i = openBrace; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
    }
    return { pos: m.index, src: code.substring(m.index, end + 1) };
  }
  return null;
}

for (const name of ['_$kE', '_$pg', '_$pn', '_$js', '_$ml']) {
  const fn = extractFn(name);
  if (fn) {
    console.log(`\n=== ${name} @${fn.pos} (${fn.src.length} 字符) ===`);
    console.log(fn.src.substring(0, 800));
    fs.writeFileSync('/tmp/nx_dyn_' + name + '.js', fn.src);
  } else {
    console.log(`\n${name}: 未找到`);
  }
}

// 搜 _$kE 定义（可能在 _$ml 内部或赋值）
const kEIdx = code.indexOf('_$kE=');
console.log('\n_$kE= @', kEIdx);
if (kEIdx > 0) console.log('  上下文:', code.substring(kEIdx - 50, kEIdx + 300));
