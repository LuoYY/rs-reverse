/**
 * 反解 same_o.json 的真实P（200）与管线P（412），用同 cd 的 keys，逐字节对比 basearr。
 * 这次管线P是确定412的，真实P是确定200的 → 差异即根因。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_decrypt_same_o.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) { for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } } arr.push(item); }
  while (arr.length > 1) { const [o, t] = arr.slice(0, 2); arr = arr.slice(2); parse({ total: o.total + t.total, first: o, second: t }); }
  return arr[0];
}
function getKey(arr) { for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; } }
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) { getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr); getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr); }
  else arr[tree.idx] = config;
  return [arr, getKey(arr)];
}

function makeDecoder(gv, parser) {
  const ec = getEncryptConfig(getTree());
  const codeMap = {};
  for (let b = 0; b < 256; b++) { const c = ec[0][b]; if (!c) continue; if (!codeMap[c.val]) codeMap[c.val] = {}; codeMap[c.val][c.key] = b; }
  function numarrDecrypt(numarr) {
    const ans = []; let curLen = 0, curKey = 0;
    for (let i = 0; i < numarr.length; i++) { const byte = numarr[i];
      for (let bit = 7; bit >= 0; bit--) { const b = (byte >> bit) & 1; curKey = (curKey << 1) | b; curLen++;
        const mm = codeMap[curLen]; if (mm && mm[curKey] !== undefined) { ans.push(mm[curKey]); curKey = 0; curLen = 0; } } }
    return ans;
  }
  function numarr2stringDecode(str) {
    const keys = gv.basestr.split(''); const idxmap = {};
    keys.forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
    const numarr = []; let i = 0;
    const full = Math.floor(str.length / 4);
    for (let g = 0; g < full; g++) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]], c3 = idxmap[str[i+3]]; i += 4;
      numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3); }
    const rem = str.length - i;
    if (rem === 2) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]]; numarr.push((c0 << 2) | (c1 >> 4)); }
    else if (rem === 3) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]]; numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
    return numarr;
  }
  const { encryptMode2, xor } = parser;
  return function decode(cookieValue) {
    const payload = cookieValue.startsWith('0') ? cookieValue.slice(1) : cookieValue;
    const bytes = numarr2stringDecode(payload);
    const decrypted = encryptMode2(bytes, gv.keys[16], 1);
    const nextarr = decrypted.slice(4);
    let idx = 2; idx += 8;
    const keys2len = nextarr[idx]; idx++; idx += keys2len;
    let rest = nextarr.slice(idx);
    let basearrEncrypt;
    if ((rest[0] & 0x80) === 0x80) { const encLen = rest[1] | ((rest[0] & 0x7f) << 8); basearrEncrypt = rest.slice(2, 2 + encLen); }
    else { const encLen = rest[0]; basearrEncrypt = rest.slice(1, 1 + encLen); }
    const basearrXor = encryptMode2([...basearrEncrypt], gv.keys[17], 0);
    const numenc = xor([...basearrXor], gv.keys[2], 16);
    return numarrDecrypt(numenc);
  };
}

(async () => {
  const { realP, pipeP, oStr } = JSON.parse(fs.readFileSync('/tmp/same_o.json', 'utf8'));
  // 需要同 cd 的 keys。same_o.json 没存 nsd/cd。需重新抓一次同会话？不行（cd 已失效）。
  // 但 keys 由 cd 决定，same_o 的 cd 未保存。
  // → 无法反解（无 keys）。改方案：重新跑 test_real_vs_pipeline 加重放，一次拿全。
  console.error('same_o.json 未保存 nsd/cd，无法反解。需用 test_real_vs_pipeline 流程（含重放）。');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
