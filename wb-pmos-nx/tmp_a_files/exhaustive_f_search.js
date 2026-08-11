// 穷举 f 搜索：base 绑定段 12B = 某 keys 段的线性变换？
// 用 8 个有 cd 样本：对每字节，找 keys 段中"跨样本差 = base 差"的位置
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
function getLensGo(numarr, idx) { const item = numarr[idx]; idx++; let lens; if ((item & 128) === 0) lens = item; else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; } else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; } else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; } else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; } else lens = item; return [lens, idx] }
function genKeysSim(ans) { const keys = []; let op = 1, gap; try { for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap } } catch (e) { return null } return keys }
function deriveOffsetNx(tail) { if (tail.length < 40) return null; const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48; for (let k0 = 0; k0 <= 127; k0++) { const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0; for (let k1 = 0; k1 <= 127; k1++) { const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1; const offset = [off0, off1, off2, off3, off4, off5, off6, off7]; const ans = tail.map((b, i) => b ^ offset[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; const keys = genKeysSim(ans); if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset } } return null }
function getKeys(cd) { const cdArr = decryptCd(cd); const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); const offset = deriveOffsetNx(tail); if (!offset) return null; const ans = tail.map((b, i) => b ^ offset[i % 8]); return genKeysSim(ans); }
const live = data.filter(s => s.cap && s.cap.length && s.cd);
const samples = live.map(s => ({ base: s.base, keys: getKeys(s.cd) })).filter(s => s.keys);

// 方法：对 base[22:29]+[68:73] 每字节，跨样本差 = keys 某段对应差
// base[i] 差 = (keys[ki][oi] 差) 或 (XOR 差)
console.log('=== 跨样本差匹配搜索 ===');
// 对每对样本 (0,1): base 12B 差 vs keys 各段差
const s0 = samples[0], s1 = samples[1];
const bind0 = [...s0.base.slice(22, 29), ...s0.base.slice(68, 73)];
const bind1 = [...s1.base.slice(22, 29), ...s1.base.slice(68, 73)];
const bdiff = bind0.map((v, i) => v ^ bind1[i]);
console.log('base 12B 差:', bdiff.join(','));
// keys 各段差
for (let ki = 0; ki < s0.keys.length; ki++) {
  const k0 = s0.keys[ki], k1 = s1.keys[ki];
  if (!k0 || !k1) continue;
  const m = Math.min(k0.length, k1.length);
  for (let off = 0; off + 12 <= m; off++) {
    const kdiff = [];
    for (let j = 0; j < 12; j++) kdiff.push(k0[off + j] ^ k1[off + j]);
    if (kdiff.every((v, j) => v === bdiff[j])) {
      console.log('★ base 12B 差 = keys[' + ki + '][' + off + ':] 差');
    }
  }
  // 只检查 keys2/keys17/keys[33]/[34] 的 12B 连续段
}
console.log('(若无可输出=无简单 XOR 差匹配)');

// 加法差匹配
console.log('\n=== 加法差搜索 ===');
const addDiff = bind0.map((v, i) => (v - bind1[i] + 256) & 255);
console.log('base 加法差:', addDiff.join(','));
for (let ki = 0; ki < s0.keys.length; ki++) {
  const k0 = s0.keys[ki], k1 = s1.keys[ki];
  if (!k0 || !k1) continue;
  const m = Math.min(k0.length, k1.length);
  for (let off = 0; off + 12 <= m; off++) {
    let ok = true;
    for (let j = 0; j < 12; j++) {
      if (((k0[off + j] - k1[off + j] + 256) & 255) !== addDiff[j]) { ok = false; break; }
    }
    if (ok) console.log('★ base 12B 加法差 = keys[' + ki + '][' + off + ':]');
  }
}
console.log('(若无可输出=无简单加法差匹配)');
