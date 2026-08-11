// 关键假设：cap 和 base 都是 cdArr 的连续切片！
// cap = cdArr[2:2+capLen]，base = cdArr[2+capLen : 2+capLen+baseLen]？
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

const live = data.filter(s => s.cap && s.cap.length && s.keys2 && s.cd);
console.log('有 cd 的实时样本:', live.length);

live.forEach((s, i) => {
  const cdArr = decryptCd(s.cd);
  const cap = s.cap;
  const base = s.base;
  // 验证 cap = cdArr[2:2+capLen]
  const capOk = JSON.stringify(cap) === JSON.stringify(cdArr.slice(2, 2 + cap.length));
  // 检查 base = cdArr 的哪个位置
  const baseHead = base.slice(0, 8).join(',');
  let pos = -1;
  for (let j = 0; j + 8 <= cdArr.length; j++) {
    if (cdArr.slice(j, j + 8).join(',') === baseHead) { pos = j; break; }
  }
  console.log('#' + i, 'nsd=' + s.nsd, 'capOk=' + capOk, 'base[0:8]在cdArr@' + pos, 'capEnd=2+' + cap.length + '=' + (2 + cap.length));
  if (pos >= 0) {
    // 对比 cdArr[pos:] 与 base
    const cdSeg = cdArr.slice(pos, pos + base.length);
    const match = cdSeg.filter((v, j) => v === base[j]).length;
    console.log('  cdArr[' + pos + ':' + (pos + base.length) + '] 与 base 匹配 ' + match + '/' + base.length);
  }
});
