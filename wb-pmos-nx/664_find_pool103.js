/**
 * 664_find_pool103.js
 * 找 dynCode 里 _$$p 函数池的注册（[103] = basearr 构造函数）
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');

// 1. 找 _$$p[N]= 赋值
const assigns = [];
const re = /_\$\$p\[([^\]]+)\]\s*=/g;
let m;
while ((m = re.exec(code)) !== null) {
  assigns.push({ key: m[1], idx: m.index });
}
console.log('_$$p[N]= 赋值数:', assigns.length);
assigns.slice(0, 20).forEach(a => {
  console.log(`  _$$p[${a.key}] @${a.idx}: ${code.substring(a.idx, a.idx + 80)}`);
});

// 2. 找 _$$p.push( 或 apply(_$$p,
const pushRe = /_\$\$p\.push\(/g;
let pm;
let pushCount = 0;
while ((pm = pushRe.exec(code)) !== null) { pushCount++; }
console.log('\n_$$p.push 次数:', pushCount);

// 3. _$$p 相关的赋值（_$$p= 定义 + 后续）
const defIdx = code.indexOf('_$$p=');
console.log('\n_$$p= 定义 @', defIdx);
console.log('上下文:', code.substring(defIdx - 30, defIdx + 100));

// 4. 找 basearr 构造相关：搜 [_$bA[103]] 使用
const bA103 = code.match(/_\$bA\[103\]/g);
console.log('\n_$bA[103] 使用:', bA103 ? bA103.length : 0);

// 5. 找 [_$bA[N]] 常量值（_$bA 的定义/填充）
const bAIdx = code.indexOf('_$bA');
console.log('\n_$bA 首次:', bAIdx);
console.log('上下文:', code.substring(Math.max(0, bAIdx - 50), bAIdx + 300));

// 6. 分析 _$ml 里的 trampoline 注册（_$ml 内定义 trampoline → 可能注册到 _$$p）
const ml = fs.readFileSync('/tmp/nx_dyn__$ml.js', 'utf8');
console.log('\n_$ml 里的 _$$p 引用:', (ml.match(/_$$p/g) || []).length);
// 找 _$ml 里的 basearr 相关
for (const kw of ['103', '_$$p[', 'basearr']) {
  const idx = ml.indexOf(kw);
  console.log(`_$ml 里 "${kw}": @${idx}`);
}
