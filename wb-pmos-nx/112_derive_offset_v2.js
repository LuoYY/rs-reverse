/**
 * 112_derive_offset_v2.js
 *
 * 移植 Go 版 bruteForceOffset + genKeys 思路到 Node，验证 nx keys 纯算法：
 *   ans = cdArr[end:] ^ offset[i%8]
 *   keys = genKeys(ans)
 * 用 sync 的 keys17 约束 offset（迭代收敛），验证 keys16=K16 / keys2
 *
 * 若收敛成功 → nx keys 纯算法达成（不需要 runTask/外层 VM）！
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
  const { nsd, cd } = sync.challenge;
  const bKeys17 = sync.browserKeys.keys17;
  const bKeys2 = sync.browserKeys.keys2;
  console.log('sync nsd:', nsd, 'keys17:', bKeys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  const cdArr = decrypt(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  console.log('cdLen:', cdArr.length, 'end:', end, 'tail:', tail.length);

  // genKeys（含 step=1 fallback），不做 29..32 验证
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
    for (let i = 0; i < ans[0]; i++) {
      if (step === 2) { if (op + 1 >= ans.length) return null; gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
      else { [gap, op] = getLensGo(ans, op); }
      if (gap < 0 || op + gap > ans.length) return null;
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
    return keys;
  }
  function findPos(ans, step, keyIdx) {
    // 重算 keys[keyIdx] 在 ans 中的起始位置
    let op = 1, gap;
    for (let i = 0; i <= keyIdx; i++) {
      if (step === 2) { gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
      else { [gap, op] = getLensGo(ans, op); }
      if (i === keyIdx) return op;
      op += gap;
    }
    return -1;
  }

  // 迭代收敛 offset（用 keys17 约束）
  let offset = new Array(8).fill(0);
  let converged = false;
  for (let iter = 0; iter < 60 && !converged; iter++) {
    const ans = tail.map((b, i) => b ^ offset[i % 8]);
    let keys = null, stepUsed = 2;
    keys = genKeysSim(ans, 2);
    if (!keys || keys.length <= 17 || !keys[17] || keys[17].length !== 16) {
      keys = genKeysSim(ans, 1); stepUsed = 1;
    }
    if (!keys || keys.length <= 17 || !keys[17] || keys[17].length !== 16) {
      console.log('迭代', iter, ': genKeys 失败');
      break;
    }
    const pos17 = findPos(ans, stepUsed, 17);
    if (pos17 > 0) {
      for (let i = 0; i < 16; i++) offset[i % 8] = tail[pos17 + i] ^ bKeys17[i];
    }
    if (keys[17].every((v, i) => v === bKeys17[i])) { converged = true; console.log('★★★ 收敛 at iter', iter, 'step', stepUsed); }
  }

  // 最终验证
  const ans = tail.map((b, i) => b ^ offset[i % 8]);
  const keys2 = genKeysSim(ans, 2);
  const keys1 = genKeysSim(ans, 1);
  console.log('推导 offset:', offset.map(b => b.toString(16).padStart(2, '0')).join(' '));
  for (const [label, keys] of [['step2', keys2], ['step1', keys1]]) {
    if (!keys) { console.log(label, ': null'); continue; }
    console.log(label, ': keys数', keys.length, 'keys17 len', keys[17] ? keys[17].length : '无');
    if (keys[17]) {
      const same17 = keys[17].length === bKeys17.length && keys[17].every((v, i) => v === bKeys17[i]);
      console.log('  keys17 匹配浏览器:', same17 ? '★★★ YES' : 'NO');
    }
    if (keys[2]) {
      const same2 = keys[2].length === bKeys2.length && keys[2].every((v, i) => v === bKeys2[i]);
      console.log('  keys2 匹配浏览器:', same2 ? '★★★ YES' : 'NO');
    }
    if (keys[16]) {
      const same16 = keys[16].length === 16 && keys[16].every((v, i) => v === K16[i]);
      console.log('  keys16 == K16:', same16 ? '★★★ YES' : 'NO (len=' + keys[16].length + ')');
    }
    // 验证 keys 长度约束（29..32 = 4）
    const k29 = keys[29] ? keys[29].length : '无';
    console.log('  keys[29..32] len:', [29, 30, 31, 32].map(k => keys[k] ? keys[k].length : '无').join(','));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
