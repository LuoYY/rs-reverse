/**
 * 115_keys2_anchor_offset.js
 *
 * 决定性方法：用 bKeys2（48B）作为锚，反推完整 8 字节 offset
 *   keys[2] 起始位置 = 7 + gap0 + gap1（step=2 布局）
 *   48 字节覆盖 offset 8 字节循环 6 次 → 每字节 6 次交叉验证 → offset 完全确定
 *   然后 genKeys 验证 keys17 匹配（sync 权威）
 *
 * 若成功 → nx keys 纯算法达成（cp3 + offset 推导，无需 runTask/外层 VM）！
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
  const cdArr = decrypt(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  console.log('nsd:', nsd, 'end:', end, 'tail:', tail.length);
  console.log('keys2:', bKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys17:', bKeys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // genKeys（step2 → step1 fallback）
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

  // 枚举 gap0/gap1，用 bKeys2 反推 offset（step=2 布局）
  const results = [];
  for (let gap0 = 1; gap0 <= 60; gap0++) {
    for (let gap1 = 1; gap1 <= 60; gap1++) {
      const pos = 7 + gap0 + gap1; // keys[2] 起始
      if (pos + 48 > tail.length) continue;
      const offset = new Array(8);
      let valid = true;
      for (let i = 0; i < 48; i++) {
        const idx = (pos + i) % 8;
        const val = tail[pos + i] ^ bKeys2[i];
        if (offset[idx] === undefined) offset[idx] = val;
        else if (offset[idx] !== val) { valid = false; break; }
      }
      if (!valid) continue;
      // offset 8 字节确定！验证结构
      const ans = tail.map((b, i) => b ^ offset[i % 8]);
      // 验证 numKeys 合理
      const numKeys = ans[0];
      if (numKeys < 20 || numKeys > 100) continue;
      // genKeys 验证
      const keys2 = genKeysSim(ans, 2);
      const keys1 = genKeysSim(ans, 1);
      for (const [label, keys] of [['step2', keys2], ['step1', keys1]]) {
        if (!keys) continue;
        if (keys[17] && keys[17].length === 16 && keys[17].every((v, i) => v === bKeys17[i])) {
          results.push({ gap0, gap1, pos, offset, step: label, keys, numKeys });
          console.log('★★★ 找到! gap0=' + gap0, 'gap1=' + gap1, 'keys2@' + pos, 'numKeys=' + numKeys, 'step=' + label, 'offset=' + offset.map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
      }
    }
  }
  console.log('候选数:', results.length);
  if (results.length) {
    const r = results[0];
    const keys = r.keys;
    const ok17 = keys[17].every((v, i) => v === bKeys17[i]);
    const ok2 = keys[2] && keys[2].every((v, i) => v === bKeys2[i]);
    const ok16 = keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i]);
    console.log('\n详细验证:');
    console.log('keys17 匹配:', ok17 ? '★★★ YES' : 'NO');
    console.log('keys2 匹配:', ok2 ? '★★★ YES' : 'NO');
    console.log('keys16==K16:', ok16 ? '★★★ YES' : 'NO (len=' + (keys[16] ? keys[16].length : '无') + ')');
    console.log('keys 数:', keys.length);
    console.log('keys[29..32] len:', [29, 30, 31, 32].map(k => keys[k] ? keys[k].length : '无').join(','));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
