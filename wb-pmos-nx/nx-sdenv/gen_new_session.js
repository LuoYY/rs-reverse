// 生成新的 nsd/cd 会话 + 立即跑 deriveOffset（同会话内）
const fs = require('fs');
const path = require('path');
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
function genKeysSim(ans, step) {
  const keys = [];
  let op = 1, gap;
  try {
    for (let i = 0; i < ans[0]; i++) {
      if (step === 2) { if (op + 1 >= ans.length) return null; gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
      else { [gap, op] = getLensGo(ans, op); }
      if (gap < 0 || op + gap > ans.length) return null;
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
  } catch (e) { return null; }
  return keys;
}
function deriveOffset(tail) {
  try {
    const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
    for (let k0 = 0; k0 <= 127; k0++) {
      const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
      for (let k1 = 0; k1 <= 127; k1++) {
        const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
        const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
        const ans = tail.map((b, i) => b ^ offset[i % 8]);
        if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
        const keys = genKeysSim(ans, 1);
        if (keys && [29, 30, 31, 32].every(k => keys[k] && keys[k].length === 4) && keys[2] && keys[2].length === 48) {
          return { offset, keys, numKeys: 51, k0, k1 };
        }
      }
    }
  } catch (e) {}
  return null;
}
(async () => {
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  const cdArr = decryptCd(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  console.log('nsd:', nsd, 'end:', end);
  console.log('tail 前16:', cdArr.slice(end, end + 16).join(','));
  const d = deriveOffset(cdArr.slice(end));
  console.log('deriveOffset:', d ? 'OK offset=' + d.offset.join(',') + ' k0=' + d.k0 + ' k1=' + d.k1 : 'FAILED');
  fs.writeFileSync('/tmp/nx_nsd_cd.json', JSON.stringify({ nsd, cd }));
  console.log('已保存新会话');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
