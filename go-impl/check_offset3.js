// Trace tscd.init to see what offset is actually used
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ROOT = path.resolve(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

(async () => {
  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/');
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(ROOT);
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const tsFull = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/t.json', JSON.stringify(tsFull));
  const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv); require('@src/config/')(gv); gv._setAttr('_ts', tsFull);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...tsFull }, gv.config.immucfg);
  const runRet = coder.run(); runRet['$_ts'].cp[3] = r.cp3; gv.config.codemap = runRet.codemap;

  // Need to init parser first (sets up gv.ts, gv.keys etc)
  const parser = require('@src/handler/parser/');
  parser.init(coder);

  // Now manually run tscd.init logic
  const decrypt = require('@src/handler/parser/common/decrypt');
  const numToNumarr4 = require('@src/handler/parser/common/numToNumarr4');
  const { runTaskByUid } = require('@src/handler/parser/common/runTask');
  const getLens = require('@src/handler/parser/common/getLens');

  const cdArr = decrypt(gv.ts.cd);
  const start = 2;
  const end = (cdArr[0] << 8 | cdArr[1]) + start;

  function getValMaps() {
    let uid = gv.ts.cp[3];
    const ans = [];
    for (let i = 0; i < 4; i++) { uid = 15679 * (uid & 65535) + 2531011; ans.push(uid); }
    return numToNumarr4(ans);
  }
  function parse(arr) {
    const len = arr.length;
    const valMap = getValMaps();
    let idx = 4;
    do {
      idx += 16;
      const mod = idx % (len - idx > 16 ? 16 : len - idx);
      if (mod + idx < arr.length) arr[mod + idx] ^= valMap[mod];
    } while (idx < len);
    return arr;
  }
  const one = parse(cdArr.slice(start, end));

  function getTaskarr(arr, idx, ans) {
    ans = ans || {};
    if (idx >= arr.length) return;
    const s = idx + 1;
    const e = s + arr[idx];
    const key = arr[idx - 2];
    ans[key] = gv.r2mka().child_one[key].taskarr = arr.slice(s, e);
    getTaskarr(arr, e + 2, ans);
    return ans;
  }
  const taskarr = getTaskarr(one, one[3]);

  let offset;
  try {
    offset = runTaskByUid('U14124020', [], taskarr);
    console.log('offset type:', typeof offset, 'isArray:', Array.isArray(offset));
    if (Array.isArray(offset)) {
      console.log('offset:', JSON.stringify(offset));
    } else {
      console.log('offset value:', offset);
    }
  } catch (e) {
    console.log('runTaskByUid error:', e.message);
    offset = undefined;
  }

  // The pipeline works because in the REAL tscd.init (called by parser.init),
  // the offset IS computed. But when we call it separately, r2mka state may differ.
  // Let me check gv.keys which was set by the real parser.init
  console.log('gv.keys count:', gv.keys ? gv.keys.length : 'null');
  if (gv.keys && gv.keys[16]) {
    console.log('gv.keys16:', gv.keys[16]);
  }

  // Reverse-engineer offset: we know gv.keys was set by the real tscd.init
  // The real tscd.init does: ans = cdArr.slice(end).map((item, idx) => item ^ offset[idx % 8])
  // Then genKeys(ans) produces gv.keys
  // So we can recover offset by: offset[i%8] = cdArr[end+i] ^ ans[i]
  // where ans is the array that genKeys was called with

  // From gv.keys, we can reconstruct what genKeys received:
  // genKeys reads ans[0] as count, then step=2 reads 2-byte gaps
  // keys[0] = ans[3..3+gap0], etc.
  // We know keys[16] = [21,144,168,...], so we can trace back

  // Actually, simpler: just XOR cdArr[end+i] with the known key bytes
  // genKeys with step=2: ans[0]=count, ans[1..2]=gap0, ans[3..3+gap0-1]=key0
  // key0 = keys[0], gap0 = len(keys[0])
  // So: offset[3%8] = cdArr[end+3] ^ keys[0][0], offset[4%8] = cdArr[end+4] ^ keys[0][1], etc.

  // But we need to know which step was used. Let me just print keys[0] and trace
  console.log('keys[0]:', gv.keys[0]);
  console.log('keys[0] len:', gv.keys[0].length);
  // gap0 = keys[0].length, so ans[1..2] should encode this
  // step=2: gap0 = ans[1]<<8|ans[2]
  // So ans[1] = gap0>>8, ans[2] = gap0&255
  var gap0 = gv.keys[0].length;
  var expectedAns1 = gap0 >> 8;
  var expectedAns2 = gap0 & 255;
  console.log('expected ans[1]:', expectedAns1, 'ans[2]:', expectedAns2);

  // Now compute offset[1%8] and offset[2%8]
  // offset[1] = cdArr[end+1] ^ expectedAns1
  // offset[2] = cdArr[end+2] ^ expectedAns2
  console.log('offset[1]:', cdArr[end+1] ^ expectedAns1, '(cdArr:', cdArr[end+1], ')');
  console.log('offset[2]:', cdArr[end+2] ^ expectedAns2, '(cdArr:', cdArr[end+2], ')');

  // Also check offset[0]: ans[0] = number of keys = gv.keys.length
  var expectedAns0 = gv.keys.length;
  console.log('expected ans[0]:', expectedAns0, 'actual cdArr[end]:', cdArr[end]);
  console.log('offset[0]:', cdArr[end] ^ expectedAns0);

  // Compute full 8-byte offset
  var fullOffset = [];
  for (var i = 0; i < 8; i++) fullOffset.push(-1); // unknown

  // From ans[0] (offset[0])
  fullOffset[0] = cdArr[end] ^ expectedAns0;
  // From ans[1..2] (offset[1], offset[2])
  fullOffset[1] = cdArr[end+1] ^ expectedAns1;
  fullOffset[2] = cdArr[end+2] ^ expectedAns2;

  // From key0 bytes (offset[3..3+gap0-1])
  for (var i = 0; i < gv.keys[0].length && i < 20; i++) {
    var offIdx = (3 + i) % 8;
    if (fullOffset[offIdx] === -1) {
      fullOffset[offIdx] = cdArr[end + 3 + i] ^ gv.keys[0][i];
    }
  }

  console.log('recovered offset:', JSON.stringify(fullOffset));

  // Now verify: apply offset and check if genKeys produces correct keys
  var xoredAns = cdArr.slice(end).map((item, idx) => item ^ fullOffset[idx % 8]);
  console.log('xored ans[0]:', xoredAns[0], '(should be 45)');
  console.log('xored ans[1..2]:', xoredAns[1], xoredAns[2], '(should be 0, 2)');

  // Run genKeys on xored data
  function getLensLocal(a, i) { var item = a[i++]; var l; if ((item & 128) === 0) l = item; else if ((item & 192) == 128) l = (item & 63) << 8 | a[i++]; else if ((item & 224) == 192) l = (item & 31) << 16 | a[i++] << 8 | a[i++]; else if ((item & 240) == 224) l = (item & 15) << 24 | a[i++] << 16 | a[i++] << 8 | a[i++]; else if ((item & 248) == 240) l = (a[i++] << 24 | a[i++] << 16 | a[i++] << 8 | a[i++]) >>> 0; else l = item; return [l, i]; }
  function genKeysLocal(a, step) { step = step || 2; var keys = []; for (var i = 0, op = 1, gap; i < a[0]; i++) { if (step === 2) { gap = a[op] << 8 | a[op + 1]; op += 2; } else { var r = getLensLocal(a, op); gap = r[0]; op = r[1]; } keys.push(a.slice(op, op + gap)); op += gap; } return keys; }

  // We know offset[0..4] = [1,153,3,3,5]. Need offset[5..7].
  // Use known key bytes to recover them.
  // After key0 (2 bytes at positions 3,4), next is gap1 at positions 5,6
  // key1 = keys[1], gap1 = keys[1].length
  var gap1 = gv.keys[1].length;
  var expectedAns5 = gap1 >> 8; // offset[5%8]=offset[5]
  var expectedAns6 = gap1 & 255; // offset[6%8]=offset[6]
  fullOffset[5] = cdArr[end + 5] ^ expectedAns5;
  fullOffset[6] = cdArr[end + 6] ^ expectedAns6;
  console.log('gap1:', gap1, 'offset[5]:', fullOffset[5], 'offset[6]:', fullOffset[6]);

  // key1 bytes start at position 7
  // offset[7%8]=offset[7]
  fullOffset[7] = cdArr[end + 7] ^ gv.keys[1][0];
  console.log('offset[7]:', fullOffset[7]);

  console.log('FULL offset:', JSON.stringify(fullOffset));

  // Verify
  var verifyAns = cdArr.slice(end).map((item, idx) => item ^ fullOffset[idx % 8]);
  var verifyKeys = genKeysLocal(verifyAns, 2);
  console.log('verify keys count:', verifyKeys.length);
  console.log('verify keys16:', verifyKeys[16]);
  console.log('keys16 match:', JSON.stringify(verifyKeys[16]) === JSON.stringify(gv.keys[16]));

  const ans = cdArr.slice(end);
  console.log('ans[0]:', ans[0], 'ans[1]:', ans[1], 'ans[2]:', ans[2]);
  if (offset && Array.isArray(offset)) {
    const xored = ans.map((item, idx2) => item ^ offset[idx2 % offset.length]);
    console.log('xored[0]:', xored[0], 'xored[1]:', xored[1], 'xored[2]:', xored[2]);
    console.log('xored first gap (step2):', (xored[1] << 8) | xored[2]);
  }

  process.exit(0);
})().catch(e => { console.error('ERR:', e.message, e.stack); process.exit(1); });
