/**
 * 144_offset_enumerate.js
 *
 * 通用 offset 推导（枚举 keys[0]，假设 keys[1]=keys[0]）：
 *   off[0]=tail[0]^51, off[1]=tail[1]^2, off[4]=tail[4]^2, off[7]=tail[7]^48（固定）
 *   off[2]=tail[2]^k0, off[3]=tail[3]^k1, off[5]=tail[5]^k0, off[6]=tail[6]^k1（枚举 keys[0]）
 *   genKeys 验证 keys[29..32]=4B + keys2=48B
 * 在线会话 + sync 验证
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

  function derive(tail, bKeys2, bKeys17) {
    const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
    const results = [];
    // 枚举 keys[0]（k0,k1）——限制常见数字字符 + 小值
    for (let k0 = 0; k0 <= 127 && results.length < 3; k0++) {
      const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
      for (let k1 = 0; k1 <= 127 && results.length < 3; k1++) {
        const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
        const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
        const ans = tail.map((b, i) => b ^ offset[i % 8]);
        if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
        const keys = genKeysSim(ans, 1);
        if (keys && [29, 30, 31, 32].every(k => keys[k] && keys[k].length === 4)) {
          const k2len = keys[2] ? keys[2].length : -1;
          const ok2 = bKeys2 && keys[2] && keys[2].length === bKeys2.length && keys[2].every((v, i) => v === bKeys2[i]);
          const ok17 = bKeys17 && keys[17] && keys[17].length === 16 && keys[17].every((v, i) => v === bKeys17[i]);
          results.push({ offset, k0, k1, k2len, ok2: !!ok2, ok17: !!ok17, keys });
        }
      }
    }
    return results;
  }

  // sync
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const cdArr = decrypt(sync.challenge.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const r1 = derive(cdArr.slice(end), sync.browserKeys.keys2, sync.browserKeys.keys17);
  console.log('sync nsd=' + sync.challenge.nsd, '候选:', r1.length);
  r1.forEach(r => console.log('  offset=' + r.offset.map(b => b.toString(16).padStart(2, '0')).join(' '), 'k0=' + r.k0, 'k1=' + r.k1, 'keys2len=' + r.k2len, 'keys2匹配=' + r.ok2, 'keys17匹配=' + r.ok17));

  // multi
  const mf = fs.readdirSync(OUT).filter(f => f.startsWith('multi_cd_keys_')).sort().pop();
  const sessions = JSON.parse(fs.readFileSync(path.join(OUT, mf)));
  for (const s of sessions) {
    if (!s.cd) continue;
    const arr = decrypt(s.cd);
    const e = (arr[0] << 8 | arr[1]) + 2;
    const r2 = derive(arr.slice(e), s.keys2, null);
    console.log('multi nsd=' + s.nsd, '候选:', r2.length);
    r2.forEach(r => console.log('  offset=' + r.offset.map(b => b.toString(16).padStart(2, '0')).join(' '), 'k0=' + r.k0, 'k1=' + r.k1, 'keys2len=' + r.k2len, 'keys2匹配=' + r.ok2));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
