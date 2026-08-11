// 符号执行验证：base 是否 = _$ez 解码串中提取的子串（经变换）
// 核心假设：base 的 [0:22]（环境段）含资源串的某种编码
const fs = require('fs');
const snap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = snap[0].ez.v;
const samples = require('./nx_full_samples.json');
const real = samples[0].base;

function decodeEZ(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const b = arr[i];
    if (b === 1) { i++; let v = 0, has = false; while (i < arr.length && arr[i] >= 48 && arr[i] <= 57) { v = v * 10 + (arr[i] - 48); has = true; i++; } out.push(has ? v : -1); }
    else if (b === 0) { out.push(0); i++; }
    else { out.push(b); i++; }
  }
  return out;
}
const dec = decodeEZ(ez);
const str = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');

// base[0:22] 转 ASCII 看内容
console.log('base[0:22] ASCII:', real.slice(0, 22).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
console.log('base[22:67] ASCII:', real.slice(22, 67).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
console.log('base[67:110] ASCII:', real.slice(67, 110).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// 关键：base 是否含资源串的字节？搜索 base 各段在 str 中的位置
console.log('\n=== base 各段是否出现在 session 串 ===');
// base[0] = 59 = ';'，session 串中 ';' 分隔。检查 base[1] 等是否 = 资源字符
const segs = [[0, 22], [22, 40], [60, 70], [78, 90]];
for (const [a, b] of segs) {
  const seg = real.slice(a, b);
  const segStr = seg.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
  const idx = str.indexOf(segStr);
  console.log('base[' + a + ':' + b + '] "' + segStr + '" 在 session 串@' + idx);
}

// 检查 base 中是否有完整资源名（MurR7rxG 等）
for (const name of ['MurR7rxG', '3RKyaeh47p90', '3RKyaeh47p90O', '3RKyaeh47p90P']) {
  const bStr = real.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
  console.log(name, 'in base:', bStr.indexOf(name));
}

// 核心洞察：base 可能不是 ASCII，而是加密/编码。检查 base[0]=59(';') 前后
console.log('\nbase[0]=', real[0], '(59 = ;)  base[1]=', real[1], '(148) base[2]=', real[2], '(7)');
console.log("session 串 ';' 后资源: 每个 ; 后是资源名");
// session 串资源名列表
const resources = str.split(';').filter(s => s.length < 60 && s.length > 0);
console.log('\nsession 资源列表(', resources.length, '个):');
resources.forEach((r, i) => console.log(' ', i, JSON.stringify(r.slice(0, 40))));
