const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
const seg = c.slice(start, start + 90000);
// <256 块 @43 结束 @14375 → 256-444 区从 14375 开始（<444 的 else）
const region = seg.slice(14375, 14375 + 5000);
// 找 383 分支
let idx = region.indexOf('===383');
if (idx < 0) idx = region.indexOf('383');
console.log('256-444 区内容 (前 4500):');
console.log(region.slice(0, 4500));
