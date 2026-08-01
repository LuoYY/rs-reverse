/**
 * 136_offset_direct.js
 *
 * nx offset 直接推导（纯算法，不依赖 keys16 值）：
 *   ans[0]=51(numKeys), ans[1]=2(gap0), ans[2..3]=[54,52](keys0), ans[4]=2(gap1),
 *   ans[5..6]=[54,52](keys1), ans[7]=48(gap2=keys2长度)
 *   offset[i] = tail[i] ^ ans[i]（8 字节循环）
 * 多会话验证 keys16==K16 / keys[29..32]=4B → nx keys 纯算法
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

  function derive(tail) {
    // 直接推导（step1 布局）
    const off = [];
    off[0] = tail[0] ^ 51;   // numKeys
    off[1] = tail[1] ^ 2;    // gap0
    off[2] = tail[2] ^ 54;   // keys[0][0]
    off[3] = tail[3] ^ 52;   // keys[0][1]
    off[4] = tail[4] ^ 2;    // gap1
    off[5] = tail[5] ^ 54;   // keys[1][0]
    off[6] = tail[6] ^ 52;   // keys[1][1]
    off[7] = tail[7] ^ 48;   // gap2（keys2 长度）
    const ans = tail.map((b, i) => b ^ off[i % 8]);
    // 验证
    const ok0 = ans[0] === 51;
    const okGap = ans[1] === 2 && ans[4] === 2 && ans[7] === 48;
    const keys = genKeysSim(ans, 1);
    const ok16 = keys && keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i]);
    const okStruct = keys && [29, 30, 31, 32].every(k => keys[k] && keys[k].length === 4);
    const k2len = keys && keys[2] ? keys[2].length : -1;
    return { off, ans: ans.slice(0, 10), ok0, okGap, ok16, okStruct, k2len, keys };
  }

  // sync
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const cdArr = decrypt(sync.challenge.cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const r = derive(cdArr.slice(end));
  console.log('sync nsd=' + sync.challenge.nsd, 'offset=' + r.off.map(b => b.toString(16).padStart(2, '0')).join(' '), '结构:', r.ok0 && r.okGap ? '★' : '✗', 'keys16==K16:', r.ok16 ? 'YES' : 'NO', '29..32=4B:', r.okStruct ? 'YES' : 'NO', 'keys2len:', r.k2len);

  // multi
  const mf = fs.readdirSync(OUT).filter(f => f.startsWith('multi_cd_keys_')).sort().pop();
  const sessions = JSON.parse(fs.readFileSync(path.join(OUT, mf)));
  for (const s of sessions) {
    if (!s.cd) continue;
    const arr = decrypt(s.cd);
    const e = (arr[0] << 8 | arr[1]) + 2;
    const r2 = derive(arr.slice(e));
    console.log('multi nsd=' + s.nsd, 'offset=' + r2.off.map(b => b.toString(16).padStart(2, '0')).join(' '), '结构:', r2.ok0 && r2.okGap ? '★' : '✗', 'keys16==K16:', r2.ok16 ? 'YES' : 'NO', '29..32=4B:', r2.okStruct ? 'YES' : 'NO', 'keys2len:', r2.k2len);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
