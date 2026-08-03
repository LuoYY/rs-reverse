/** 464 测试 Proxy 兜底 patch 语法 + 逻辑 */
const fs = require('fs');
const dynCode = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// Proxy 兜底逻辑测试
function __proxy() {
  return new Proxy(function(){}, {
    get: (t, p) => __proxy(),
    set: (t, p, v) => true,
  });
}
// 模拟 op49/op50
const _$pJ = [undefined]; // 环境对象池（缺失）
const _$p_ = []; let _$c6 = 0; const _$ky = 0;
const _$eC = [0, 76]; let _$kL = -1;
// op49: 压栈
_$p_[_$c6++] = ((_$pJ[_$ky]) || __proxy())[_$eC[++_$kL]];
console.log('op49 压栈类型:', typeof _$p_[0], 'isProxy:', !!(_$p_[0] && typeof _$p_[0] === 'object'));
// op50: 设置属性
const _$dA = 5, _$p6 = _$p_[_$c6 - 1], _$aq = [0, 'key'];
try {
  _$p6[_$aq[_$eC[++_$kL]]] = _$dA;
  console.log('op50 赋值成功（无报错）');
} catch (e) { console.log('op50 报错:', e.message); }

// patch 语法测试
let code = dynCode;
const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
if (re69.test(code)) code = code.replace(re69, '!$1?($2+=0):0;');
code = code.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) =>
  '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) =>
  '=((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
// 双层索引兜底改为 __proxy()
let dc = 0;
code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\]\[/g, (mm, x, y) => {
  dc++;
  return '=((' + x + '[' + y + '])||__proxy())[';
});
console.log('double idx patch:', dc);
code = code.replace(/while\(1\)\{/g, () => 'while(1){window.__w1=(window.__w1||0)+1;if(window.__all>15000000)throw new Error("L");window.__all=(window.__all||0)+1;');
try {
  new Function(code);
  console.log('✓ 语法合法');
} catch (e) {
  console.log('✗', e.message);
}
