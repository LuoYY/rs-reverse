// Test: 20-byte [0] session part vs O cookie / keys[16] transformations.
// Usage: node test_ocookie_link.js
const path = require('path');
const fs = require('fs');
require('module-alias')(path.dirname(require('./utils/paths').package));
const gv = require('@src/handler/globalVarible');
const { initGv, getCode } = require('@utils/');
const parser = require('@src/handler/parser/');
const { numToNumarr4, ascii2string, numarrAddTime, encryptMode1, encryptMode2, numarrJoin, xor, combine4, decrypt, decode, string2ascii } = parser;

const tsPath = 'output/pmos-ts.json';
const jsPath = 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js';
// User's expired O cookie (different session from temp1/temp4)
const oCookieRaw = 'aoU85Lxl9xxNO=60wDGzSMoIzx9.HuKViEr5OHfuug9LMmYVtikJ0Uk5naf11ve2teePKmOJETb1t0SL0vW1ZT3evWCl49U1ZKbUTG';

const temp1_last20 = [0,47,4,204,64,197,121,162,245,251,216,20,120,113,45,36,175,188,59,229];
const temp4_last20 = [32,55,87,232,118,203,110,6,197,241,238,21,86,99,95,134,61,190,155,164];
const temp1_seg0_full = [47,119,54,154,195,77,48,41,123,55,111,49,253,235,248,167,151,183,140,71,11,230,161,113,127,26,145,122,108,163,109,13,107,166,163,152,211,15,217,5,133,85,184,207,114,162,21,75,16,65,58,91,178,2,173,195,245,45,25,149,136,73,25,83,50,107,38,161,202,142,65,38,53,39,24,78,71,203,94,5,215,0,47,4,204,64,197,121,162,245,251,216,20,120,113,45,36,175,188,59,229];

// ---- numarr2string decode (from decrypt_cookie.js) ----
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

function safe(fn, label) {
  try { const r = fn(); console.log(`  ${label}: OK len=${Array.isArray(r)?r.length:r}`); return r; }
  catch(e) { console.log(`  ${label}: ERR ${e.message}`); return null; }
}

(async () => {
  const codeRet = await getCode([jsPath]);
  const argv = { file: tsPath, jsurls: codeRet };
  gv.wrap(initGv)(argv);

  console.log('===== KEYS =====');
  console.log('nsd:', gv.ts.nsd);
  console.log('keys[2]  (session, 16B):', gv.keys[2]?.slice(0,16), 'len', gv.keys[2]?.length);
  console.log('keys[16] (site-const):', gv.keys[16]?.slice(0,16), 'len', gv.keys[16]?.length);
  console.log('keys[17] (session):', gv.keys[17]?.slice(0,16), 'len', gv.keys[17]?.length);
  console.log('keys[21] (r2mkaTime):', gv.keys[21]?.slice(0,8), '->', ascii2string(gv.keys[21]));
  console.log('keys[22] (empty for pmos?):', gv.keys[22]?.slice(0,8), 'len', gv.keys[22]?.length);
  console.log('keys[19]:', gv.keys[19]?.slice(0,8), '->', ascii2string(gv.keys[19]));
  console.log('keys[24]:', gv.keys[24]?.slice(0,4), '->', ascii2string(gv.keys[24]));

  // ---------- DECODE O COOKIE ----------
  console.log('\n===== O COOKIE DECODE =====');
  const oName = oCookieRaw.split('=')[0];
  const oVal = oCookieRaw.split('=').slice(1).join('=').split(';')[0].trim();
  console.log('O cookie name:', oName);
  console.log('O cookie value:', oVal, 'len', oVal.length);
  const oBytes = numarr2stringDecode(oVal);
  console.log('O cookie decoded bytes len:', oBytes.length, '(%16=', oBytes.length%16, '%8=', oBytes.length%8,')');
  console.log('O bytes[0..24]:', oBytes.slice(0,24));

  // Try decrypt O cookie with keys[16] (site const) — probably won't work (O uses session TEA key) but test
  console.log('\n--- O cookie decrypt attempts ---');
  safe(() => encryptMode2([...oBytes], gv.keys[16], 1), 'encryptMode2(O, keys16, flag=1)');
  safe(() => encryptMode2([...oBytes], gv.keys[16], 0), 'encryptMode2(O, keys16, flag=0)');

  // ---------- 20-BYTE TRANSFORM TESTS ----------
  console.log('\n===== 20-BYTE [0] SESSION PART: TRANSFORM TESTS =====');

  // Hypothesis A: 20 = 4-byte prefix + 16-byte AES block
  console.log('\n--- A: 4+16 split (prefix[0..3] + AES[4..19]) ---');
  for (const [name, arr] of [['temp1', temp1_last20], ['temp4', temp4_last20]]) {
    console.log(` ${name} prefix[0..3]:`, arr.slice(0,4), 'as u32:', ((arr[0]<<24)|(arr[1]<<16)|(arr[2]<<8)|arr[3])>>>0);
    const aes16 = arr.slice(4,20);
    safe(() => encryptMode2([...aes16], gv.keys[16], 0), `${name} decrypt [4..19] w/ keys16 flag=0`);
    safe(() => encryptMode2([...aes16], gv.keys[2], 0), `${name} decrypt [4..19] w/ keys2 flag=0`);
    safe(() => encryptMode2([...aes16], gv.keys[17], 0), `${name} decrypt [4..19] w/ keys17 flag=0`);
  }

  // Hypothesis B: 20 = 16-byte AES block + 4-byte tail
  console.log('\n--- B: 16+4 split (AES[0..15] + tail[16..19]) ---');
  for (const [name, arr] of [['temp1', temp1_last20], ['temp4', temp4_last20]]) {
    const aes16 = arr.slice(0,16);
    console.log(` ${name} tail[16..19]:`, arr.slice(16,20), 'as u32:', ((arr[16]<<24)|(arr[17]<<16)|(arr[18]<<8)|arr[19])>>>0);
    safe(() => encryptMode2([...aes16], gv.keys[16], 0), `${name} decrypt [0..15] w/ keys16 flag=0`);
    safe(() => encryptMode2([...aes16], gv.keys[2], 0), `${name} decrypt [0..15] w/ keys2 flag=0`);
    safe(() => encryptMode2([...aes16], gv.keys[17], 0), `${name} decrypt [0..15] w/ keys17 flag=0`);
  }

  // Hypothesis C: whole 101-byte [0] = 1-byte hdr + 80-byte AES(IV+4blk) ... + 20 tail
  console.log('\n--- C: [0] = 1-byte hdr + 80-byte AES block, then 20-byte tail ---');
  console.log(' [0] byte[0] (hdr?):', temp1_seg0_full[0], '(temp1=temp4 same?', temp1_seg0_full[0]===47,')');
  const body80 = temp1_seg0_full.slice(1, 81); // 80 bytes
  console.log(' body[1..80] len:', body80.length, '(%16=', body80.length%16,')');
  safe(() => encryptMode2([...body80], gv.keys[16], 1), 'decrypt [1..80] w/ keys16 flag=1 (IV+cipher)');
  safe(() => encryptMode2([...body80], gv.keys[16], 0), 'decrypt [1..80] w/ keys16 flag=0');
  safe(() => encryptMode2([...body80], gv.keys[2], 1), 'decrypt [1..80] w/ keys2 flag=1');

  // Hypothesis D: 20 bytes = encryptMode1 output of something (encryptMode1 adds IV+padding)
  // encryptMode1(plaintext, key, flag, random): if flag=1, prepends 16-byte IV; pads to 16-mult.
  // For 20-byte OUTPUT: 20 = 16(IV) + 16(1 block with padding) - 12? No. encryptMode1 output is always 16-mult + 16(IV).
  // 20 isn't 16-mult → NOT encryptMode1 output. Skip but note.
  console.log('\n--- D: encryptMode1 output length check ---');
  console.log(' encryptMode1 output is always 16(IV)+16*blocks (multiple of 16). 20 % 16 =', 20%16, '→ NOT encryptMode1 output.');

  // Hypothesis E: XOR with keys[16] (cyclic)
  console.log('\n--- E: XOR 20-byte with keys[16] (cyclic, 16B) ---');
  for (const [name, arr] of [['temp1', temp1_last20], ['temp4', temp4_last20]]) {
    const xored = arr.map((b,i) => b ^ gv.keys[16][i % gv.keys[16].length]);
    console.log(` ${name} ^ keys16:`, JSON.stringify(xored));
    const printable = xored.filter(b => b>=32 && b<127).map(b=>String.fromCharCode(b)).join('');
    console.log(` ${name} printable:`, JSON.stringify(printable), '(% printable:', xored.filter(b=>b>=32&&b<127).length+'/20)');
  }

  // Hypothesis F: XOR with keys[2] (session, 16B) — wrong session but test form
  console.log('\n--- F: XOR 20-byte with keys[2] (cyclic, 16B) [WRONG SESSION] ---');
  for (const [name, arr] of [['temp1', temp1_last20], ['temp4', temp4_last20]]) {
    const xored = arr.map((b,i) => b ^ gv.keys[2][i % gv.keys[2].length]);
    const printable = xored.filter(b => b>=32 && b<127).map(b=>String.fromCharCode(b)).join('');
    console.log(` ${name} ^ keys2 printable:`, JSON.stringify(printable), '(% printable:', xored.filter(b=>b>=32&&b<127).length+'/20)');
  }

  // Hypothesis G: 20 bytes related to O cookie? Compare lengths
  console.log('\n--- G: O cookie vs 20-byte length relation ---');
  console.log(' O cookie decoded len:', oBytes.length, ' last20 len: 20');
  console.log(' O cookie len - 20 =', oBytes.length - 20, ' O % 20 =', oBytes.length % 20);

  // Hypothesis H: Is last20 = first/last 20 bytes of O cookie (encrypted)?
  console.log('\n--- H: last20 vs O cookie slices ---');
  console.log(' O[0..19]:', JSON.stringify(oBytes.slice(0,20)));
  console.log(' temp1 last20:', JSON.stringify(temp1_last20));
  console.log(' O[0..19] == temp1 last20?', JSON.stringify(oBytes.slice(0,20))===JSON.stringify(temp1_last20));
  console.log(' O[-20:]:', JSON.stringify(oBytes.slice(-20)));

  // ---------- 616 in [6] ----------
  console.log('\n===== [6] 616 ANALYSIS =====');
  console.log(' temp3 [6] bytes[1..4] = 0,0,0,0 (no [0] generated)');
  console.log(' temp4 [6] bytes[1..4] = 2,104,2,104 = numToNumarr2(616) x2');
  console.log(' 616 = 0x268. 616/8 =', 616/8, ' 616/4 =', 616/4, ' 616/16 =', 616/16);
  // Could 616 be ms timestamp delta? r2mkaTime?
  console.log(' r2mkaTime:', +ascii2string(gv.keys[21]));
  console.log(' 616 as ms = 0.616s (plausible [0]-gen time)');

  console.log('\n===== DONE =====');
})();
