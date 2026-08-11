const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
const seg = c.slice(start, start + 90000);
// while(3) 范围 [0, w4]。w4 = seg.indexOf('_$oJ,_$pW,_$g6=_$cg') = 168106? 不对，那可能是负值处理。
// 打印 seg 内所有 '<NNN){' 阈值（在 300 以上）
const th = seg.match(/_ \$jc<(\d+)\)\{/g);
if (th) console.log('阈值:', [...new Set(th)].join(' '));
// op383 处理：查找 pc619 附近的 383 分支。383 > 320 > 256。
// 找 '<384){' 或 '<444) 内的 else
// 在 while(3) 内搜索 '_$jc<384'
let idx = seg.indexOf('_$jc<384){');
console.log('_$jc<384){ @' + (start + idx) + ' (seg=' + idx + ')');
if (idx >= 0 && idx < 168106) {
  console.log(seg.slice(idx, idx + 1000));
}
// 也找 '<384' 附近（可能写法不同）
for (const p of ['_$jc<384', '_$jc<448', '_$jc<400']) {
  let i = seg.indexOf(p);
  console.log(p + ' @seg=' + i, '(w3内:', i >= 0 && i < 168106, ')');
}
