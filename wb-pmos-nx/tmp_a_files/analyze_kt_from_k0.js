// 同会话分析：_$kt(209B) 各字节 vs _$k0(423) 索引
// 目标：确定 _$kt 每个字节是否来自 _$k0[i]
const snap = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_k0_kt_same.json');
const k0raw = snap.k0Snap.k0.map(Number); // 字符串→数字
const kt = snap.ktFinal;

console.log('k0 len:', k0raw.length, 'kt len:', kt.length);
console.log('k0 head:', k0raw.slice(0, 30).join(','));
console.log('kt head:', kt.slice(0, 30).join(','));

// 1. uuid [0:4] 在 k0 的位置
console.log('\n=== kt 各段在 k0 中的索引 ===');
const sections = [
  ['uuid[0:4]', kt.slice(0, 4)],
  ['[4:6] 4,8', kt.slice(4, 6)],
  ['r2mka[6:10]', kt.slice(6, 10)],
  ['startT[10:14]', kt.slice(10, 14)],
  ['[14]=48', kt.slice(14, 15)],
  ['keys2[15:63]', kt.slice(15, 63)],
  ['beLen[63:65]', kt.slice(63, 65)],
  ['baseEnc[65:80]', kt.slice(65, 80)],
];
sections.forEach(([name, arr]) => {
  const idxs = arr.map(v => {
    const found = [];
    for (let i = 0; i < k0raw.length; i++) if (k0raw[i] === v) found.push(i);
    return found.slice(0, 5);
  });
  console.log(name + ': ' + arr.join(','));
  console.log('   k0 索引:', idxs.map((f, i) => i + ':' + (f.length ? f.join('|') : '-')).join('  '));
});

// 2. keys2 在 k0 的连续匹配（keys2 是否 k0 的连续子串）
const keys2 = kt.slice(15, 63);
console.log('\nkeys2 在 k0 中连续子串匹配:');
for (let i = 0; i + 48 <= k0raw.length; i++) {
  let ok = true;
  for (let j = 0; j < 48; j++) if (k0raw[i + j] !== keys2[j]) { ok = false; break; }
  if (ok) console.log('  ★ keys2 @k0[' + i + ':' + (i + 48) + ']');
}

// 3. base 解码
function getTree() { let a = []; for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const mm = byLen[val]; if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }
const beEnc = kt.slice(65);
const xor = beEnc.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
const base = hdecRaw(xor);
console.log('\nbase len:', base.length, 'head:', base.slice(0, 16).join(','));

// 4. base 各字节在 k0 的索引
console.log('\nbase[0:30] 在 k0 的索引:');
base.slice(0, 30).forEach((v, i) => {
  const found = [];
  for (let j = 0; j < k0raw.length; j++) if (k0raw[j] === v) found.push(j);
  console.log('  base[' + i + ']=' + v + ' → k0:' + (found.length ? found.slice(0, 4).join('|') : '-'));
});

// 5. base 是否 k0 的连续子串
console.log('\nbase[0:16] 在 k0 连续子串:');
for (let i = 0; i + 16 <= k0raw.length; i++) {
  let ok = true;
  for (let j = 0; j < 16; j++) if (k0raw[i + j] !== base[j]) { ok = false; break; }
  if (ok) console.log('  ★ base[0:16] @k0[' + i + ':' + (i + 16) + ']');
}
