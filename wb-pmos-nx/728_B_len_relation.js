/**
 * 728_B_len_relation.js
 * base[68:] 长度、base 总长、明文basearr长度、b86数组区长度 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('nsd | baseLen | tail68 | b86数组区 | 明文basearr(b86[2:2+len])');
for (const s of samples) {
  const arrLen = (s.b86[0] << 8) | s.b86[1];
  console.log(`${s.nsd} | ${s.base.length} | ${s.base.length - 68} | ${arrLen}`);
}

// base[68:] 是否 = 明文basearr 的某种变长编码？
// 明文 basearr 长度 L（125-251），base[68:] 长度 97-103
// base[68:] ≈ huffman(明文)？huffman 会变长。base[68:] 更短，不是 huffman
// base[68:] 可能 = 明文 basearr 的"环境数组"版本（不同结构）

// 检查 base[68:] 与明文 basearr 逐字节关系（不按位置，按内容出现）
console.log('\n=== base[68:] 内容 vs 明文basearr 内容重叠 ===');
for (const s of samples.slice(0, 5)) {
  const tail = s.base.slice(68);
  const arrLen = (s.b86[0] << 8) | s.b86[1];
  const plain = s.b86.slice(2, 2 + arrLen);
  // base[68:] 中每个字节是否出现在明文 basearr 中
  let overlap = 0;
  const plainSet = new Set(plain);
  for (const v of tail) if (plainSet.has(v)) overlap++;
  console.log(`nsd=${s.nsd}: base[68:] ${tail.length}B 与明文 ${plain.length}B 值重叠 ${overlap}/${tail.length}`);
}
