// dump nx cdArr 完整前 200 字节 + end 区域
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
  console.log('nsd:', nsd, 'cd_len:', cd.length, 'cdArr len:', cdArr.length);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  console.log('end:', end);
  // 按行输出前 220 字节（每行 20）
  for (let row = 0; row < 12; row++) {
    const slice = cdArr.slice(row * 20, row * 20 + 20);
    console.log(`${String(row * 20).padStart(4)}: ${slice.join(',')}`);
  }
  console.log('...');
  console.log(`end区域 (${end}): ${cdArr.slice(end, end + 40).join(',')}`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
