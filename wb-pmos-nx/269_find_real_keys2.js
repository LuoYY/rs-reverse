/**
 * 269_find_real_keys2.js
 *
 * 在 ans 中找真实 keys2（8b cd...）的位置，修正 keys 映射
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();

  // 修复的 cdArr + offset
  const kf = fs.readdirSync(OUT).filter(f => f.startsWith('keys_fixed_')).sort().pop();
  const keysData = JSON.parse(fs.readFileSync(path.join(OUT, kf)));
  const offset = keysData.offset;

  // 重新构建 ans（用修复 cdArr）
  const cf = fs.readdirSync(OUT).filter(f => f.startsWith('cdArr_fixed_')).sort().pop();
  const cdArr = JSON.parse(fs.readFileSync(path.join(OUT, cf))).cdArr;
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  const ans = tail.map((b, i) => b ^ offset[i % 8]);
  console.log('ans len:', ans.length);

  // 真实 keys2（浏览器 nextarr[11..58]）
  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const realK2 = nd.nextarr.slice(11, 59);
  console.log('真实 keys2 前 8:', realK2.slice(0, 8).join(','));

  // 在 ans 里找 realK2 前 8
  const p8 = realK2.slice(0, 8);
  for (let i = 0; i + 8 <= ans.length; i++) {
    if (ans.slice(i, i + 8).every((v, j) => v === p8[j])) {
      console.log('★★★ 真实 keys2 在 ans @', i);
      console.log('ans[' + i + '..' + (i + 48) + ']:', ans.slice(i, i + 48).join(','));
    }
  }
  // 找 realK2 前 4
  const p4 = realK2.slice(0, 4);
  for (let i = 0; i + 4 <= ans.length; i++) {
    if (ans.slice(i, i + 4).every((v, j) => v === p4[j])) {
      console.log('真实 keys2 前4 @', i);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
