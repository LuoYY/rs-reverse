// 聚焦：会话变化 5B = [22:25] + [68:70]
// 用 8 个有 cd 样本，穷举这 5B 与 keys 段的代数关系
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
function getLensGo(numarr, idx) { const item = numarr[idx]; idx++; let lens; if ((item & 128) === 0) lens = item; else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; } else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; } else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; } else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; } else lens = item; return [lens, idx] }
function genKeysSim(ans) { const keys = []; let op = 1, gap; try { for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap } } catch (e) { return null } return keys }
function deriveOffsetNx(tail) { if (tail.length < 40) return null; const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48; for (let k0 = 0; k0 <= 127; k0++) { const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0; for (let k1 = 0; k1 <= 127; k1++) { const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1; const offset = [off0, off1, off2, off3, off4, off5, off6, off7]; const ans = tail.map((b, i) => b ^ offset[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; const keys = genKeysSim(ans); if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset } } return null }
function getKeys(cd) { const cdArr = decryptCd(cd); const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); const offset = deriveOffsetNx(tail); if (!offset) return null; const ans = tail.map((b, i) => b ^ offset[i % 8]); return genKeysSim(ans); }
const live = data.filter(s => s.cap && s.cap.length && s.cd);
const samples = live.map(s => ({ base: s.base, keys: getKeys(s.cd), nsd: s.nsd })).filter(s => s.keys);

// 打印 5B 会话字节 + keys 关键段
console.log('=== 会话 5B vs keys 关键段 ===');
samples.forEach((s, i) => {
  const a = s.base.slice(22, 25); // [22:25]
  const b = s.base.slice(68, 70); // [68:70]
  const k2 = s.keys[2], k17 = s.keys[17];
  const k33 = s.keys[33] || [], k34 = s.keys[34] || [];
  console.log('#' + i, 'nsd=' + s.nsd, 'A=' + a.join(','), 'B=' + b.join(','),
    'k2[0:3]=' + k2.slice(0, 3).join(','), 'k17[0:2]=' + k17.slice(0, 2).join(','),
    'k33=' + String.fromCharCode(...k33), 'k34=' + String.fromCharCode(...k34));
});

// 穷举：A[0] 是否 = f(k2 某偏移, k17, k33, k34) XOR
console.log('\n=== 尝试 A = k2 XOR k17 组合 ===');
samples.forEach((s, i) => {
  const a = s.base.slice(22, 25);
  const k2 = s.keys[2], k17 = s.keys[17];
  // A[j] = k2[off+j] XOR k17[x]? 或 k2[off+j] XOR 常量
  const ax = a.map((v, j) => v ^ k17[j]); // k17[0:3]
  console.log('#' + i, 'A^k17[0:3]=' + ax.join(','));
  const ay = a.map((v, j) => v ^ k2[j]); // k2[0:3]
  console.log('   A^k2[0:3]=' + ay.join(','));
});
