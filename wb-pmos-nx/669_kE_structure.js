/**
 * 669_kE_structure.js
 * 分析 _$kE while 体结构：操作码获取 + 子程序调度 + basearr 子程序 103
 */
const fs = require('fs');

const kE = fs.readFileSync('/tmp/nx_dyn__$kE.js', 'utf8');
const body = fs.readFileSync('/tmp/nx_kE_while.js', 'utf8');

// while 体开头（操作码获取）
console.log('=== while 体开头 800 字符 ===');
console.log(body.substring(0, 800));

// 找操作码获取（_$f3=...）
const fetchRe = /_\$f3=_?[^;]{0,30}/g;
let m;
const fetches = [];
while ((m = fetchRe.exec(body)) !== null) fetches.push(m[0]);
console.log('\n操作码获取:', fetches.slice(0, 5));

// 找子程序调用（_$kE(N) 递归）
const subRe = /_\$kE\((\d+)[^)]*\)/g;
const subs = {};
while ((m = subRe.exec(kE)) !== null) {
  subs[m[1]] = (subs[m[1]] || 0) + 1;
}
console.log('\n_$kE(N) 子程序调用（N → 次数）:');
Object.entries(subs).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([n, c]) => console.log(`  ${n}: ${c}`));

// 找 _$dM(N) 调用
const dMRe = /_\$dM\((\d+)[^)]*\)/g;
const dMs = {};
while ((m = dMRe.exec(kE)) !== null) {
  dMs[m[1]] = (dMs[m[1]] || 0) + 1;
}
console.log('\n_$dM(N) 子程序调用:');
Object.entries(dMs).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([n, c]) => console.log(`  ${n}: ${c}`));

// 找 _$$p[N] 填充（_$$p 出现处）
const ppIdx = kE.indexOf('_$$p');
console.log('\n_$kE 里 _$$p:', ppIdx);
if (ppIdx > 0) console.log('上下文:', kE.substring(ppIdx - 60, ppIdx + 120));
