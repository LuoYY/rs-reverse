/**
 * 135_analyze_keys_layout.js
 *
 * 用已知 offset（sync，K16 锚成功）解出 ans，解析 genKeys step1 的完整布局
 * 找 keys[2]/keys[16]/keys[17] 的位置 + gap 序列 → 通用推导依据
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const decrypt = require('@src/handler/parser/common/decrypt');

  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const cdArr = decrypt(sync.challenge.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  // sync 已知 offset
  const offset = [0x07, 0x9e, 0x03, 0x00, 0x05, 0x05, 0x06, 0x07];
  const ans = tail.map((b, i) => b ^ offset[i % 8]);
  console.log('numKeys:', ans[0], 'ans len:', ans.length);
  console.log('ans 前 40:', ans.slice(0, 40).join(','));

  // genKeys step1 完整布局
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
  let op = 1;
  const layout = [];
  for (let i = 0; i < ans[0]; i++) {
    const lensStart = op;
    const [gap, nop] = getLensGo(ans, op);
    const dataStart = nop;
    layout.push({ key: i, gap, dataStart, dataEnd: dataStart + gap, lensBytes: ans.slice(lensStart, nop) });
    op = dataStart + gap;
  }
  console.log('\nkeys 布局:');
  layout.forEach(l => {
    let marker = '';
    if (l.key === 2) marker = ' ← keys2(48B)';
    if (l.key === 16) marker = ' ← keys16(K16)';
    if (l.key === 17) marker = ' ← keys17';
    if (l.key === 21) marker = ' ← r2mkaTime';
    console.log(`k${l.key}: gap=${l.gap} @${l.dataStart}..${l.dataEnd}${marker} 前4: ${ans.slice(l.dataStart, Math.min(l.dataStart + 4, l.dataEnd)).join(',')}`);
  });
  // 找 keys2 位置（48B）
  const k2 = layout.find(l => l.gap === 48);
  if (k2) console.log('\nkeys2 @' + k2.dataStart, 'gap2 位置:', k2.dataStart - 2, '（offset 索引 ' + ((k2.dataStart - 2) % 8) + '）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
