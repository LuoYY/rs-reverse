// 最终 f 搜索：base 绑定段是否 = keys 段的组合（选择/拼接/变换）
// 程序固定（aebi[1]=2553 条）→ 变换是确定性的
// 用 28 样本找 base[22:29]/[68:73] 与 keys 段的映射
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
function getLensGo(numarr, idx) { const item = numarr[idx]; idx++; let lens; if ((item & 128) === 0) lens = item; else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; } else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; } else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; } else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; } else lens = item; return [lens, idx] }
function genKeysSim(ans) { const keys = []; let op = 1, gap; try { for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap } } catch (e) { return null } return keys }
function deriveOffsetNx(tail) { if (tail.length < 40) return null; const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48; for (let k0 = 0; k0 <= 127; k0++) { const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0; for (let k1 = 0; k1 <= 127; k1++) { const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1; const offset = [off0, off1, off2, off3, off4, off5, off6, off7]; const ans = tail.map((b, i) => b ^ offset[i % 8]); if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue; const keys = genKeysSim(ans); if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 && keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 && keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset } } return null }
function getKeys(cd) { const cdArr = decryptCd(cd); const end = (cdArr[0] << 8 | cdArr[1]) + 2; const tail = cdArr.slice(end); const offset = deriveOffsetNx(tail); if (!offset) return null; const ans = tail.map((b, i) => b ^ offset[i % 8]); return genKeysSim(ans); }
const live = data.filter(s => s.cap && s.cap.length && s.cd);
console.log('有 cd 样本:', live.length);

// 关键：base 绑定段 vs keys 段的逐字节映射（穷举）
// base[22:29] 7B + [68:73] 5B = 12B
// 检查每字节是否 = keys 某段某字节 XOR 常量 / 直接取值
for (const s of live) {
  const keys = getKeys(s.cd);
  if (!keys) continue;
  const p22 = s.base.slice(22, 29);
  const e73 = s.base.slice(68, 73);
  // keys 拼接
  const concat = keys.flat();
  // 找 p22 每字节在 concat 中的值
  for (let i = 0; i < 7; i++) {
    const b = p22[i];
    if (b === 0) continue;
    // b 是否 = concat 某值 XOR 常量（检查 b 是否直接出现）
    if (concat.includes(b)) {
      const idxs = concat.map((v, j) => v === b ? j : -1).filter(x => x >= 0);
      // console.log('  [22+' + i + ']=' + b + ' 在 concat@' + idxs.slice(0,3).join(','));
    }
  }
}

// 检查跨样本：keys 段变化与 base 绑定段变化的同步
console.log('\n=== 跨样本变化同步 ===');
// 找 keys 中哪些段随 base[22:29] 变化而变
const s0 = live[0], s1 = live[1];
const k0 = getKeys(s0.cd), k1 = getKeys(s1.cd);
if (k0 && k1) {
  const p22_0 = s0.base.slice(22, 29), p22_1 = s1.base.slice(22, 29);
  const same22 = JSON.stringify(p22_0) === JSON.stringify(p22_1);
  console.log('[22:29] 相同?', same22);
  // keys 各段差异
  const m = Math.min(k0.length, k1.length);
  for (let i = 0; i < m; i++) {
    if (JSON.stringify(k0[i]) !== JSON.stringify(k1[i])) {
      console.log('keys[' + i + '] 不同 (len ' + k0[i].length + '/' + k1[i].length + ')');
    }
  }
}
