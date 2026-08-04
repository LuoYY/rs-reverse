/**
 * 728_base_vs_cap_all.js
 * 深度对比 cap(明文basearr) 与 base：
 * 1. cap 长度 vs base 长度
 * 2. 是否 base = 某种整体变换(cap)
 * 3. cap 是否等于 base 的某段（偏移搜索）
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

console.log('=== cap vs base 长度/前缀 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: cap=${s.cap.length} base=${s.base.length} cap[0:10]=${s.cap.slice(0, 10).join(',')} base[0:10]=${s.base.slice(0, 10).join(',')}`);
}

// cap 是否在 base 中出现（任何偏移）
console.log('\n=== cap 子串在 base 中搜索 ===');
for (const s of samples) {
  const cStr = s.cap.join(',');
  const bStr = s.base.join(',');
  let found = false;
  for (let L = 10; L <= 138; L++) {
    for (let off = 0; off + L <= s.cap.length; off++) {
      const sub = s.cap.slice(off, off + L).join(',');
      if (bStr.indexOf(sub) !== -1) {
        console.log(`nsd=${s.nsd}: cap[${off}:${off + L}] 在 base 中出现 ★`);
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (!found) console.log(`nsd=${s.nsd}: cap 子串未在 base 出现`);
}

// base 的 huffman 解码？不对，base 已经是解码结果
// 关键问题：base 和 cap 是两个不同的数组？
// 服务器接受 base（179开头），不接受 cap（113开头）
// 所以 cap = 中间产物（明文 basearr），base = 服务器接受版本
// 需要找到 cap → base 的变换

// 测试：base 是否 = huffman 解码结果，而 cap = 另一个 huffman 解码？
// 589: be → encryptMode2(keys17) → huff → huffmanDecode → base
// 所以 base = huffmanDecode(huff)，huff = be 解密

// 但 base 值域 0-255，如果 base 是"明文"，应该可读？
// 也许 base 不是明文 basearr，而是"加密后的 basearr"？
// 服务器接受的 basearr 是加密形态 base！

// 检查 base 是否可用 nxEncrypt 逆过程验证（roundtrip）
// base → nxEncrypt → huff2，huff2 应该 == huff（be 解密后）
// 但我们没有 huff，只有 be（仍加密）

// 换思路：检查 be 段是否能 huffman 解码出 base
// 数据里有 be，但没有 keys17。需要 keys17
// 从 cd 派生 keys

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
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
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

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

// 完整验证链路：be → decrypt(keys17) → huff → huffmanDecode → 应该 == base
console.log('\n=== be 完整解码验证 ===');
for (const s of samples) {
  const der = deriveKeys(decryptCd(s.cd));
  if (!der) { console.log(`nsd=${s.nsd} 派生失败`); continue; }
  const keys17arr = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const tmp = encryptMode2([...s.be], keys17arr, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ s.keys2[i]) : v);
  // nxEncrypt(base) 应该 == huff
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
  function nxEncrypt(numarr) {
    if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
    const ans = [];
    let one = 0, two = 0;
    for (let i = 0; i < numarr.length; i++) {
      const cfg = huffEncCfg[numarr[i]];
      one = one << cfg.val | cfg.key;
      two += cfg.val;
      while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
    }
    if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
    return ans;
  }
  const encBase = nxEncrypt(s.base);
  const match = encBase.every((v, i) => v === huff[i]) && encBase.length === huff.length;
  console.log(`nsd=${s.nsd}: nxEncrypt(base) len=${encBase.length} huff len=${huff.length} 相等=${match}`);
  if (!match) {
    const diffs = [];
    for (let i = 0; i < Math.min(encBase.length, huff.length); i++) if (encBase[i] !== huff[i]) diffs.push(i);
    console.log(`  差异: ${diffs.slice(0, 10).join(',')}`);
  }
}
