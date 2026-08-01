/**
 * 114_bruteforce_offset.js
 *
 * 移植 Go bruteForceOffset 到 Node：枚举 numKeys/gap0/keys[0]，
 * 假设 keys[1]=keys[0]（瑞数 cd 结构），验证 keys[1][1] 和 gap2=48（keys2 长度），
 * 推导完整 8 字节 offset → genKeys → 对比 sync keys17/keys2/keys16
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

  // 暴力枚举 offset[0..4]（numKeys/gap0/keys[0]），假设 keys[1]=keys[0]，验证 keys[1][1] 和 gap2=48
  let found = [];
  const t0 = Date.now();
  for (let numKeys = 30; numKeys <= 80; numKeys++) {
    const off0 = tail[0] ^ numKeys;
    for (let gap0 = 1; gap0 <= 20; gap0++) {
      const off1 = tail[1] ^ (gap0 >> 8);
      const off2 = tail[2] ^ (gap0 & 255);
      for (let k0 = 0; k0 <= 150; k0++) {
        const off3 = tail[3] ^ k0;
        for (let k1 = 0; k1 <= 150; k1++) {
          const off4 = tail[4] ^ k1;
          // 假设 keys[1] == keys[0]
          const off5 = tail[5] ^ (gap0 >> 8);
          const off6 = tail[6] ^ (gap0 & 255);
          const off7 = tail[7] ^ k0;
          // 验证 keys[1][1] == k1
          if ((tail[8] ^ off0) !== k1) continue;
          // 验证 gap2（keys[2] 长度）== 48
          const gap2 = ((tail[9] ^ off1) << 8) | (tail[10] ^ off2);
          if (gap2 !== 48) continue;
          const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
          // genKeys 验证 keys17
          const ans = tail.map((b, i) => b ^ offset[i % 8]);
          const keys2 = genKeysSim(ans, 2);
          const keys1 = genKeysSim(ans, 1);
          for (const [label, keys] of [['step2', keys2], ['step1', keys1]]) {
            if (!keys) continue;
            if (keys[17] && keys[17].length === 16 && keys[17].every((v, i) => v === bKeys17[i])) {
              found.push({ numKeys, gap0, k0, k1, offset, step: label, keys });
              console.log('★★★ 找到! numKeys=' + numKeys, 'gap0=' + gap0, 'keys0=[' + k0 + ',' + k1 + ']', 'step=' + label, 'offset=' + offset.map(b => b.toString(16).padStart(2, '0')).join(' '), '耗时' + (Date.now() - t0) + 'ms');
            }
          }
          if (found.length > 5) break;
        }
        if (found.length > 5) break;
      }
      if (found.length > 5) break;
    }
    if (found.length > 5) break;
  }
  console.log('找到候选数:', found.length, '耗时', Date.now() - t0, 'ms');
  // 详细验证第一个候选
  if (found.length) {
    const f = found[0];
    const keys = f.keys;
    console.log('\n详细验证 (step=' + f.step + '):');
    console.log('keys 数:', keys.length);
    const ok17 = keys[17] && keys[17].every((v, i) => v === bKeys17[i]);
    const ok2 = keys[2] && keys[2].every((v, i) => v === bKeys2[i]);
    const ok16 = keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i]);
    console.log('keys17 匹配:', ok17 ? 'YES' : 'NO');
    console.log('keys2 匹配:', ok2 ? 'YES' : 'NO');
    console.log('keys16==K16:', ok16 ? 'YES' : 'NO (len=' + (keys[16] ? keys[16].length : '无') + ')');
    console.log('keys[29..32] len:', [29, 30, 31, 32].map(k => keys[k] ? keys[k].length : '无').join(','));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
