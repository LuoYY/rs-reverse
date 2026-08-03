/** 427 语法测试：验证 patch 后代码语法合法（不跑网络） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
console.log('raw len:', code.length);

let runCode = code;
// op69
const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
if (re69.test(runCode)) {
  runCode = runCode.replace(re69, '!$1?($2+=0):0;');
  console.log('op69 patched');
}
// env patch
let envCnt = 0;
runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
  envCnt++;
  return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
});
console.log('env patch:', envCnt);
// call patch
let callCnt = 0;
runCode = runCode.replace(/([_$\w]+)\[([_$\w]+)\[(\d+)\]\]\(/g, (mm, obj, arr, num) => {
  callCnt++;
  return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),(' + obj + ')[(' + arr + ')[' + num + ']])&&(' + obj + ')[(' + arr + ')[' + num + ']](';
});
console.log('call patch:', callCnt);
// while 插桩
let gIdx = 0;
runCode = runCode.replace(/while\(1\)\{/g, () => {
  gIdx++;
  return 'while(1){window.__w' + gIdx + '=(window.__w' + gIdx + '||0)+1;window.__lastW=' + gIdx + ';if(window.__all>8000000)throw new Error("ALL_LOOP_w' + gIdx + '");window.__all=(window.__all||0)+1;';
});
console.log('while:', gIdx);

// 语法检查
try {
  new Function(runCode);
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗ 语法错误:', e.message);
  // 定位错误位置
  const m = e.message.match(/position (\d+)/);
  if (m) {
    const pos = +m[1];
    console.log('错误位置附近:', runCode.substring(Math.max(0, pos - 120), pos + 80));
  }
}
fs.writeFileSync('/tmp/nx_dyncode_safe.js', runCode);
console.log('saved /tmp/nx_dyncode_safe.js');
