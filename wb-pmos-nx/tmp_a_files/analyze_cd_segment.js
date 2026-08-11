// 关键假设：[78:90] = cd 解码数组 ans 的某段（XOR offset 后）？
// keys 是从 ans 切出的，[78:90] 可能 = ans 的其他段
const samples = require('./nx_full_samples.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

function decryptCd(str) {
  const idxmap = {};
  NX_BS.split('').forEach((k, i) => { idxmap[k] = i; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3];
    if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4));
    if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
    if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]);
  }
  return ans;
}
function getLensGo(numarr, idx) {
  const item = numarr[idx]; idx++;
  let lens;
  if ((item & 128) === 0) lens = item;
  else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
  else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
  else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
  else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
  else lens = item;
  return [lens, idx];
}
function genKeysSim(ans) {
  const keys = [];
  let op = 1, gap;
  for (let i = 0; i < ans[0]; i++) {
    [gap, op] = getLensGo(ans, op);
    if (gap < 0 || op + gap > ans.length) return null;
    keys.push(ans.slice(op, op + gap));
    op += gap;
  }
  return keys;
}
function deriveOffsetNx(tail) {
  if (tail.length < 40) return null;
  const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
  for (let k0 = 0; k0 <= 127; k0++) {
    const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
    for (let k1 = 0; k1 <= 127; k1++) {
      const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
      const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
      const ans = tail.map((b, i) => b ^ offset[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      const keys = genKeysSim(ans);
      if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset;
    }
  }
  return null;
}
function deriveAll(cd) {
  const cdArr = decryptCd(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  const offset = deriveOffsetNx(tail);
  if (!offset) return null;
  const ans = tail.map((b, i) => b ^ offset[i % 8]);
  const keys = genKeysSim(ans);
  return { ans, tail, offset, keys, cdArr };
}

console.log('=== cd 解码数组 vs [78:90] ===');
for (const s of samples) {
  const d = deriveAll(s.cd);
  if (!d) { console.log('derive fail'); continue; }
  const seg = s.base.slice(78, 90);
  const ans = d.ans;
  console.log('nsd=' + s.nsd + ' ans.len=' + ans.length + ' keys.len=' + d.keys.length + ' keys[2]@' + (() => { /* 定位 keys2 在 ans 中位置 */ return ''; })());
  // 在 ans 中搜 seg（连续 12B）
  for (let i = 0; i + 12 <= ans.length; i++) {
    if (ans.slice(i, i + 12).join(',') === seg.join(',')) {
      console.log('  ★★ [78:90] 直接出现在 ans@' + i + ' !!!');
    }
  }
  // 在 tail 中搜
  for (let i = 0; i + 12 <= d.tail.length; i++) {
    if (d.tail.slice(i, i + 12).join(',') === seg.join(',')) {
      console.log('  ★ [78:90] 出现在 tail@' + i);
    }
  }
  // keys2 在 ans 的位置：通过 keys[2] 找
  const k2 = d.keys[2];
  for (let i = 0; i + 48 <= ans.length; i++) {
    if (ans.slice(i, i + 48).join(',') === k2.join(',')) {
      console.log('  keys[2] 在 ans@' + i);
    }
  }
}

// 更宽松：检查 [78:90] 每字节是否 = ans[i]（不同 i 可不同）
console.log('\n=== [78:90] 每字节在 ans 中的分布 ===');
for (const s of samples) {
  const d = deriveAll(s.cd);
  if (!d) continue;
  const seg = s.base.slice(78, 90);
  const ans = d.ans;
  const hits = seg.map((v, j) => {
    const idx = ans.indexOf(v);
    return v + '→' + idx;
  });
  console.log('nsd=' + s.nsd + ' [78:90]→ans索引: ' + hits.join(' '));
}
