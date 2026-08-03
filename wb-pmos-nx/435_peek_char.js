/** 435 查看 395530 附近原始字符 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_envtrue.js', 'utf8');
const idx = 395530;
const seg = code.substring(idx - 40, idx + 80);
console.log('chars:', JSON.stringify(seg));
console.log('hex:', Buffer.from(seg).toString('hex'));
// 检查是否包含 BOM 或特殊字符
console.log('charCodes:', seg.split('').slice(0, 20).map(c => c.charCodeAt(0)).join(','));
// 测试不同正则
console.log('--- 正则测试 ---');
console.log('/function\\\\s+/:', /function\s+/.test(seg));
console.log('/function/:', /function/.test(seg));
console.log('/\\\\$/:', /\$/.test(seg));
// 简化：在整段找 function 后跟 _$ 的模式
const m = seg.match(/function\s*([_$]?)/);
console.log('function 后:', m ? JSON.stringify(m[0]) : '无');
