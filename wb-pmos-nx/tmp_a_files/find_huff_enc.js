// 在 dynCode 中找 huffman 编码器（numarrEncrypt）的实现
// huffman 表：1-254 各 1 次权重, 255 权重 6, 0 权重 45
// 特征：{total:1,idx:i} 或类似结构 + while(a.length>1) 合并
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');

// 搜索特征：push({total:1 或 {total:6 或 idx:255 / idx:0
const patterns = ['total:1', 'total:6', 'idx:255', 'idx:0', '45,', 'while(a.length>1)', 'splice(0,2)'];
for (const p of patterns) {
  const idx = c.indexOf(p);
  console.log('模式 "' + p + '": @' + idx + (idx >= 0 ? ' ...' + c.slice(idx - 80, idx + 120).replace(/\n/g, ' ') : ''));
  console.log();
}

// 搜索 _$k0 中 huffman 相关（0/255 权重）
// 也找 numarrEncrypt 函数名（可能叫 _$e4 / _$bY 等）
// 搜索所有 function 定义 + 内部含 slice(2)
const fns = [];
let i = 0;
while ((i = c.indexOf('function ', i)) >= 0) {
  const j = c.indexOf('(', i + 9);
  const name = c.slice(i + 9, j).trim();
  const k = c.indexOf('{', j);
  // 找 body 含 total: 或 splice
  const body = c.slice(k, k + 3000);
  if (body.includes('total') || body.includes('length > 1')) {
    fns.push(name + ' @' + i + ' body含total/length>1');
  }
  i = j + 1;
}
console.log('含 huffman 特征的函数:', fns.join(' | '));
