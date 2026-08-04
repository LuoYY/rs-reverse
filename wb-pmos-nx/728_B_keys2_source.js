/**
 * 728_B_keys2_source.js
 * 关键疑点：basearrB（100开头）vs base179（179开头）都是 be 段 huffman 解码
 * 差异可能：keys2 来源不同（cd 派生 der.keys[2] vs cookie na.slice(11,59)）
 * 验证：triple 数据集里 keys2 与 cd 派生的 keys[2] 是否一致？
 */
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

function makeDecryptKeys(bs) {
  return bs.split('').reduce((ans, key, idx) => {
    const code = key.charCodeAt();
    ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
    ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
    ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
    return ans;
  }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
}
function decryptCd(cd) {
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;
  const arr2 = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr2.push(d1[one] | d2[two]);
    three !== undefined && arr2.push(d3[two] | d4[three]);
    four !== undefined && arr2.push(d5[three] | d6[four]);
  }
  return arr2;
}
function deriveKeys(cdArr) {
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
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
  for (let k0 = 0; k0 <= 127; k0++) {
    for (let k1 = 0; k1 <= 127; k1++) {
      const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      if (ans.some(v => v > 255)) continue;
      const keys = [];
      let op = 1, gap, ok = true;
      for (let i = 0; i < ans[0]; i++) {
        [gap, op] = getLensGo(ans, op);
        if (gap < 0 || op + gap > ans.length) { ok = false; break; }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if (!ok) continue;
      const k16 = keys[16];
      if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { off, keys };
    }
  }
  return null;
}

for (const s of trip) {
  const der = deriveKeys(decryptCd(s.cd));
  if (!der) { console.log(`nsd=${s.nsd} 派生失败`); continue; }
  const derK2 = der.keys[2];
  const cookieK2 = s.keys2;
  const same = JSON.stringify(derK2) === JSON.stringify(cookieK2);
  console.log(`\nnsd=${s.nsd}: cd派生keys[2] vs cookie keys2 一致=${same}`);
  if (!same) {
    console.log(`  cd派生[0:8]=${derK2.slice(0, 8).join(',')}`);
    console.log(`  cookie[0:8]=${cookieK2.slice(0, 8).join(',')}`);
    // 找不同位置
    const diffs = [];
    for (let i = 0; i < Math.max(derK2.length, cookieK2.length); i++) if (derK2[i] !== cookieK2[i]) diffs.push(i);
    console.log(`  不同位置: ${diffs.slice(0, 20).join(',')}`);
  }
}
