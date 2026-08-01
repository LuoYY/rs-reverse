/**
 * 208_diag_decrypt_det.js
 *
 * 诊断：确定性 cookie（det_cookie_*.json）能否用纯算法 keys + encryptMode2 解密
 * 强校验：nextarr[12..60] == keys[2]（48B 会话密钥在 nextarr 明文里）
 * 多 basestr 解码对比（base64url / 86 前64 / 标准 b64 / 浏览器字符集顺序）
 * 若 keys2 匹配 → basestr 确定 + runTime 确定 → 完整链路打通
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const BASESTRS = {
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  b64std: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  b64s_86: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^'.slice(0, 64),
  num86: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^'.slice(0, 64),
};

function decodeWith(str, basestr) {
  const payload = str.startsWith('0') ? str.slice(1) : str;
  const idxmap = {}; for (let i = 0; i < basestr.length; i++) idxmap[basestr[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(payload.length / 4); g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  return bytes;
}

function deriveKeysFromCd(cd) {
  const decrypt = require('@src/handler/parser/common/decrypt');
  const cdArr = decrypt(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
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
  function genKeysSim(ans) {
    const keys = [];
    let op = 1, gap;
    try {
      for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap; }
    } catch (e) { return null; }
    return keys;
  }
  const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
  for (let k0 = 0; k0 <= 127; k0++) {
    const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
    for (let k1 = 0; k1 <= 127; k1++) {
      const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
      const off = [off0, off1, off2, off3, off4, off5, off6, off7];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      const kk = genKeysSim(ans);
      if (kk && [29, 30, 31, 32].every(k => kk[k] && kk[k].length === 4) && kk[2] && kk[2].length === 48) return { offset: off, keys: kk };
    }
  }
  return null;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('det_cookie_')).sort();
  console.log('det_cookie 文件:', files.join(', '));
  const d = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const { nsd, cd, pCookie, fixedTime, capturedAt } = d;
  console.log('nsd:', nsd, 'fixedTime:', fixedTime, 'capturedAt:', capturedAt, 'cookie len:', pCookie.length);

  const der = deriveKeysFromCd(cd);
  if (!der) { console.log('keys 推导失败'); process.exit(1); }
  const keys = der.keys;
  console.log('keys2:', keys[2].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys16:', keys[16].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));

  for (const [name, bs] of Object.entries(BASESTRS)) {
    const bytes = decodeWith(pCookie, bs);
    if (!bytes) { console.log('\n[' + name + '] 解码失败（含 basestr 外字符）'); continue; }
    console.log('\n[' + name + '] 解码 ' + bytes.length + ' B');

    // 遍历 t（capturedAt 与 fixedTime 前后 ± 7200s）
    const centers = [Math.floor(capturedAt / 1000), Math.floor(fixedTime / 1000)];
    let found = null;
    const seen = new Set();
    for (const c of centers) {
      for (let t = c - 7200; t <= c + 7200 && !found; t++) {
        if (seen.has(t)) continue; seen.add(t);
        for (let ele = 1; ele <= 2 && !found; ele++) {
          try {
            const arr = numarrAddTime([...keys[16]], t, ele / 256)[0];
            const dec = encryptMode2([...bytes], arr, 1);
            if (dec.length > 60) {
              // 强校验：dec[12..60] == keys[2]
              let match = true;
              for (let i = 0; i < 48; i++) { if (dec[12 + i] !== keys[2][i]) { match = false; break; } }
              if (match) { found = { t, ele, dec }; break; }
              // 弱校验：nextarr[0]==2 且 dec[4]==2
              if (dec[4] === 2 && !found) {
                // 记录首个 nextarr[0]==2 候选
                found = found || { t, ele, dec, weak: true };
              }
            }
          } catch (e) {}
        }
      }
      if (found) break;
    }
    if (found) {
      const na = found.dec.slice(4);
      console.log('  解密候选 t=' + found.t, new Date(found.t * 1000).toISOString(), 'ele=' + found.ele, '强校验=' + (found.weak ? 'NO(仅 nextarr[0]==2)' : 'YES'));
      console.log('  dec 前 24:', found.dec.slice(0, 24).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  nextarr 前 24:', na.slice(0, 24).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // 检查 nextarr 中 keys[2] 位置
      const pos = na.findIndex((_, i) => i + 48 <= na.length && na.slice(i, i + 48).every((v, j) => v === keys[2][j]));
      console.log('  keys2 在 nextarr 中的位置:', pos);
      if (!found.weak) {
        console.log('★★★ 外层解密成功 basestr=[' + name + '] runTime=' + found.t);
        fs.writeFileSync(path.join(OUT, 'det_decrypted_' + nsd + '.json'), JSON.stringify({ nsd, basestr: name, t: found.t, ele: found.ele, nextarr: na, keys }));
      }
    } else {
      console.log('  解密失败（±7200s 无 keys2 匹配）');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
