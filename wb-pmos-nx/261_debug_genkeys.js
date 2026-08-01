/**
 * 261_debug_genkeys.js
 *
 * 调试 genKeysSim：keys[16]/[17] 的 gap 解析
 * 修复 keys[17]（含 316 错误），验证 = [前8B][offset]
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
  const decrypt = require('@src/handler/parser/common/decrypt');

  const der = JSON.parse(fs.readFileSync(path.join(OUT, 'nx_keys_derived.json')));
  console.log('offset:', der.offset);

  // 从 cd 重新推导
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const cd = sync.challenge.cd;
  const cdArr = decrypt(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  const off = der.offset;
  const ans = tail.map((b, i) => b ^ off[i % 8]);
  console.log('ans 前 12:', ans.slice(0, 12).join(','));

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
  for (let i = 0; i < ans[0]; i++) {
    const [gap, newOp] = getLensGo(ans, op);
    const val = ans.slice(newOp, newOp + gap);
    if (i >= 14 && i <= 20) {
      console.log('keys[' + i + '] gap=' + gap + ' len=' + val.length + ' 前 4:', val.slice(0, 4).join(','), '全:', JSON.stringify(val));
    }
    op = newOp + gap;
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
