/**
 * 665_pool_usage.js
 * 分析 dynCode 里 _$$p 的所有使用方式（填充机制）
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');

// 所有 _$$p 出现
const re = /_\$\$p/g;
let m;
const positions = [];
while ((m = re.exec(code)) !== null) positions.push(m.index);
console.log('_$$p 出现次数:', positions.length);

// 每种上下文分类
const contexts = {};
for (const pos of positions) {
  const ctx = code.substring(pos, pos + 30);
  const key = ctx.substring(0, 20);
  contexts[key] = (contexts[key] || 0) + 1;
}
console.log('\n上下文分类:');
Object.entries(contexts).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([c, n]) => console.log(`  ${n}x ${c}`));

// 找 _$$p 的赋值（= _$$p 或 _$$p =）
console.log('\n赋值位置:');
for (const pos of positions) {
  const before = code.substring(Math.max(0, pos - 10), pos);
  const after = code.substring(pos, pos + 40);
  if (/[=+\-(,]/.test(before.slice(-1))) {
    console.log(`  @${pos}: ...${before.slice(-8)} [ _$$p ${after.substring(0, 40)}`);
  }
}

// 找 apply(_$$p 或 push 到 _$$p
console.log('\napply/push 到 _$$p:');
for (const pos of positions) {
  const after = code.substring(pos, pos + 60);
  if (after.includes('.push') || after.includes('apply') || after.includes('splice')) {
    console.log(`  @${pos}: ${after.substring(0, 60)}`);
  }
}
