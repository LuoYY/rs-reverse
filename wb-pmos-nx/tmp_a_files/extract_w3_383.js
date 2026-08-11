const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
const seg = c.slice(start, start + 90000);
// 找 256-444 区：'else{' 对应 _$jc<256 的 else
// 结构：if(_$jc<444){if(_$jc<256){...}else{<256-444>}}else{...}
// 找 256 分支结束点：匹配括号
// 简化：搜索 '_$jc<444' 后面的结构，找 383 相关分支
// 383 的跳转：_$oL+=-23 或类似。搜 '_$oL+=-' 和 '383'
for (const pat of ['_$oL+=-23', '_$oL+=', '383']) {
  let i = 0, found = 0;
  while ((i = seg.indexOf(pat, i)) >= 0 && found < 8) {
    const ctx = seg.slice(Math.max(0, i - 100), i + 150);
    if (ctx.includes('383')) {
      console.log('=== ' + pat + ' @' + (start + i) + ' ===');
      console.log(ctx);
      console.log();
    }
    i += pat.length; found++;
  }
}
