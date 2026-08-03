/**
 * 662_static_basearr.js
 * 静态分析 dynCode：定位 basearr 构造代码（环境检测 + [25-28] 生成）
 * 632 号调用栈：_$pg → _$pn → _$js(_$k4) → basearr push
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
console.log('dynCode len:', code.length);

// 1. 找 _$k4 / _$js 定义
for (const name of ['_$k4', '_$js', '_$nC', '_$ml']) {
  const idx = code.indexOf('function ' + name);
  const idx2 = code.indexOf(name + '=');
  console.log(`\n${name}: function@${idx} assign@${idx2}`);
  if (idx >= 0) {
    const openBrace = code.indexOf('{', idx);
    let stack = 0, end = -1;
    for (let i = openBrace; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
    }
    console.log('  源码:', code.substring(idx, Math.min(end + 1, idx + 500)));
  }
}

// 2. 找 basearr 构造：环境检测值模式（大量 push 数字）
// 632 号 basearr 值域 0x38-0x3c 为主
// 找 push 环境值的代码（如 _$cO.push 或 [0]= 模式）
const pushPatterns = code.match(/_\$[a-zA-Z0-9_$]{1,3}\.push\([^)]*\)/g);
if (pushPatterns) {
  console.log('\npush 模式数:', pushPatterns.length);
  const counts = {};
  for (const p of pushPatterns) counts[p.substring(0, 30)] = (counts[p.substring(0, 30)] || 0) + 1;
  Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([p, c]) => console.log(`  ${c}x ${p}`));
}

// 3. 找 [_$bA[N]] 索引赋值（环境检测数组）
const idxAssign = code.match(/\[_\$[a-zA-Z0-9_$]{1,3}\[(\d+)\]\]=/g);
if (idxAssign) {
  console.log('\n索引赋值数:', idxAssign.length);
  const counts = {};
  for (const a of idxAssign) {
    const m = a.match(/\[(\d+)\]/);
    const num = m[1];
    counts[num] = (counts[num] || 0) + 1;
  }
  Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([num, c]) => console.log(`  [${num}] x${c}`));
}

// 4. 找时间/循环/加密特征（[25-28] 生成候选）
for (const kw of ['getTime', 'getFloat16', 'execScript', 'toDataURL', 'charCodeAt', 'toString(16)', '0x9e3779b9', '0x11b']) {
  const idx = code.indexOf(kw);
  console.log(`\n${kw}: ${idx >= 0 ? '@' + idx : '无'}`);
}
