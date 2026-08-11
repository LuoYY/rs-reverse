// 最终映射：base 绑定段 vs keys 段
// keys[33-35] 时间戳 → [68:73]? keys[22] 资源名 → [22:29]?
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
function getLensGo(numarr, idx) { const item = numarr[idx]; idx++; let lens; if ((item & 128) === 0) lens = item; else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; } else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; } else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; } else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; } else lens = item; return [lens, idx] }
function genKeysSim(ans) { const keys = []; let op = 1, gap; try { for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap } } catch (e) { return null } return keys }
function deriveOffsetNx(tail) { if (tail.length < 40) return null; const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48; for (let k0 = 0; k0 <= 127; k0++) { const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0; for (let k1 = 0; k1 <= 127; k1++) { const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1; const offset = [off0, off1, off2, off3, off4, off5, off6, off7]; const ans = tail.map((b, i) => b ^ offset[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; const keys = genKeysSim(ans); if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset } } return null }
function getKeys(cd) { const cdArr = decryptCd(cd); const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); const offset = deriveOffsetNx(tail); if (!offset) return null; const ans = tail.map((b, i) => b ^ offset[i % 8]); return genKeysSim(ans); }
const live = data.filter(s => s.cap && s.cap.length && s.cd);

console.log('=== 完整映射：base 绑定段 vs keys 全部段 ===');
live.forEach((s, i) => {
  const keys = getKeys(s.cd);
  const p22 = s.base.slice(22, 29);
  const e73 = s.base.slice(68, 73);
  // keys 数字字段
  const ts33 = String.fromCharCode(...(keys[33] || []));
  const ts34 = String.fromCharCode(...(keys[34] || []));
  const ts35 = String.fromCharCode(...(keys[35] || []));
  const resName = String.fromCharCode(...(keys[22] || []));
  const nsd = String.fromCharCode(...(keys[42] || []));
  console.log('#' + i, 'nsd=' + nsd,
    '[22:29]=' + p22.join(',') + ' ' + p22.map(v => String.fromCharCode(v)).join(''),
    '[68:73]=' + e73.join(','),
    'k33=' + ts33 + ' k34=' + ts34 + ' k35=' + ts35,
    'resName=' + resName.slice(0, 12));
});

// 关键洞察：base[22:25] 3B + [25:29] 4B 结构
// 尝试 base[22:29] = keys[22] 前7 XOR 或 [33:35]+[22] 组合
console.log('\n=== [22:29] 与 keys[22]+[33:35] 关系 ===');
live.forEach((s, i) => {
  const keys = getKeys(s.cd);
  const p22 = s.base.slice(22, 29);
  const res = keys[22].slice(0, 7);
  const xor = p22.map((v, j) => v ^ res[j]);
  console.log('#' + i, '[22:29]=' + p22.join(','), 'res[0:7]=' + res.join(','), 'XOR=' + xor.join(','));
});
