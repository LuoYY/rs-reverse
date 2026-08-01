/**
 * 118_offset_bruteforce_v2.js
 *
 * 系统 bruteForce：先 gap2=48 预筛（numKeys × gap0），再枚举 keys[0]/gap1/keys[1][0]，
 * genKeys 验证 keys[29..32]=4B（结构约束，不依赖浏览器 keys 值）
 * → 推导 nx offset → keys 纯算法！
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
  console.log('nsd:', nsd, 'tail:', tail.length);

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
  function validKeys(keys) {
    if (!keys || keys.length < 33) return false;
    return [29, 30, 31, 32].every(k => keys[k] && keys[k].length === 4);
  }

  // 1. gap2=48 预筛（numKeys × gap0）
  const pre = [];
  for (let numKeys = 20; numKeys <= 120; numKeys++) {
    const off0 = tail[0] ^ numKeys;
    for (let gap0 = 1; gap0 <= 80; gap0++) {
      const off1 = tail[1] ^ (gap0 >> 8);
      const off2 = tail[2] ^ (gap0 & 255);
      const gap2 = ((tail[9] ^ off1) << 8) | (tail[10] ^ off2);
      if (gap2 === 48) pre.push({ numKeys, gap0, off0, off1, off2 });
    }
  }
  console.log('gap2=48 预筛候选:', pre.length);
  if (!pre.length) { console.log('无 gap2=48 候选（结构假设错？）'); process.exit(0); }

  // 2. 枚举 keys[0]（offset[3..4]）+ gap1（offset[5..6]）+ keys[1][0]（offset[7]）
  let found = 0;
  for (const p of pre.slice(0, 3)) {
    for (let k0 = 0; k0 <= 200 && found < 2; k0++) {
      const off3 = tail[3] ^ k0;
      for (let k1 = 0; k1 <= 200 && found < 2; k1++) {
        const off4 = tail[4] ^ k1;
        for (let gap1 = 1; gap1 <= 80 && found < 2; gap1++) {
          const off5 = tail[5] ^ (gap1 >> 8);
          const off6 = tail[6] ^ (gap1 & 255);
          for (let k1b = 0; k1b <= 200 && found < 2; k1b++) {
            const off7 = tail[7] ^ k1b;
            const offset = [p.off0, p.off1, p.off2, off3, off4, off5, off6, off7];
            const ans = tail.map((b, i) => b ^ offset[i % 8]);
            // 快速检查 numKeys
            if (ans[0] !== p.numKeys) continue;
            for (const step of [2, 1]) {
              const keys = genKeysSim(ans, step);
              if (validKeys(keys)) {
                const ok17 = keys[17] && keys[17].length === 16 && keys[17].every((v, i) => v === bKeys17[i]);
                const ok2 = keys[2] && keys[2].length === bKeys2.length && keys[2].every((v, i) => v === bKeys2[i]);
                const ok16 = keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i]);
                console.log('★ 结构有效! numKeys=' + p.numKeys, 'gap0=' + p.gap0, 'gap1=' + gap1, 'keys0=[' + k0 + ',' + k1 + ']', 'keys1[0]=' + k1b, 'step=' + step);
                console.log('  offset:', offset.map(b => b.toString(16).padStart(2, '0')).join(' '));
                console.log('  keys17 匹配:', ok17 ? 'YES' : 'NO', 'keys2 匹配:', ok2 ? 'YES' : 'NO', 'keys16==K16:', ok16 ? 'YES' : 'NO');
                if (ok17) { console.log('  ★★★ keys17 完全匹配——nx keys 纯算法达成!'); found++; }
                break;
              }
            }
          }
        }
      }
    }
    if (found > 0) break;
  }
  console.log('最终找到:', found);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
