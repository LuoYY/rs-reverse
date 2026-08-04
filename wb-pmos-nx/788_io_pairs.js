/** 788_io_pairs.js 准备 cap→base 输入输出对 */
const fs = require('fs');
// 解析 JS 数组字面量
function parseJSArr(text) {
  return eval(text);
}
let axRaw = fs.readFileSync('/tmp/nx_ax_input.json', 'utf8').trim();
axRaw = axRaw.replace(/^\d+:/, ''); // 去掉行号前缀
const ax = parseJSArr(axRaw);
console.log('ax_input: cap.len=', ax[0].length, ' second=', ax[1]);
console.log('cap[0:40]=', ax[0].slice(0, 40).join(','));
console.log('cap tail20=', ax[0].slice(-20).join(','));

// gx program
try {
  const gp = JSON.parse(fs.readFileSync('/tmp/nx_gx_program.json', 'utf8'));
  console.log('\ngx_program type:', typeof gp, Array.isArray(gp) ? 'len=' + gp.length : '');
  if (Array.isArray(gp)) console.log('gx[0:20]:', JSON.stringify(gp.slice(0, 20)).substring(0, 800));
  else console.log('gx keys:', Object.keys(gp).slice(0, 20), 'json head:', JSON.stringify(gp).substring(0, 500));
} catch (e) { console.log('gx_program err:', e.message); }
try {
  const f7 = JSON.parse(fs.readFileSync('/tmp/nx_frame7_gx.json', 'utf8'));
  console.log('\nframe7 type:', typeof f7, Array.isArray(f7) ? 'len=' + f7.length : '');
  if (Array.isArray(f7)) console.log('frame7[0:20]:', JSON.stringify(f7.slice(0, 20)).substring(0, 800));
  else console.log('frame7 keys:', Object.keys(f7).slice(0, 20));
} catch (e) { console.log('frame7 err:', e.message); }
