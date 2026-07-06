// Decrypt a real pmos cookie back to its basearr, using the project's modules.
// Usage: node decrypt_cookie.js <ts.json> <jsfile> <cookieValue>
const path = require('path');
const fs = require('fs');
const JSON5 = require('json5');
require('module-alias')(path.dirname(require('./utils/paths').package));
const gv = require('@src/handler/globalVarible');
const { initGv, getCode } = require('@utils/');
const parser = require('@src/handler/parser/');
const { numToNumarr4, uuid, ascii2string, numarrAddTime, encryptMode1, encryptMode2, numarrJoin, xor, combine4 } = parser;

// ---- huffman decode (inverse of numarrEncrypt) ----
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) {
      if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
    }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getKey(arr) {
  for (let idx in arr) {
    if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8;
  }
}
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else {
    arr[tree.idx] = config;
  }
  return [arr, getKey(arr)];
}
const encryptConfig = getEncryptConfig(getTree());
// build lookup: length -> map(pattern -> byte)
const codeMap = {};
for (let b = 0; b < 256; b++) {
  const c = encryptConfig[0][b];
  if (!c) continue;
  if (!codeMap[c.val]) codeMap[c.val] = {};
  codeMap[c.val][c.key] = b;
}
function numarrDecrypt(numarr) {
  const ans = [];
  let one = 0, two = 0, curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) {
    const byte = numarr[i];
    for (let bit = 7; bit >= 0; bit--) {
      const b = (byte >> bit) & 1;
      curKey = (curKey << 1) | b;
      curLen++;
      const m = codeMap[curLen];
      if (m && m[curKey] !== undefined) {
        ans.push(m[curKey]);
        curKey = 0; curLen = 0;
      }
    }
  }
  return ans;
}

// ---- numarr2string decode (inverse of numarr2string) ----
function numarr2stringDecode(str) {
  const keys = gv.basestr.split('');
  const idxmap = {};
  keys.forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const numarr = [];
  let i = 0;
  const full = Math.floor(str.length / 4);
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[str[i]], c1 = idxmap[str[i + 1]], c2 = idxmap[str[i + 2]], c3 = idxmap[str[i + 3]];
    i += 4;
    numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - i;
  if (rem === 2) {
    const c0 = idxmap[str[i]], c1 = idxmap[str[i + 1]];
    numarr.push((c0 << 2) | (c1 >> 4));
  } else if (rem === 3) {
    const c0 = idxmap[str[i]], c1 = idxmap[str[i + 1]], c2 = idxmap[str[i + 2]];
    numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  }
  return numarr;
}

// ---- main ----
const [, , tsPath, jsPath, cookieRaw] = process.argv;
if (!cookieRaw) { console.error('usage: node decrypt_cookie.js <ts.json> <jsfile> <cookieValue>'); process.exit(1); }
const cookie = cookieRaw.replace(/^[^=]+=/, '').split(';')[0].trim(); // strip name and trailing
// strip leading '0'
const payload = cookie.startsWith('0') ? cookie.slice(1) : cookie;

(async () => {
// init gv
const codeRet = await getCode([jsPath]); // {jscode, appcode}
const argv = { file: tsPath, jsurls: codeRet };
gv.wrap(initGv)(argv);

console.log('nsd:', gv.ts.nsd, 'keynameNum:', gv.config.keynameNum);
console.log('keys[2] len:', gv.keys[2].length, 'keys[16] len:', gv.keys[16].length, 'keys[17] len:', gv.keys[17].length);
console.log('cookie name prefix:', ascii2string(gv.keys[7]).split(';')[5]);

// 1. decode base64-like
const bytes = numarr2stringDecode(payload);
console.log('decoded bytes len:', bytes.length, '(%4=', bytes.length % 4, ')');
// 2. AES-CBC decrypt with keys[16], flag=1 (strips padding)
const decrypted = encryptMode2(bytes, gv.keys[16], 1);
console.log('outer decrypted len:', decrypted.length);
// 3. first 4 bytes = uuid(nextarr), rest = nextarr
const uuidCheck = decrypted.slice(0, 4);
const nextarr = decrypted.slice(4);
const uuidCalc = numToNumarr4(uuid(nextarr));
console.log('uuid check:', uuidCheck, 'calc:', uuidCalc, 'match:', JSON.stringify(uuidCheck) === JSON.stringify(uuidCalc));
// 4. parse nextarr = numarrJoin(numarrJoin(2, numToNumarr4([r2mkaTime, startTime]), keys[2]), [debug?], basearrEncrypt)
//    structure: [2, 8, ...arr8(8), keys2len, ...keys2, (debug?), baseenclen, ...basearrEncrypt]
let idx = 0;
console.log('nextarr[0] (expect 2):', nextarr[idx], 'nextarr[1] (expect 8):', nextarr[idx+1]);
idx += 2; // skip 2 and arr8-length(8)
const arr8 = nextarr.slice(idx, idx + 8); idx += 8;
const r2mkaTime = (arr8[0]<<24)|(arr8[1]<<16)|(arr8[2]<<8)|arr8[3];
const startTime = (arr8[4]<<24)|(arr8[5]<<16)|(arr8[6]<<8)|arr8[7];
const keys2len = nextarr[idx]; idx++;
const keys2 = nextarr.slice(idx, idx + keys2len); idx += keys2len;
console.log('r2mkaTime:', r2mkaTime, 'startTime:', startTime, 'keys2len:', keys2len);
console.log('keys2[0..8]:', keys2.slice(0,8));
console.log('gv.keys[2][0..8]:', gv.keys[2].slice(0,8));
console.log('keys2 match:', JSON.stringify(keys2) === JSON.stringify(gv.keys[2]));
// remaining nextarr: optional debug byte, then basearrEncrypt (length-prefixed)
// debug byte (if hasDebug) = (len>>8 & 255) | 128, so bit 7 is always set
let rest = nextarr.slice(idx);
console.log('rest len:', rest.length, 'rest[0..3]:', rest.slice(0, 4));
let basearrEncrypt;
const hasDebugByte = (rest[0] & 0x80) === 0x80;
if (hasDebugByte) {
  // [debugbyte, encLen, ...baseenc]
  const encLen = rest[1] | ((rest[0] & 0x7f) << 8);
  basearrEncrypt = rest.slice(2, 2 + encLen);
} else {
  const encLen = rest[0];
  basearrEncrypt = rest.slice(1, 1 + encLen);
}
console.log('hasDebugByte:', hasDebugByte, 'basearrEncrypt len:', basearrEncrypt.length, '(%16=', basearrEncrypt.length % 16, ')');
console.log('basearrEncrypt[0..16]:', basearrEncrypt.slice(0,16));
// 5. AES-CBC decrypt basearrEncrypt with keys[17], flag=0 (raw, no strip to inspect)
const cfg17 = require('@src/handler/parser/common/modeEncrypt');
// manually decrypt without stripping to see padding byte
const basearrXorRaw = (function(){
  // replicate encryptMode2 but without the final strip
  const { combine4 } = parser;
  const _zip = require('lodash/zip');
  const gv2 = gv;
  function encode(cfg, val, idx, cfgnum){ return require('@src/handler/parser/common/modeEncrypt'); }
  // easier: call encryptMode2 and also compute raw via a copy
  return null;
})();
const basearrXor = encryptMode2([...basearrEncrypt], gv.keys[17], 0);
console.log('basearrXor (decrypted+stripped) len:', basearrXor.length);
// also get raw (unstripped) by patching: encryptMode2 strips ret[len-1]; let's compute raw manually
const rawDecrypt = (function(){
  const modeEncrypt = require('@src/handler/parser/common/modeEncrypt');
  // access internal via re-requiring combine4 and replicating getCfg+encode is heavy; instead infer raw len:
  // stripped len = rawLen - raw[rawLen-1]. So rawLen = basearrEncrypt.length (AES output same len as input)
  return null;
})();
console.log('basearrXor last bytes (stripped):', basearrXor.slice(-8));
console.log('(raw AES out len = basearrEncrypt len =', basearrEncrypt.length, ', stripped', basearrEncrypt.length - basearrXor.length, '=> padding byte =', basearrEncrypt.length - basearrXor.length, ')');
// 6. xor with keys[2] (16 bytes)
const numenc = xor([...basearrXor], gv.keys[2], 16);
console.log('numenc len:', numenc.length);
// 7. huffman decode
const basearr = numarrDecrypt(numenc);
console.log('BASEARR len:', basearr.length);
console.log('BASEARR:', JSON.stringify(basearr));
})();
