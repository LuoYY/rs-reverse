// 验证：A+B = 5 字节会话密钥的 numarr 编码？
// #4: A=[178,0,0] B=[0,178] → A+B=[178,0,0,0,178]
// 这可能是 5 字节 [x,y,z] 的编码？或直接是密钥
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.cd);

// A+B 拼接 5 字节
console.log('=== A+B 5 字节 ===');
live.forEach((s, i) => {
  const ab = [...s.base.slice(22, 25), ...s.base.slice(68, 70)];
  console.log('#' + i, 'nsd=' + s.nsd, 'block=' + s.block, 'A+B=' + ab.join(','));
});

// 尝试：A+B 是某 keys 段的 5 字节（跨样本查找）
// keys2 前 5 字节 vs A+B
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
function getLensGo(numarr, idx) { const item = numarr[idx]; idx++; let lens; if ((item & 128) === 0) lens = item; else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; } else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; } else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; } else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; } else lens = item; return [lens, idx] }
function genKeysSim(ans) { const keys = []; let op = 1, gap; try { for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap } } catch (e) { return null } return keys }
function deriveOffsetNx(tail) { if (tail.length < 40) return null; const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48; for (let k0 = 0; k0 <= 127; k0++) { const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0; for (let k1 = 0; k1 <= 127; k1++) { const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1; const offset = [off0, off1, off2, off3, off4, off5, off6, off7]; const ans = tail.map((b, i) => b ^ offset[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; const keys = genKeysSim(ans); if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset } } return null }
function getKeys(cd) { const cdArr = decryptCd(cd); const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); const offset = deriveOffsetNx(tail); if (!offset) return null; const ans = tail.map((b, i) => b ^ offset[i % 8]); return genKeysSim(ans); }

console.log('\n=== A+B vs keys 段 ===');
live.forEach((s, i) => {
  const keys = getKeys(s.cd);
  const ab = [...s.base.slice(22, 25), ...s.base.slice(68, 70)];
  const k2 = keys[2];
  // A+B XOR keys2[0:5]
  const ax = ab.map((v, j) => v ^ k2[j]);
  console.log('#' + i, 'A+B=' + ab.join(','), 'k2[0:5]=' + k2.slice(0, 5).join(','), 'A+B^k2=' + ax.join(','));
});
