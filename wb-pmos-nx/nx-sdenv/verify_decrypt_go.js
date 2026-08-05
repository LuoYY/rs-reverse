// 对比 Node 与 Go 的 cd 解码（同会话）
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/nx_nsd_cd.json', 'utf8'));
const bs = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
const idxmap = {};
bs.split('').forEach((k, i) => { idxmap[k] = i; });
// Go 的 decryptCd 逻辑
const data = [[], [], [], [], [], []];
bs.split('').forEach((k, i) => {
  data[0][k.charCodeAt()] = i << 2;
  data[1][k.charCodeAt()] = i >> 4;
  data[2][k.charCodeAt()] = (i & 15) << 4;
  data[3][k.charCodeAt()] = i >> 2;
  data[4][k.charCodeAt()] = (i & 3) << 6;
  data[5][k.charCodeAt()] = i;
});
const str = d.cd;
const ansGo = [];
for (let i = 0; i < str.length; i += 4) {
  const one = str.charCodeAt(i), two = str.charCodeAt(i + 1), three = str.charCodeAt(i + 2), four = str.charCodeAt(i + 3);
  if (i + 1 < str.length) ansGo.push(data[0][one] | data[1][two]);
  if (i + 2 < str.length) ansGo.push(data[2][two] | data[3][three]);
  if (i + 3 < str.length) ansGo.push(data[4][three] | data[5][four]);
}
// 找 >255 的值
const bad = ansGo.map((v, i) => [i, v]).filter(([i, v]) => v > 255);
console.log('Go 解码 >255 的值数:', bad.length);
console.log('前 10:', JSON.stringify(bad.slice(0, 10)));
// Node 的 idxmap 逻辑
const ansNode = [];
for (let i = 0; i < str.length; i += 4) {
  const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3];
  if (two !== undefined) ansNode.push((idxmap[one] << 2) | (idxmap[two] >> 4));
  if (three !== undefined) ansNode.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
  if (four !== undefined) ansNode.push(((idxmap[three] & 3) << 6) | idxmap[four]);
}
const badN = ansNode.map((v, i) => [i, v]).filter(([i, v]) => v > 255);
console.log('Node 解码 >255 的值数:', badN.length);
console.log('Go ans[22]:', ansGo[22], 'Node ans[22]:', ansNode[22]);
console.log('Go ans[7:25]:', ansGo.slice(7, 25).join(','));
console.log('Node ans[7:25]:', ansNode.slice(7, 25).join(','));
process.exit(0);
