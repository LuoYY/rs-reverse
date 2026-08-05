// 详细对比 Node genKeysSim(step=1) 与 Go genKeysNx 的 keys2 解析差异
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
function decryptCd(str) {
  const bs = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const idxmap = {};
  bs.split('').forEach((k, i) => { idxmap[k] = i; });
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
  try {
    for (let i = 0; i < ans[0]; i++) {
      [gap, op] = getLensGo(ans, op);
      if (gap < 0 || op + gap > ans.length) return null;
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
  } catch (e) { return null; }
  return keys;
}
(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_nsd_cd.json', 'utf8'));
  const cdArr = decryptCd(d.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  // 用已推导的 offset（Go 输出 [1,160,3,0,4,5,7,4]）
  const offset = [1,160,3,0,4,5,7,4];
  const ans = tail.map((b, i) => b ^ offset[i % 8]);
  console.log('ans[0..10]:', ans.slice(0, 11).join(','));
  const keys = genKeysSim(ans);
  if (!keys) { console.log('keys 解析失败'); process.exit(1); }
  console.log('keys len:', keys.length);
  // 打印每个 key 的长度和起点
  let op = 1;
  for (let i = 0; i < Math.min(keys.length, 35); i++) {
    const [gap, newOp] = getLensGo(ans, op);
    console.log(`keys[${i}]: len=${gap} start=${op} data=${keys[i].slice(0, 8).join(',')}`);
    op = newOp + gap;
  }
  console.log('\nkeys[2]:', keys[2].join(','));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
