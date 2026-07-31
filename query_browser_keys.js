/**
 * query_browser_keys.js — 在浏览器中提取所有 RS 内部变量 + cookie keys
 * 然后用这些 keys 尝试解密 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  let nsd = null, cd = null;
  const queries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) queries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Runtime.enable');

  page.on('response', async resp => {
    if (resp.status() === 412 && !nsd) {
      const body = await resp.text().catch(() => '');
      const m = body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (m) { nsd = +m[1]; cd = m[2]; }
    }
  });

  console.log('Loading...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log(`nsd=${nsd}, reload...`);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  console.log(`Queries: ${queries.length}`);
  if (queries.length === 0 || !nsd) { console.log('No data'); process.exit(1); }

  // 用 CDP 在主 context 中提取所有 RS 变量
  console.log('\n=== 提取 RS 内部变量 ===');

  // 1. 检查 window 上所有 _$ 开头的变量
  const winVars = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var r = {};
      var names = Object.getOwnPropertyNames(window);
      for (var i = 0; i < names.length; i++) {
        var k = names[i];
        if (k.match(/^_\\$/) && k.length <= 8) {
          try {
            var v = window[k];
            if (typeof v === 'object' && v !== null) {
              var keys = Object.keys(v);
              if (keys.length > 0 && keys.length < 50) {
                r[k] = { type: 'object', keys: keys.slice(0, 10) };
              }
            } else if (typeof v === 'function') {
              r[k] = { type: 'function' };
            } else if (typeof v === 'number' || typeof v === 'boolean') {
              r[k] = { type: typeof v, value: v };
            }
          } catch(e) {}
        }
      }
      return JSON.stringify(r);
    })()`,
    returnByValue: true,
  });
  console.log('Window _$ vars:', winVars.result.value?.substring(0, 500));

  // 2. 检查 $_ts 的所有属性
  const tsVars = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var ts = window.$_ts || {};
      var r = {};
      for (var k of Object.keys(ts)) {
        var v = ts[k];
        if (typeof v === 'function') r[k] = 'fn';
        else if (Array.isArray(v)) r[k] = 'arr[' + v.length + ']';
        else if (typeof v === 'object' && v !== null) r[k] = 'obj';
        else r[k] = String(v).substring(0, 30);
      }
      return JSON.stringify(r);
    })()`,
    returnByValue: true,
  });
  console.log('\n$_ts vars:', tsVars.result.value);

  // 3. 获取 P cookie
  const cookieStr = await client.send('Runtime.evaluate', {
    expression: 'document.cookie',
    returnByValue: true,
  });
  const cookies = cookieStr.result.value || '';
  console.log('\nCookies:', cookies.substring(0, 100));

  // 提取 P cookie
  const pMatch = cookies.match(/aoU85Lxl9xxNP=([^;]+)/);
  const oMatch = cookies.match(/aoU85Lxl9xxNO=([^;]+)/);
  const pCookie = pMatch ? pMatch[1] : null;
  const oCookie = oMatch ? oMatch[1] : null;

  // 4. 从 P cookie 解密出所有 keys（用管线）
  console.log('\n=== 从 P cookie 解密 keys ===');
  // 初始化管线
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(ROOT);
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/q-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/q-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const runRet = coder.run();
  runRet['$_ts'].cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  new Cookie(coder).run();

  const parser = require('@src/handler/parser/');
  const { encryptMode2, numarrEncrypt, xor, uuid, numToNumarr4 } = parser;

  console.log('keys16:', gv.keys[16]);
  console.log('keys17:', gv.keys[17]);
  console.log('keys count:', gv.keys.length);

  // 解密浏览器 P cookie
  if (pCookie) {
    console.log('\n=== 解密浏览器 P cookie ===');
    const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
    const idxmap = {};
    basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

    const payload = pCookie.startsWith('0') ? pCookie.slice(1) : pCookie;
    const pBytes = [];
    let i = 0;
    const full = Math.floor(payload.length / 4);
    for (let g = 0; g < full; g++) {
      const c0=idxmap[payload[i]],c1=idxmap[payload[i+1]],c2=idxmap[payload[i+2]],c3=idxmap[payload[i+3]];
      i+=4; pBytes.push((c0<<2)|(c1>>4),((c1&15)<<4)|(c2>>2),((c2&3)<<6)|c3);
    }
    const rem = payload.length-i;
    if (rem===2) pBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
    else if (rem===3) pBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4),((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));

    console.log('P cookie decoded:', pBytes.length, 'bytes');

    // 用 keys16 解密外层
    const dec16 = encryptMode2([...pBytes], [...gv.keys[16]], 1);
    if (dec16 && dec16.length > 4) {
      console.log('Decrypted outer:', dec16.length, 'bytes');
      // 检查 uuid
      const nextarr = dec16.slice(4);
      const uuidVal = uuid(nextarr);
      const uuidBytes = numToNumarr4(uuidVal);
      const uuidOk = JSON.stringify(dec16.slice(0, 4)) === JSON.stringify(uuidBytes);
      console.log('UUID ok:', uuidOk);

      if (uuidOk) {
        console.log('Nextarr length:', nextarr.length);
        // nextarr = numarrJoin(2, time, keys2, 128, basearrEncrypt)
        // 解析 nextarr
        console.log('nextarr[0]:', nextarr[0], '(should be 2)');
        console.log('nextarr[1..8] (time):', nextarr.slice(1, 9));
        console.log('nextarr[9..56] (keys2):', nextarr.slice(9, 57).length, 'bytes');
        const browserKeys2 = nextarr.slice(9, 57);
        console.log('browser keys2:', browserKeys2.slice(0, 10).join(','));
        console.log('pipe keys2:', gv.keys[2].slice(0, 10).join(','));
        console.log('keys2 match:', JSON.stringify(browserKeys2) === JSON.stringify(gv.keys[2]));

        // basearrEncrypt
        console.log('nextarr[57]:', nextarr[57], '(should be 128)');
        const basearrEncrypt = nextarr.slice(58);
        console.log('basearrEncrypt:', basearrEncrypt.length, 'bytes');

        // 解密 basearrEncrypt
        // basearrEncrypt = encryptMode1(xor(huffman(basearr), keys2, 16), keys17, 0)
        const dec17 = encryptMode2([...basearrEncrypt], [...gv.keys[17]], 0);
        if (dec17) {
          console.log('Decrypted inner:', dec17.length, 'bytes');
          // XOR 前 16 字节
          const xored = [...dec17];
          for (let j = 0; j < 16; j++) xored[j] ^= gv.keys[2][j];
          // Huffman 解码
          const basearr = numarrEncrypt(xored); // 这是编码，需要解码
          // 实际上 numarrEncrypt 是编码，numarrDecrypt 是解码
          // 但管线可能没有 export numarrDecrypt
          console.log('Inner decrypted head:', dec17.slice(0, 10));
        }
      }
    }
  }

  // 5. 解码 query
  console.log('\n=== 解密 query ===');
  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  const idxmap = {};
  basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

  const qPayload = queries[0].query.startsWith('0') ? queries[0].query.slice(1) : queries[0].query;
  const queryBytes = [];
  let qi = 0;
  const qfull = Math.floor(qPayload.length / 4);
  for (let g = 0; g < qfull; g++) {
    const c0=idxmap[qPayload[qi]],c1=idxmap[qPayload[qi+1]],c2=idxmap[qPayload[qi+2]],c3=idxmap[qPayload[qi+3]];
    qi+=4; queryBytes.push((c0<<2)|(c1>>4),((c1&15)<<4)|(c2>>2),((c2&3)<<6)|c3);
  }
  const qrem = qPayload.length-qi;
  if (qrem===2) queryBytes.push((idxmap[qPayload[qi]]<<2)|(idxmap[qPayload[qi+1]]>>4));
  else if (qrem===3) queryBytes.push((idxmap[qPayload[qi]]<<2)|(idxmap[qPayload[qi+1]]>>4),((idxmap[qPayload[qi+1]]&15)<<4)|(idxmap[qPayload[qi+2]]>>2));

  const sessionData = queryBytes.slice(7, 55);
  const requestData = queryBytes.slice(56, 88);
  const nonce = queryBytes.slice(0, 4);

  // 用管线 encryptMode2 尝试所有 cd keys
  console.log('Trying all cd keys with encryptMode2...');
  let bestHit = { ratio: 0 };
  for (let ki = 0; ki < gv.keys.length; ki++) {
    const key = gv.keys[ki];
    if (!key || key.length < 16) continue;

    for (const flag of [0, 1]) {
      try {
        const dec = encryptMode2([...sessionData], [...key], flag);
        if (dec && dec.length > 5) {
          const r = dec.filter(b => b >= 32 && b <= 126).length / dec.length;
          if (r > bestHit.ratio) {
            bestHit = { ki, flag, ratio: r, len: dec.length, dec: dec.slice(0, 16) };
          }
          if (r > 0.5) console.log(`  keys[${ki}] f${flag}: ${(r*100).toFixed(0)}%`);
        }
      } catch(e) {}

      try {
        const dec = encryptMode2([...requestData], [...key], flag);
        if (dec && dec.length > 5) {
          const r = dec.filter(b => b >= 32 && b <= 126).length / dec.length;
          if (r > 0.5) console.log(`  keys[${ki}] request f${flag}: ${(r*100).toFixed(0)}%`);
        }
      } catch(e) {}
    }
  }
  console.log('Best:', JSON.stringify(bestHit));

  // 6. 保存数据
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-browser-keys.json'),
    JSON.stringify({
      nsd, cd,
      queries: queries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      pCookie, oCookie,
      keys16: gv.keys[16], keys17: gv.keys[17],
      timestamp: new Date().toISOString(),
    }, null, 2)
  );

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
