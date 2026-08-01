/**
 * 116_scan_keys2_pos.js
 *
 * 通用扫描：遍历 tail 所有可能位置作为 keys[2]（48B）起始，
 * 用 bKeys2 反推 offset（8 字节循环，48B 覆盖 6 次 → 每字节一致性验证），
 * 再 genKeys 验证 keys17 匹配（sync 权威）→ nx keys 纯算法！
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

  let found = [];
  for (let pos = 0; pos + 48 <= tail.length; pos++) {
    // 用 bKeys2 反推 offset（8 字节循环一致性）
    const offset = new Array(8);
    let valid = true;
    for (let i = 0; i < 48; i++) {
      const idx = (pos + i) % 8;
      const val = tail[pos + i] ^ bKeys2[i];
      if (offset[idx] === undefined) offset[idx] = val;
      else if (offset[idx] !== val) { valid = false; break; }
    }
    if (!valid) continue;
    // offset 确定 → 生成 ans
    const ans = tail.map((b, i) => b ^ offset[i % 8]);
    if (ans[0] < 20 || ans[0] > 120) continue;
    // genKeys 验证 keys17
    for (const step of [2, 1]) {
      const keys = genKeysSim(ans, step);
      if (!keys) continue;
      if (keys[17] && keys[17].length === 16 && keys[17].every((v, i) => v === bKeys17[i])) {
        found.push({ pos, offset: [...offset], step, keys });
        console.log('★★★ 找到! keys2@' + pos, 'step=' + step, 'offset=' + offset.map(b => b.toString(16).padStart(2, '0')).join(' '));
        break;
      }
    }
    if (found.length > 3) break;
  }
  console.log('候选数:', found.length);
  if (found.length) {
    const r = found[0];
    const keys = r.keys;
    const ok2 = keys[2] && keys[2].every((v, i) => v === bKeys2[i]);
    const ok16 = keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i]);
    console.log('详细验证:');
    console.log('keys2 匹配:', ok2 ? '★★★ YES' : 'NO');
    console.log('keys16==K16:', ok16 ? '★★★ YES' : 'NO (len=' + (keys[16] ? keys[16].length : '无') + ')');
    console.log('keys 数:', keys.length);
    console.log('keys[29..32] len:', [29, 30, 31, 32].map(k => keys[k] ? keys[k].length : '无').join(','));
    // 保存
    fs.writeFileSync(path.join(OUT, 'nx_keys_derived.json'), JSON.stringify({ nsd, keys, offset: r.offset, keys2Pos: r.pos, step: r.step }));
    console.log('已保存 nx_keys_derived.json');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
