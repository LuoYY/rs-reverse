/**
 * 391_analyze_dm.js
 * 离线分析 170543 前后 3000 字符，找 documentMode 访问（X[Y].documentMode 形式）
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_envfull.js', 'utf8');

const pos = 170543;
console.log('=== 169543-171543 (2000 字符) ===');
console.log(code.substring(pos - 1000, pos + 1000).replace(/\n/g, ' '));
console.log('\n\n=== 169043-169543 (500 字符前) ===');
console.log(code.substring(pos - 1500, pos - 1000).replace(/\n/g, ' '));
