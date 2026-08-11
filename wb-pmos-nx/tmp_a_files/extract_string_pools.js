// 提取所有字符串池（_$ll/_$f$/_$oP/_$_L/_$$q/_$_3/_$$M/_$lC/_$lc 等）
// 这些是 JSVMP tokenizer/引擎的字符串常量
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

// 找所有 _$X=[...] 形式的池定义
const poolNames = ['_$ll', '_$f$', '_$oP', '_$_L', '_$$q', '_$_3', '_$$M', '_$lC', '_$lc', '_$n_', '_$pl', '_$b1', '_$f$'];
const found = {};
for (const name of poolNames) {
  // 找 name=[ 或 name=[...] 或 name= 后面跟数组
  const pat1 = name + '=[';
  const pat2 = name + '=[' ;
  let i = c.indexOf(pat1);
  if (i < 0) i = c.indexOf(pat2);
  if (i < 0) {
    // 可能是 name="..." 或 name=fn
    const i2 = c.indexOf(name + '=');
    if (i2 >= 0) {
      const v = c.slice(i2, i2 + 80);
      if (v.includes('[') || v.includes('"') || v.includes("'")) {
        console.log(name + '= @' + i2 + ': ' + v.slice(0, 80));
        found[name] = '?' + v.slice(0, 40);
      }
    }
    continue;
  }
  // 提取数组
  let depth = 0, end = -1;
  for (let j = i + name.length + 1; j < c.length; j++) {
    if (c[j] === '[') depth++;
    else if (c[j] === ']') { depth--; if (depth === 0) { end = j; break; } }
  }
  const arrSrc = c.slice(i + name.length + 1, end + 1);
  console.log(name + ' @' + i + ' len=' + arrSrc.length + ': ' + arrSrc.slice(0, 150));
  found[name] = arrSrc;
  if (name === '_$ll') fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_pool_ll.js', arrSrc);
}
// 也找 tables_init 已有的池
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
console.log('\ntables 池:', Object.keys(t).join(','));
// 评估：dynCode 中还需要哪些池（错误消息等）
// _$ll 的完整赋值
let i = c.indexOf('_$ll=[');
console.log('\n_$ll=[ @' + i);
if (i >= 0) console.log(c.slice(i, i + 3000));
