/**
 * 677_cur_pg.js
 * 分析当前 dynCode 的 _$pg（basearr 构造 trampoline）+ 核心解释器定位
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_eval_h1.js', 'utf8');

// _$pg trampoline
const pgIdx = code.indexOf('function _$pg');
console.log('_$pg @', pgIdx);
if (pgIdx > 0) console.log('源码:', code.substring(pgIdx, pgIdx + 120));

// _$$p 定义
const ppIdx = code.indexOf('_$$p=');
console.log('\n_$$p= @', ppIdx);
if (ppIdx > 0) console.log('上下文:', code.substring(ppIdx - 30, ppIdx + 150));

// _$$p 的使用（basearr 构造）
const ppUse = code.match(/_\$\$p\[[^\]]*\]/g);
console.log('\n_$$p[N] 使用:', ppUse ? ppUse.join(', ') : '无');

// 找核心解释器（大函数）
const funcs = [];
const re = /function\s+([_$][\w$]*)\s*\(/g;
let m;
while ((m = re.exec(code)) !== null) {
  const openBrace = code.indexOf('{', m.index + m[0].length);
  if (openBrace < 0) continue;
  let stack = 0, end = -1;
  for (let i = openBrace; i < Math.min(openBrace + 300000, code.length); i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  const len = end - m.index;
  funcs.push({ name: m[1], len, pos: m.index });
}
console.log('\n函数数:', funcs.length);
funcs.sort((a, b) => b.len - a.len).slice(0, 10).forEach(f => console.log(`  ${f.name}: len=${f.len} @${f.pos}`));

// 找 basearr 构造相关（时间/循环/环境）
for (const kw of ['getTime', 'Date', 'while(1)', 'charCodeAt']) {
  const idx = code.indexOf(kw);
  console.log(`\n${kw}: @${idx}`);
}

// 找 0x39 相关（jsdom basearr 值域 0x38-0x3c）
const jsCounts = {};
for (let i = 0; i < code.length; i += 5000) {
  const chunk = code.substring(i, i + 5000);
  const mc = chunk.match(/\d+/g);
  if (mc) {
    for (const n of mc.slice(0, 20)) {
      const v = parseInt(n);
      if (v >= 50 && v <= 70) jsCounts[v] = (jsCounts[v] || 0) + 1;
    }
  }
}
console.log('\n值 50-70 分布:', JSON.stringify(jsCounts));
