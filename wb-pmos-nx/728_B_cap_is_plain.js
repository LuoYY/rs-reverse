/**
 * 728_B_cap_is_plain.js
 * 核心验证：cap（明文 basearr）是否就是 be 段 huffman 编码前的真明文？
 * 即 nxEncrypt(cap) == huff？
 * 若成立 → 服务器接受的 basearr 明文 = b86[2:2+len] + 标记位替换！
 */
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
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

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

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
function huffmanDecodeRaw(enc) {
  const encCfg = getEncCfg(getTree());
  const byLenMap = {};
  let maxL = 0;
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLenMap[c.val]) byLenMap[c.val] = {};
    byLenMap[c.val][c.key] = idx;
    if (c.val > maxL) maxL = c.val;
  }
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const mm = byLenMap[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
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

for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const der = deriveKeys(decryptCd(s.cd));
  if (!der) { console.log(`nsd=${s.nsd} 派生失败`); continue; }
  const keys17arr2 = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const tmp = encryptMode2([...s.be], keys17arr2, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ s.keys2[i]) : v);

  // 1. nxEncrypt(cap) vs huff
  const encCap = nxEncrypt68(s.cap);
  const capMatch = encCap.length === huff.length && encCap.every((v, i) => v === huff[i]);
  console.log(`\nnsd=${s.nsd}: nxEncrypt(cap) len=${encCap.length} huff len=${huff.length} 相等=${capMatch}`);
  if (!capMatch) {
    const diffs = [];
    for (let i = 0; i < Math.min(encCap.length, huff.length); i++) if (encCap[i] !== huff[i]) diffs.push(i);
    console.log(`  cap 差异位置: ${diffs.slice(0, 15).join(',')}`);
  }

  // 2. nxEncrypt(base179) vs huff（验证 base179）
  const encBase = nxEncrypt68(s.base);
  const baseMatch = encBase.length === huff.length && encBase.every((v, i) => v === huff[i]);
  console.log(`  nxEncrypt(base179) 相等=${baseMatch} (len ${encBase.length} vs ${huff.length})`);

  // 3. cap vs b86[2:] 用标记位替换后的 nxEncrypt
  const capFixed = [...s.cap];
  const marks = [24, 40, 56, 72, 88, 104, 120, 136, 152, 168, 184, 200];
  for (const m of marks) if (b86[m + 2] !== undefined && capFixed[m] !== undefined) capFixed[m] = b86[m + 2];
  const encCapFixed = nxEncrypt68(capFixed);
  const capFixedMatch = encCapFixed.length === huff.length && encCapFixed.every((v, i) => v === huff[i]);
  console.log(`  nxEncrypt(cap+标记位用b86) 相等=${capFixedMatch}`);

  // 4. 直接 b86[2:] 截取 len=base.len
  const b86slice = b86.slice(2, 2 + s.base.length);
  const encB86 = nxEncrypt68(b86slice);
  const b86Match = encB86.length === huff.length && encB86.every((v, i) => v === huff[i]);
  console.log(`  nxEncrypt(b86[2:2+base.len]) 相等=${b86Match} (len ${encB86.length} vs ${huff.length})`);

  // 5. b86[2:] 全量
  const encB86full = nxEncrypt68(b86.slice(2));
  console.log(`  nxEncrypt(b86[2:]全量) len=${encB86full.length} vs huff ${huff.length}`);
  // 找 bestLen
  const huffHead = huff.slice(0, huff.length - 1);
  let bestLen = 0;
  for (let L = b86.slice(2).length; L >= 1; L--) {
    const enc = nxEncrypt68(b86.slice(2, 2 + L));
    if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
  }
  console.log(`  b86[2:] bestLen=${bestLen} → b86[2:2+bestLen][0:8]=${b86.slice(2, 2 + Math.min(bestLen, 8)).join(',')}`);
}
