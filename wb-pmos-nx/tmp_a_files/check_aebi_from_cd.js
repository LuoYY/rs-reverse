// 关键验证：aebi 是否 = cd 派生？
// cd 解码数组（keys 段）里有没有 aebi？
// keys[7]=308B 资源列表，keys[27]=932B 扩展名 —— aebi(2553条) 不在其中
// 但 scj 可能是 cd 派生的配置（含 aebi）
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.cd);
console.log('实时样本:', live.length);

// 检查 cap（cdArr[2:] 之后）是否含 aebi
// cap[0]=113 头，cap[1]=block，cap[2:6]=长度，cap[6]=0，cap[7:]=数据
// aebi 可能 = cap 的数据区（numarr 编码的指令）
const s = live[0];
console.log('cap len:', s.cap.length);
console.log('cap[0:20]:', s.cap.slice(0, 20).join(','));
// cap 数据区解码（numarr 编码的字节流）
// 用 _$ez 的 numarr 解码格式
function decodeNumarr(vals) {
  const out = [];
  let i = 0;
  while (i < vals.length) {
    const b = vals[i];
    if (b === 1) { i++; let v = 0, has = false; while (i < vals.length && vals[i] >= 48 && vals[i] <= 57) { v = v * 10 + (vals[i] - 48); has = true; i++; } out.push(has ? v : -1); }
    else if (b === 0) { out.push(0); i++; }
    else { out.push(b); i++; }
  }
  return out;
}
const dec = decodeNumarr(s.cap.slice(7));
console.log('cap[7:] numarr 解码 len:', dec.length);
console.log('解码 head:', dec.slice(0, 20).join(','));
// 转字符串
const str = dec.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
console.log('解码 ASCII(前100):', str.slice(0, 100));
