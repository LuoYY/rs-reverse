// 测试 gS 字符串格式：转字符 + 各种分割
const states = require('./nx_md_states.json');
const gs13 = states.find(s => s.gS && s.gS.length === 13);
const gs92 = states.find(s => s.gS && s.gS.length === 92);

function toStr(arr) {
  return arr.map(v => String.fromCharCode(v)).join('');
}
const s92 = toStr(gs92.gS);
console.log('gS92 字符串:');
console.log(JSON.stringify(s92));
console.log();
// 用换行正则分割
const re = /\r\n?|[\u2028\u2029]/;
console.log('split 换行:', JSON.stringify(s92.split(re)));
console.log();
// 用 \x00 分割
console.log('split \\x00:', JSON.stringify(s92.split('\x00').slice(0, 30)));
console.log();
// 用 \x0c 分割
console.log('split \\x0c:', JSON.stringify(s92.split('\x0c')));
console.log();
// 观察原始数字（ASCII 分析）
console.log('gS92 前 30 值:', gs92.gS.slice(0, 30).join(','));
console.log('值域:', Math.min(...gs92.gS), '-', Math.max(...gs92.gS));
