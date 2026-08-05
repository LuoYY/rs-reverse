// 对照实验：用相同脚本解析 xj 的 cd，验证 bruteForce 结构假设对 xj 有效
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.xj.sgcc.com.cn:20080';
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
  console.log('xj nsd:', nsd, 'end:', end);
  console.log('xj cdArr[end..end+14]:', cdArr.slice(end, end + 14).join(','));
  // bruteForce: numKeys=45, keys0=[54,52], keys1=[54,52]
  const o0 = cdArr[end] ^ 45;
  const k11 = cdArr[end + 8] ^ o0;
  const g2hi = cdArr[end + 9];
  const g2lo = cdArr[end + 10] ^ 2;
  const g2 = g2hi << 8 | g2lo;
  console.log('xj bruteForce: keys1[1]=', k11, '(期望52) gap2=', g2, '(期望48)');
  // 打印各假设 numKeys
  for (const nk of [45, 44, 46, 50]) {
    console.log(`  numKeys=${nk}: keys1[1]=${cdArr[end + 8] ^ (cdArr[end] ^ nk)}`);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
