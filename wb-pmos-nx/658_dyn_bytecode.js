/**
 * 658_dyn_bytecode.js
 * 提取 dynCode 的 bytecode 池（大数字数组）+ 反编译 basearr 生成
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');

// 找大数字数组（bytecode 池候选）
const re = /=\[((?:-?\d+,?){30,})\]/g;
let m;
let found = 0;
const pools = [];
while ((m = re.exec(code)) !== null && found < 10) {
  const nums = m[1].split(',').map(Number);
  if (nums.every(n => Number.isInteger(n))) {
    pools.push({ pos: m.index, len: nums.length, nums });
    found++;
  }
}
console.log('数字数组池:', pools.length);
for (const p of pools.slice(0, 10)) {
  console.log(`  @${p.pos}: len=${p.len} 头=${p.nums.slice(0, 10).join(',')}`);
}

// 找 _$_$ 或其他 bytecode 池命名
for (const name of ['_$_$', '_$_F', '_$av', '_$lq', '_$$a']) {
  const idx = code.indexOf(name + '=');
  console.log(`\n${name}= @`, idx);
  if (idx > 0) console.log('  上下文:', code.substring(idx, idx + 200).substring(0, 150));
}

// 分析内层 VM 主 dispatcher（_$pg 的 case 结构）
const pgIdx = code.indexOf('function _$pg');
console.log('\n_$pg 函数 @', pgIdx);
if (pgIdx > 0) {
  // 找函数体
  const openBrace = code.indexOf('{', pgIdx);
  let stack = 0, end = -1;
  for (let i = openBrace; i < code.length; i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  const body = code.substring(openBrace, end + 1);
  console.log('_$pg 体长:', body.length);
  fs.writeFileSync('/tmp/nx_dyn_pg.js', body);
  // case 数
  const cases = body.match(/case \d+:/g);
  console.log('case 数:', cases ? cases.length : 0);
  // 找 opcode 分发（_$kK 或类似）
  const opMatches = body.match(/_\$kK===\d+/g);
  console.log('opcode 判断:', opMatches ? opMatches.length : 0);
}
