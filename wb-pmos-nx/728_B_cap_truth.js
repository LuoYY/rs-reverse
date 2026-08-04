/**
 * 728_B_cap_truth.js
 * 决定性验证：cap（CDP 明文 basearr）是否为 be 段的正确明文？
 * 链路：be → encryptMode2(keys17) → tmp → XOR keys2[0:16] → huff
 *       cap → nxEncrypt → encCap → XOR keys2[0:16] → 应 == huff
 * 同时测试 cap 前缀截断（b86[2:2+len(base)]）与 b86[2:2+len(cap)] 两种候选
 */
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

function decodeB86(str) {
  const idxmap = {};
  for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4));
  } else if (rem === 3) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  }
  return bytes;
}
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
let huffEncCfg = null;
function nxEncrypt68(numarr) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const ans = [];
  let one = 0, two = 0;
  const pad = 0x68;
  for (let i = 0; i < numarr.length; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one << cfg.val | cfg.key;
    two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | pad >> two);
  return ans;
}
function makeDecryptKeys(bs) {
  return bs.split('').reduce((ans, key, idx) => {
    const code = key.charCodeAt();
    ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
    ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
    ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
    return ans;
  }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
}
function decryptCd(cd) {
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;
  const arr2 = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr2.push(d1[one] | d2[two]);
    three !== undefined && arr2.push(d3[two] | d4[three]);
    four !== undefined && arr2.push(d5[three] | d6[four]);
  }
  return arr2;
}
function deriveKeys(cdArr) {
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
  for (let k0 = 0; k0 <= 127; k0++) {
    for (let k1 = 0; k1 <= 127; k1++) {
      const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      if (ans.some(v => v > 255)) continue;
      const keys = [];
      let op = 1, gap, ok = true;
      for (let i = 0; i < ans[0]; i++) {
        [gap, op] = getLensGo(ans, op);
        if (gap < 0 || op + gap > ans.length) { ok = false; break; }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if (!ok) continue;
      const k16 = keys[16];
      if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { off, keys };
    }
  }
  return null;
}

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const der = deriveKeys(decryptCd(s.cd));
  if (!der) { console.log(`nsd=${s.nsd} 派生失败`); continue; }
  const keys17arr = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const tmp = encryptMode2([...s.be], keys17arr, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ s.keys2[i]) : v);

  // 候选1: cap 完整
  const encCap = nxEncrypt68(s.cap);
  const xorCap = encCap.map((v, i) => i < 16 ? (v ^ s.keys2[i]) : v);
  let m1 = xorCap.length === huff.length && xorCap.every((v, i) => v === huff[i]);
  console.log(`\nnsd=${s.nsd}:`);
  console.log(`  候选1 cap完整: len=${encCap.length} vs huff=${huff.length} 完全相等=${m1}`);

  // 候选2: b86[2:2+cap.len]
  const b86cap = b86.slice(2, 2 + s.cap.length);
  const encB86cap = nxEncrypt68(b86cap);
  const xorB86cap = encB86cap.map((v, i) => i < 16 ? (v ^ s.keys2[i]) : v);
  let m2 = xorB86cap.length === huff.length && xorB86cap.every((v, i) => v === huff[i]);
  console.log(`  候选2 b86[2:2+cap.len]: len=${encB86cap.length} vs huff=${huff.length} 完全相等=${m2}`);

  // 候选3: b86[2:2+base.len]
  const b86base = b86.slice(2, 2 + s.base.length);
  const encB86base = nxEncrypt68(b86base);
  const xorB86base = encB86base.map((v, i) => i < 16 ? (v ^ s.keys2[i]) : v);
  let m3 = xorB86base.length === huff.length && xorB86base.every((v, i) => v === huff[i]);
  console.log(`  候选3 b86[2:2+base.len]: len=${encB86base.length} vs huff=${huff.length} 完全相等=${m3}`);

  // 候选4: 用 base179 验证（对照，应相等）
  const encBase = nxEncrypt68(s.base);
  const xorBase = encBase.map((v, i) => i < 16 ? (v ^ s.keys2[i]) : v);
  let m4 = xorBase.length === huff.length && xorBase.every((v, i) => v === huff[i]);
  const diff4 = [];
  for (let i = 0; i < Math.min(xorBase.length, huff.length); i++) if (xorBase[i] !== huff[i]) diff4.push(i);
  console.log(`  对照 base179: len=${encBase.length} vs huff=${huff.length} 完全相等=${m4} 差异=${diff4.join(',')}`);

  // 候选5: 标记位替换为 b86 后 cap
  const capFixed = [...s.cap];
  const marks = [24, 40, 56, 72, 88, 104, 120, 136];
  for (const m of marks) if (b86[m + 2] !== undefined && capFixed[m] !== undefined) capFixed[m] = b86[m + 2];
  const encFixed = nxEncrypt68(capFixed);
  const xorFixed = encFixed.map((v, i) => i < 16 ? (v ^ s.keys2[i]) : v);
  let m5 = xorFixed.length === huff.length && xorFixed.every((v, i) => v === huff[i]);
  console.log(`  候选5 cap标记用b86: len=${encFixed.length} vs huff=${huff.length} 完全相等=${m5}`);
}
