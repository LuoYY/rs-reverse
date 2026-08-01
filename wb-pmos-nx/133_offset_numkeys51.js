/**
 * 133_offset_numkeys51.js
 *
 * 通用 offset 推导（不依赖 keys16 值）：
 *   numKeys=51（已确认）→ offset[0] = tail[0] ^ 51
 *   gap2=48 预筛（offset[1..2] 决定）→ 找 gap0
 *   枚举 keys[0]（k0/k1）+ gap1 + keys[1][0] → genKeys 验证 keys[29..32]=4B + keys[2]=48B
 * 对比 sync 的 keys17 验证（若 keys16 不是常量，此方法仍应有效）
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

  function derive(tail, bKeys17) {
    const numKeys = 51;
    const off0 = tail[0] ^ numKeys;
    // gap2=48 预筛
    const candidates = [];
    for (let gap0 = 1; gap0 <= 100; gap0++) {
      const off1 = tail[1] ^ (gap0 >> 8);
      const off2 = tail[2] ^ (gap0 & 255);
      const gap2 = ((tail[9] ^ off1) << 8) | (tail[10] ^ off2);
      if (gap2 === 48) candidates.push({ gap0, off0, off1, off2 });
    }
    if (!candidates.length) return { fail: 'gap2=48 预筛无候选' };
    // 枚举 keys[0] + gap1 + keys[1][0]（限制小值加速）
    let found = null;
    for (const c of candidates) {
      for (let k0 = 0; k0 <= 255 && !found; k0++) {
        const off3 = tail[3] ^ k0;
        for (let k1 = 0; k1 <= 255 && !found; k1++) {
          const off4 = tail[4] ^ k1;
          for (let gap1 = 1; gap1 <= 60 && !found; gap1++) {
            const off5 = tail[5] ^ (gap1 >> 8);
            const off6 = tail[6] ^ (gap1 & 255);
            for (let k1b = 0; k1b <= 255 && !found; k1b++) {
              const off7 = tail[7] ^ k1b;
              const offset = [c.off0, c.off1, c.off2, off3, off4, off5, off6, off7];
              const ans = tail.map((b, i) => b ^ offset[i % 8]);
              if (ans[0] !== numKeys) continue;
              const keys = genKeysSim(ans, 1);
              if (keys && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) {
                const k2len = keys[2] ? keys[2].length : -1;
                const ok17 = bKeys17 && keys[17] && keys[17].length === 16 && keys[17].every((v, i) => v === bKeys17[i]);
                found = { offset, keys, gap0: c.gap0, k0, k1, gap1, k1b, k2len, ok17 };
                break;
              }
            }
          }
        }
      }
    }
    return found || { fail: '枚举无有效结果' };
  }

  // sync 会话验证
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const cdArr = decrypt(sync.challenge.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const r1 = derive(cdArr.slice(end), sync.browserKeys.keys17);
  console.log('sync nsd=' + sync.challenge.nsd, r1.fail ? '✗ ' + r1.fail : '★ offset=' + r1.offset.map(b => b.toString(16).padStart(2, '0')).join(' ') + ' keys2len=' + r1.k2len + ' keys17匹配=' + (r1.ok17 ? 'YES' : 'NO'));

  // multi 会话验证
  const mf = fs.readdirSync(OUT).filter(f => f.startsWith('multi_cd_keys_')).sort().pop();
  const sessions = JSON.parse(fs.readFileSync(path.join(OUT, mf)));
  for (const s of sessions) {
    if (!s.cd) continue;
    const arr = decrypt(s.cd);
    const e = (arr[0] << 8 | arr[1]) + 2;
    const r = derive(arr.slice(e), null);
    console.log('multi nsd=' + s.nsd, r.fail ? '✗ ' + r.fail : '★ offset=' + r.offset.map(b => b.toString(16).padStart(2, '0')).join(' ') + ' keys2len=' + r.k2len);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
