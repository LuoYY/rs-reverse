// 重大线索：cap = cdArr.slice(2, 2+cap.len) 完全吻合！
// 关键问题：base 是否也是 cdArr 的切片/变换？
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

function decryptCd(str) {
  const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3];
    if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4));
    if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
    if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]);
  }
  return ans;
}

const live = data.filter(s => s.cap && s.cap.length);
const s = live[0];
const cdArr = decryptCd(s.cd);
const cap = s.cap;
const base = s.base;

console.log('cdArr.len=' + cdArr.length + ' cap.len=' + cap.length + ' base.len=' + base.length);

// 1. 验证 cap = cdArr[2:2+len]
console.log('\n1. cap vs cdArr[2:]:', JSON.stringify(cap) === JSON.stringify(cdArr.slice(2, 2 + cap.length)) ? '✓完全吻合' : '✗');

// 2. cap 之后 cdArr 还有什么？capEnd = 2+135 = 137。看 cdArr[137:200]
console.log('\n2. cdArr[137:220]（cap 之后）:', cdArr.slice(137, 220).join(','));

// 3. base 是否 = cdArr 的某切片？
console.log('\n3. 搜索 base 在 cdArr 中的位置：');
const base8 = base.slice(0, 8).join(',');
for (let i = 0; i + 8 <= cdArr.length; i++) {
  if (cdArr.slice(i, i + 8).join(',') === base8) {
    console.log('  ★ base[0:8] 出现在 cdArr@' + i);
  }
}

// 4. base 是否 = cap 的 huffman 解码？
// cap[0]=113, base[0]=179。cap 可能是编码数据
// 尝试 base = cap 解码（numarr 6bit → 8bit）
console.log('\n4. cap→base 变换尝试：');
// cap 值是 0-191，含 0 分隔符。numarr 编码？
// 先看 cap 与 base 的长度比：cap=135, base=166
console.log('cap[0:30]:', cap.slice(0, 30).join(','));
console.log('base[0:30]:', base.slice(0, 30).join(','));

// 5. 关键：base 的生成可能依赖 cap + keys（cd 派生）。但 base 是否 = f(cap) 或 f(cdArr)？
// 检查 cdArr 其他部分（keys 区域之后）是否含 base 片段
console.log('\n5. cdArr 尾部（keys 区域后）:');
// keys 在 cdArr 哪个位置？end=(cdArr[0]<<8|cdArr[1])+2=138
const end = (cdArr[0] << 8 | cdArr[1]) + 2;
console.log('  end=' + end + ' cdArr[end:end+40]=' + cdArr.slice(end, end + 40).join(','));
