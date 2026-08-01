/**
 * 121_verify_multi_offset.js
 *
 * 用 K16 锚扫描验证多会话（85 号采集）的 offset 推导可靠性
 * 每个会话都应找到唯一 offset（keys16==K16 强验证）
 * → nx keys 纯算法（numKeys/keys16 结构确认）
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

  function deriveOffset(tail) {
    let found = null;
    for (let pos = 0; pos + 16 <= tail.length && !found; pos++) {
      const offset = new Array(8);
      let valid = true;
      for (let i = 0; i < 16; i++) {
        const idx = (pos + i) % 8;
        const val = tail[pos + i] ^ K16[i];
        if (offset[idx] === undefined) offset[idx] = val;
        else if (offset[idx] !== val) { valid = false; break; }
      }
      if (!valid) continue;
      const ans = tail.map((b, i) => b ^ offset[i % 8]);
      if (ans[0] < 20 || ans[0] > 120) continue;
      for (const step of [2, 1]) {
        const keys = genKeysSim(ans, step);
        if (keys && keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i])) {
          found = { pos, offset: [...offset], step, keys, numKeys: ans[0] };
          break;
        }
      }
    }
    return found;
  }

  // sync 会话
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const cdArr = decrypt(sync.challenge.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const r1 = deriveOffset(cdArr.slice(end));
  console.log('sync nsd=' + sync.challenge.nsd, r1 ? `★ offset=${r1.offset.map(b => b.toString(16).padStart(2, '0')).join(' ')} numKeys=${r1.numKeys} keys16@${r1.pos} step=${r1.step}` : '无');

  // multi_cd_keys 会话
  const mf = fs.readdirSync(OUT).filter(f => f.startsWith('multi_cd_keys_')).sort().pop();
  const sessions = JSON.parse(fs.readFileSync(path.join(OUT, mf)));
  for (const s of sessions) {
    if (!s.cd) continue;
    const arr = decrypt(s.cd);
    const e = (arr[0] << 8 | arr[1]) + 2;
    const r = deriveOffset(arr.slice(e));
    console.log('multi nsd=' + s.nsd, r ? `★ offset=${r.offset.map(b => b.toString(16).padStart(2, '0')).join(' ')} numKeys=${r.numKeys} step=${r.step} keys2匹配=${r.keys[2] && s.keys2 && r.keys[2].length === s.keys2.length && r.keys[2].every((v, i) => v === s.keys2[i]) ? 'YES' : 'NO'}` : '无');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
