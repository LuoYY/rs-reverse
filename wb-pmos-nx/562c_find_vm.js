/** 562c 找 VM trampoline（_$$Y(_,0,_.len,_) 4 参调用 + 函数名动态） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// 瑞数内层 VM trampoline 特征：_$X(_$ctx,0,_$ctx._$BC.length,_$args)
// 或 _$X(_$a,0,_$a._$b.length,_$c)
// 找 [,0, 模式 + .length
const re = /([_$][\w$]+)\(([_$][\w$]+),0,([_$][\w$]+)\.([_$][\w$]+)\.length,([_$][\w$]+)\)/g;
let m, cnt = 0;
console.log('=== 4 参 VM 调用（trampoline）===');
while ((m = re.exec(code)) !== null) {
  cnt++;
  console.log(`#${cnt} @${m.index}: ${m[1]}(${m[2]},0,${m[3]}.${m[4]}.length,${m[5]})`);
  if (cnt > 5) break;
}
if (!cnt) {
  // 宽松匹配：) ,0, . .length
  const re2 = /([_$][\w$]+)\(([_$][\w$]+),\s*0,\s*([_$][\w$]+)\.([_$][\w$]+)\.length/g;
  let m2;
  while ((m2 = re2.exec(code)) !== null) {
    cnt++;
    console.log(`#${cnt} @${m2.index}: ${m2[1]}(${m2[2]},0,${m2[3]}.${m2[4]}.length)`);
    if (cnt > 8) break;
  }
}
console.log('总匹配:', cnt);
// 找 bytecode 属性构造：= 后跟 _ 前缀函数调用的 ._$xx= 赋值链
console.log('\n=== ._$cC / ._$hJ 等 bytecode 属性名候选 ===');
for (const prop of ['_$cC', '_$hJ', '_$eW', '_$iz', '_$hL', '_$oD']) {
  const n = (code.match(new RegExp('\\.' + prop.replace('$', '\\$'), 'g')) || []).length;
  if (n) console.log(prop + ':', n, '次');
}
