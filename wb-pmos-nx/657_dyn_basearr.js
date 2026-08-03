/**
 * 657_dyn_basearr.js
 * 分析 dynCode 的 basearr 构造代码（632 号调用栈 _$pg → _$pn → _$js）
 * 提取函数池 _$$p + basearr 构造相关函数，定位 [25-28] 生成
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
console.log('dynCode len:', code.length);

// 1. 找 basearr 数组构造（len 150 的数字数组）
// 特征：push 大量数字 或 数组字面量
const arrLits = code.match(/\[[0-9,\s]{100,}\]/g);
if (arrLits) {
  console.log('\n大数组字面量:', arrLits.length);
  arrLits.slice(0, 5).forEach((a, i) => console.log(`  #${i}: ${a.substring(0, 80)}...`));
}

// 2. 找 _$pg 定义
const pgIdx = code.indexOf('_$pg');
console.log('\n_$pg 位置:', pgIdx);
if (pgIdx > 0) console.log('上下文:', code.substring(pgIdx - 100, pgIdx + 200));

// 3. 找 _$$p 函数池定义
const ppIdx = code.indexOf('_$$p=');
console.log('\n_$$p= 位置:', ppIdx);
if (ppIdx > 0) console.log('上下文:', code.substring(ppIdx - 50, ppIdx + 400));

// 4. 找 _$bA 定义（索引池）
const bAIdx = code.indexOf('_$bA=');
console.log('\n_$bA= 位置:', bAIdx);
if (bAIdx > 0) console.log('上下文:', code.substring(bAIdx - 50, bAIdx + 400));

// 5. 找 basearr 相关关键词
for (const kw of ['basearr', 'numarr', 'getKey', '0x68', 'huffman', 'Encrypt']) {
  const idx = code.indexOf(kw);
  console.log(`\n${kw}: ${idx >= 0 ? '位置 ' + idx : '无'}`);
}
