// 用已知 numarrEncrypt(base) 明文（#33 kt 快照）验证 huffman 树
// 目标：找到正确的 huffman 树（能解出 179 头 base）
const w = require('./nx_kt_writes.json');
// #33 是 cV=58 len=200 head=110,199,86,237（numarrEncrypt(base) 起点）
const r = w[33];
console.log('#33 cV=' + r.cV + ' len=' + r.kt.length);
console.log('#33 kt[0:16]:', r.kt.slice(0, 16).join(','));

// 树1（verify_arg0_chain 用）
function tree1() {
  let a = [];
  for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i });
  a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) }
  while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) }
  return a[0];
}
function buildCfg(root) {
  function gEC(t, c = { key: 0, val: 0 }, arr = []) {
    if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) }
    else arr[t.idx] = c;
    return arr;
  }
  return gEC(root);
}
function hdec(enc, cfg) {
  const byLen = {}; let maxL = 0;
  for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val; }
  const ans = []; let key = 0, val = 0;
  for (const byte of enc) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((byte >> b) & 1); val++;
      const mm = byLen[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}

// 用 #33 的 numarrEncrypt(base) 明文直接解码（不 XOR，因为这是明文）
const enc = r.kt.slice(0, 143); // numarrEncrypt(base) 明文
const base1 = hdec(enc, buildCfg(tree1()));
console.log('\n树1 解码 len=' + base1.length + ' head=' + base1.slice(0, 24).join(','));

// 树2：可能权重不同（试 255 权重 45？0 权重 6？）
function tree2() {
  let a = [];
  for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i });
  a.push({ total: 45, idx: 255 }, { total: 6, idx: 0 });
  function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) }
  while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) }
  return a[0];
}
const base2 = hdec(enc, buildCfg(tree2()));
console.log('树2 解码 len=' + base2.length + ' head=' + base2.slice(0, 24).join(','));

// 找 179,0,127 头是否在解码流中
[base1, base2].forEach((b, i) => {
  const idx = [];
  for (let j = 0; j < b.length - 3; j++) if (b[j] === 179 && b[j + 1] === 0 && b[j + 2] === 127) idx.push(j);
  console.log('树' + (i + 1) + ' 中 179,0,127 位置:', idx.join(','));
});
