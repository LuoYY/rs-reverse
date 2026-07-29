/**
 * 生成 1 个 cookie → 重放 → 用 decrypt_cookie 同款逻辑反解自己的 basearr，
 * 检查哪些字段随机/异常，定位服务端确定性拒绝的根因。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_decrypt_own.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

let _got = null;
async function gotScraping() {
  if (!_got) {
    const { gotScraping } = await import('got-scraping');
    _got = gotScraping.extend({
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 131, maxVersion: 131 }],
        devices: ['desktop'],
        operatingSystems: ['macos'],
      },
      https: { rejectUnauthorized: false },
      timeout: { request: 15000 },
      retry: { limit: 0 },
      throwHttpErrors: false,
    });
  }
  return _got;
}
async function httpGet(url, cookie) {
  const g = await gotScraping();
  const headers = { 'User-Agent': UA };
  if (cookie) headers['Cookie'] = cookie;
  const res = await g.get(url, { headers });
  return { status: res.statusCode, headers: res.headers, body: res.body };
}

// ---- huffman decode（与 decrypt_cookie.js 相同）----
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
function getKey(arr) { for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; } }
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else { arr[tree.idx] = config; }
  return [arr, getKey(arr)];
}

const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

async function tryOnce(n) {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no $_ts');
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];

  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  if (!r.cp3) throw new Error('no cp3');

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const parser = require('@src/handler/parser/');
  const { encryptMode2, xor } = parser;
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/pmos-xj-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/pmos-xj-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');

  const header = `${oCookie}; ${name}=${cookie}`;
  const replay = await httpGet(TARGET, header);

  // ---- 反解自己的 cookie 回 basearr ----
  const encryptConfig = getEncryptConfig(getTree());
  const codeMap = {};
  for (let b = 0; b < 256; b++) {
    const c = encryptConfig[0][b];
    if (!c) continue;
    if (!codeMap[c.val]) codeMap[c.val] = {};
    codeMap[c.val][c.key] = b;
  }
  function numarrDecrypt(numarr) {
    const ans = [];
    let curLen = 0, curKey = 0;
    for (let i = 0; i < numarr.length; i++) {
      const byte = numarr[i];
      for (let bit = 7; bit >= 0; bit--) {
        const b = (byte >> bit) & 1;
        curKey = (curKey << 1) | b; curLen++;
        const mm = codeMap[curLen];
        if (mm && mm[curKey] !== undefined) { ans.push(mm[curKey]); curKey = 0; curLen = 0; }
      }
    }
    return ans;
  }
  function numarr2stringDecode(str) {
    const keys = gv.basestr.split('');
    const idxmap = {};
    keys.forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
    const numarr = [];
    let i = 0;
    const full = Math.floor(str.length / 4);
    for (let g = 0; g < full; g++) {
      const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]], c3 = idxmap[str[i+3]];
      i += 4;
      numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
    }
    const rem = str.length - i;
    if (rem === 2) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]]; numarr.push((c0 << 2) | (c1 >> 4)); }
    else if (rem === 3) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]]; numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
    return numarr;
  }
  const payload = cookie.startsWith('0') ? cookie.slice(1) : cookie;
  const bytes = numarr2stringDecode(payload);
  const decrypted = encryptMode2(bytes, gv.keys[16], 1);
  const uuidCheck = decrypted.slice(0, 4);
  const nextarr = decrypted.slice(4);
  const uuidCalc = parser.numToNumarr4(parser.uuid(nextarr));
  const uuidOk = JSON.stringify(uuidCheck) === JSON.stringify(uuidCalc);
  // 注意：生成时 keys16 经 numarrAddTime 加 time/ele，反解用原始 keys16（%16=0 不 strip）→ key 不同 → uuid 不匹配属预期。
  // uuidOk 仅作参考，不能判定反解对错。真正的标准是 basearr 能否完整还原（looksValid）。
  let basearr, basearrEncrypt, decryptErr = null, dbgLens = {};
  try {
    let idx = 2;
    const arr8 = nextarr.slice(idx, idx + 8); idx += 8;
    var r2mkaTime = ((arr8[0]<<24)|(arr8[1]<<16)|(arr8[2]<<8)|arr8[3]) >>> 0;
    var startTime = ((arr8[4]<<24)|(arr8[5]<<16)|(arr8[6]<<8)|arr8[7]) >>> 0;
    const keys2len = nextarr[idx]; idx++;
    idx += keys2len;
    let rest = nextarr.slice(idx);
    if ((rest[0] & 0x80) === 0x80) {
      const encLen = rest[1] | ((rest[0] & 0x7f) << 8);
      basearrEncrypt = rest.slice(2, 2 + encLen);
    } else {
      let encLen = rest[0];
      let off = 1;
      if (encLen > rest.length - 2 && rest.length >= 2) { encLen = (rest[0] << 8) | rest[1]; off = 2; }
      basearrEncrypt = rest.slice(off, off + encLen);
    }
    const basearrXor = encryptMode2([...basearrEncrypt], gv.keys[17], 0);
    const numenc = xor([...basearrXor], gv.keys[2], 16);
    basearr = numarrDecrypt(numenc);
    dbgLens = { nextarrLen: nextarr.length, basearrEncLen: basearrEncrypt.length, encMod16: basearrEncrypt.length % 16, xorLen: basearrXor.length };
  } catch (e) {
    decryptErr = e.message;
    dbgLens = { nextarrLen: nextarr.length, basearrEncLen: basearrEncrypt ? basearrEncrypt.length : -1, encMod16: basearrEncrypt ? basearrEncrypt.length % 16 : -1 };
    basearr = [];
  }
  const looksValid = basearr[0] === 3 && basearr[1] === 73 && basearr.length === 244;
  let debug = null;
  if (!looksValid) {
    debug = { decryptErr, uuidOk, ...dbgLens, baseHead: basearr.slice(0, 8).join(',') };
  }

  // 解析关键字段（basearr[0]=3 起始，按 len243 结构映射）
  const nowSec = Math.floor(Date.now() / 1000);
  const f = {
    head: basearr.slice(0, 6).join(','),                       // 应 3,73,1,0,33,128
    execN: ((basearr[25]<<24)|(basearr[26]<<16)|(basearr[27]<<8)|basearr[28]) >>> 0,
    randAvg: basearr[31], randVar: basearr[32],
    innerH: (basearr[46]<<8)|basearr[47], innerW: (basearr[48]<<8)|basearr[49],
    outerH: (basearr[50]<<8)|basearr[51], outerW: (basearr[52]<<8)|basearr[53],
    seg0tagPos111: basearr[111],                                // [0] 段 tag 前应=101(长度)
    seg0Head: basearr.slice(112, 120).join(','),
    seg0Tail: basearr.slice(204, 213).join(','),
    r2mkaTime, startTime, nowSec,
    startMinusNow: startTime - nowSec,
    basearrLen: basearr.length,
    debug,
  };
  return { status: replay.status, ...f, basearr, nextarr, r2mkaTime, startTime, cookie, cookieHeader: header };
}

async function main() {
  const n = parseInt(process.argv[2] || '10', 10);
  let ok = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    try {
      const row = await tryOnce(i);
      rows.push(row);
      if (row.status === 200) ok++;
      console.log(`#${i+1}: ${row.status} execN=${row.execN} baseLen=${row.basearrLen} head=${row.head}${row.debug ? ' DBG=' + JSON.stringify(row.debug) : ''}`);
    } catch (e) { console.log(`#${i+1}: ERR ${String(e.message).substring(0,60)}\n${(e.stack||'').split('\n').slice(1,4).join('\n')}`); }
  }
  console.log(`\n===== ${ok}/${n} 通过 =====`);
  // 通过的 vs 拒绝的关键字段对比
  const oks = rows.filter(r => r.status === 200), bads = rows.filter(r => r.status !== 200);
  for (const k of ['execN','randAvg','randVar','startMinusNow']) {
    console.log(`${k}: 200=${JSON.stringify(oks.map(r=>r[k]))} 412=${JSON.stringify(bads.map(r=>r[k]))}`);
  }
  if (oks[0]) console.log('200 seg0Tail:', oks[0].seg0Tail);
  if (bads[0]) console.log('412 seg0Tail:', bads[0].seg0Tail);
  // 落盘通过样本的完整明文供分析
  const passed = oks.map(r => ({ status: r.status, execN: r.execN, basearr: r.basearr, nextarr: r.nextarr, r2mkaTime: r.r2mkaTime, startTime: r.startTime, cookie: r.cookie, cookieHeader: r.cookieHeader }));
  fs.writeFileSync('/tmp/passed_cookies.json', JSON.stringify(passed, null, 2));
  console.log(`\n通过样本明文已存 /tmp/passed_cookies.json (${passed.length} 个)`);
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
