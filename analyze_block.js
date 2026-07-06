// Analyze the 101-byte [0] block from temp1 basearr
const path = require('path');
require('module-alias')(path.dirname(require('./utils/paths').package));
const gv = require('@src/handler/globalVarible');
const { initGv, getCode } = require('@utils/');
const parser = require('@src/handler/parser/');
const { ascii2string, decode, decrypt, numarrEncrypt, bitwiseTwoNumarr, extrace, numarrAddTime, encryptMode2 } = parser;

// ---- huffman decode ----
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) { for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } } arr.push(item); }
  while (arr.length > 1) { const [one, two] = arr.slice(0, 2); arr = arr.slice(2); parse({ total: one.total + two.total, first: one, second: two }); }
  return arr[0];
}
function getKey(arr) { for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; } }
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) { getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr); getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr); } else { arr[tree.idx] = config; }
  return [arr, getKey(arr)];
}
const encCfg = getEncryptConfig(getTree());
const codeMap = {};
for (let b = 0; b < 256; b++) { const c = encCfg[0][b]; if (!c) continue; if (!codeMap[c.val]) codeMap[c.val] = {}; codeMap[c.val][c.key] = b; }
function numarrDecrypt(numarr) {
  const ans = []; let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) {
    for (let bit = 7; bit >= 0; bit--) {
      curKey = (curKey << 1) | ((numarr[i] >> bit) & 1); curLen++;
      const m = codeMap[curLen];
      if (m && m[curKey] !== undefined) { ans.push(m[curKey]); curKey = 0; curLen = 0; }
    }
  }
  return ans;
}

const block = [47,119,54,154,195,77,48,41,123,55,111,49,253,235,248,167,151,183,140,71,11,230,161,113,127,26,145,122,108,163,109,13,107,166,163,152,211,15,217,5,133,85,184,207,114,162,21,75,16,65,58,91,178,2,173,195,245,45,25,149,136,73,25,83,50,107,38,161,202,142,65,38,53,39,24,78,71,203,94,5,215,0,47,4,204,64,197,121,162,245,251,216,20,120,113,45,36,175,188,59,229];

(async () => {
  const codeRet = await getCode(['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js']);
  gv.wrap(initGv)({ file: 'output/pmos-ts.json', jsurls: codeRet });

  console.log('=== block length:', block.length, '(%4=', block.length % 4, '%16=', block.length % 16, ')');
  // 1. numarrDecrypt (huffman decode)
  try {
    const d = numarrDecrypt(block);
    console.log('numarrDecrypt len:', d.length);
    console.log('numarrDecrypt bytes:', d.slice(0, 60));
    console.log('numarrDecrypt asStr:', JSON.stringify(ascii2string(d).slice(0, 80)));
  } catch(e) { console.log('numarrDecrypt err:', e.message); }

  // 2. Try as numarrJoin nested structure (parse segments)
  // 3. decrypt (the project's decrypt: 4 chars -> 3 bytes). block isn't chars. skip.

  // 4. Maybe it's bitwiseTwoNumarr output? bitwiseTwoNumarr produces len-8 bytes. Reverse not available.

  // 5. Try encryptMode2 with keys[17] but block must be mult of 4. Pad? skip.

  // 6. Check if block could be a sub-basearr (parse with parseOther divs)
  const divarr = [3, 10, 7, 0, 6, 2, 9, 13, 4, 16, 1, 15];
  console.log('first byte div?', divarr.includes(block[0]), 'firstbyte=', block[0]);

  // 7. Try numarrEncrypt(block) to see if it re-encodes cleanly (round-trip check)
  const reenc = numarrEncrypt(block);
  console.log('numarrEncrypt(block) len:', reenc.length, 'roundtrip match:', JSON.stringify(reenc) === JSON.stringify(numarrEncrypt(numarrDecrypt(block))));

  // 8. Maybe block is numarrEncrypt of a structured payload. Decrypt and re-parse as numarrJoin
  const d2 = numarrDecrypt(block);
  console.log('=== numarrDecrypt full ===');
  console.log(JSON.stringify(d2));
  console.log('as string:', JSON.stringify(ascii2string(d2)));
})();
