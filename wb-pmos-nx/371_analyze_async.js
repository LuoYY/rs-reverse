/**
 * 371_analyze_async.js
 * 分析动态代码的 XHR/fetch/setTimeout/网络 调用（判断卡住在异步等待）
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_patched.js', 'utf8');

console.log('=== XMLHttpRequest 调用 ===');
console.log('XHR 创建:', (code.match(/new XMLHttpRequest/g) || []).length);
console.log('XHR.open:', (code.match(/\.open\(/g) || []).length);
console.log('XHR.send:', (code.match(/\.send\(/g) || []).length);
console.log('fetch:', (code.match(/fetch\(/g) || []).length);

console.log('\n=== 定时器 ===');
console.log('setTimeout:', (code.match(/setTimeout/g) || []).length);
console.log('setInterval:', (code.match(/setInterval/g) || []).length);

console.log('\n=== 网络相关字符串 ===');
for (const s of ['XMLHttpRequest', 'open(', 'send(', 'onreadystatechange', 'readyState', 'status', 'setRequestHeader', 'withCredentials']) {
  const n = (code.match(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (n > 0) console.log(s + ':', n);
}

// 找 XHR 相关代码片段
const xhrIdx = code.indexOf('XMLHttpRequest');
if (xhrIdx > 0) {
  console.log('\n=== XHR 代码片段 ===');
  console.log(code.substring(Math.max(0, xhrIdx - 100), xhrIdx + 200).replace(/\n/g, ' '));
}

// 找 open( 调用上下文
const openIdx = code.indexOf('.open(');
if (openIdx > 0) {
  console.log('\n=== open( 调用上下文 ===');
  console.log(code.substring(Math.max(0, openIdx - 150), openIdx + 150).replace(/\n/g, ' '));
}
