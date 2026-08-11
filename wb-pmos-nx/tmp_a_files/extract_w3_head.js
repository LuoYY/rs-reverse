const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
const seg = c.slice(start, start + 90000);
for (const pat of ['_$jc===383', '_$jc==383', '383){', '383;', '_$jc>=383', '_$jc>383', '383)']) {
  let i = seg.indexOf(pat);
  console.log(pat + ' @' + i + (i >= 0 ? ': ' + seg.slice(Math.max(0, i - 60), i + 150) : ''));
}
console.log('=== 开头 1800 ===');
console.log(seg.slice(0, 1800));
