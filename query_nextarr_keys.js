/**
 * query_nextarr_keys.js — 从浏览器 P cookie nextarr 提取所有 key
 * 然后用这些 key 解密 query
 *
 * 关键发现：浏览器 P cookie 的 nextarr 包含 keys2
 * 但 keys2 与管线 keys2 不同！
 * 浏览器 keys2 可能是 query 加密的真正密钥
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

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

  // 获取浏览器 cookie
  const cookieResult = await client.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  const cookies = cookieResult.result.value || '';
  const pMatch = cookies.match(/aoU85Lxl9xxNP=([^;]+)/);
  const pCookie = pMatch ? pMatch[1] : null;
  console.log(`P cookie: ${pCookie?.length} chars`);

  await browser.close();

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
  const { encryptMode2, numarrEncrypt, uuid, numToNumarr4 } = parser;

  // 解码 P cookie
  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  const idxmap = {};
  basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

  function decode(str) {
    const p = str.startsWith('0') ? str.slice(1) : str;
    const bytes = []; let i = 0;
    const full = Math.floor(p.length / 4);
    for (let g = 0; g < full; g++) {
      const c0=idxmap[p[i]],c1=idxmap[p[i+1]],c2=idxmap[p[i+2]],c3=idxmap[p[i+3]];
      i+=4; bytes.push((c0<<2)|(c1>>4),((c1&15)<<4)|(c2>>2),((c2&3)<<6)|c3);
    }
    const rem = p.length-i;
    if (rem===2) bytes.push((idxmap[p[i]]<<2)|(idxmap[p[i+1]]>>4));
    else if (rem===3) bytes.push((idxmap[p[i]]<<2)|(idxmap[p[i+1]]>>4),((idxmap[p[i+1]]&15)<<4)|(idxmap[p[i+2]]>>2));
    return bytes;
  }

  // 解密 P cookie
  const pBytes = decode(pCookie);
  const dec16 = encryptMode2([...pBytes], [...gv.keys[16]], 1);
  const nextarr = dec16.slice(4);

  console.log(`\nNextarr: ${nextarr.length} bytes`);

  // 正确解析 nextarr 结构
  // nextarr = numarrJoin(inner, highByte, basearrEncrypt)
  // inner = numarrJoin(2, timeBytes, keys2)
  // inner = [2] + timeBytes(8) + [keys2.length] + keys2(48)
  // nextarr = inner(58) + [highByte] + [basearrEncrypt.length] + basearrEncrypt

  const innerLen = 1 + 8 + 1 + 48; // = 58
  const browserKeys2 = nextarr.slice(10, 10 + 48);
  const highByte = nextarr[innerLen];
  const baLenPrefix = nextarr[innerLen + 1];
  const basearrEncrypt = nextarr.slice(innerLen + 2);

  console.log(`browser keys2: [${browserKeys2.slice(0, 10).join(',')}...]`);
  console.log(`pipe keys2: [${gv.keys[2].slice(0, 10).join(',')}...]`);
  console.log(`keys2 match: ${JSON.stringify(browserKeys2) === JSON.stringify(gv.keys[2])}`);
  console.log(`highByte: ${highByte}`);
  console.log(`baLenPrefix: ${baLenPrefix}`);
  console.log(`basearrEncrypt: ${basearrEncrypt.length} bytes`);

  // 解密 basearrEncrypt
  const dec17 = encryptMode2([...basearrEncrypt], [...gv.keys[17]], 0);
  console.log(`\nDecrypted inner: ${dec17.length} bytes`);

  // XOR 前 16 字节 with browser keys2
  const xored = [...dec17];
  for (let j = 0; j < 16; j++) xored[j] ^= browserKeys2[j];
  console.log(`After XOR keys2: [${xored.slice(0, 10).join(',')}...]`);

  // 解码 query
  const queryBytes = decode(queries[0].query);
  const sessionData = queryBytes.slice(7, 55);
  const requestData = queryBytes.slice(56, 88);
  const nonce = queryBytes.slice(0, 4);

  console.log(`\n=== 解密 query ===`);
  console.log(`Session: [${sessionData.slice(0, 8).join(',')}...]`);
  console.log(`Request: [${requestData.slice(0, 8).join(',')}...]`);

  // 用浏览器 keys2 的各种切片 + 所有 cd keys + 所有模式
  function aesDecrypt(data, key, iv, mode) {
    try {
      const dec = crypto.createDecipheriv('aes-'+(key.length*8)+'-'+mode, Buffer.from(key), iv||Buffer.alloc(0));
      dec.setAutoPadding(false);
      return Array.from(Buffer.concat([dec.update(Buffer.from(data)), dec.final()]));
    } catch(e) { return null; }
  }
  function asciiRatio(b) { if(!b) return 0; return b.filter(x=>x>=32&&x<=126).length/b.length; }

  // 收集所有候选 key
  const allKeys = [];

  // 浏览器 keys2 切片
  for (let off = 0; off + 16 <= browserKeys2.length; off += 4) {
    allKeys.push({ name: `bkeys2[${off}]`, data: browserKeys2.slice(off, off + 16) });
  }

  // basearrEncrypt 切片
  for (let off = 0; off + 16 <= basearrEncrypt.length; off += 16) {
    allKeys.push({ name: `baEnc[${off}]`, data: basearrEncrypt.slice(off, off + 16) });
  }

  // dec17 切片
  for (let off = 0; off + 16 <= dec17.length; off += 16) {
    allKeys.push({ name: `dec17[${off}]`, data: dec17.slice(off, off + 16) });
  }

  // xored 切片
  for (let off = 0; off + 16 <= xored.length; off += 16) {
    allKeys.push({ name: `xored[${off}]`, data: xored.slice(off, off + 16) });
  }

  // cd keys
  for (let ki = 0; ki < gv.keys.length; ki++) {
    if (gv.keys[ki] && gv.keys[ki].length >= 16) {
      allKeys.push({ name: `cd[${ki}]`, data: gv.keys[ki].slice(0, 16) });
    }
  }

  console.log(`\nTotal candidate keys: ${allKeys.length}`);

  // 尝试所有 key + 所有模式
  let bestHit = { ratio: 0 };
  for (const keyInfo of allKeys) {
    const key = keyInfo.data;
    const modes = ['ecb', 'cbc', 'ctr', 'cfb', 'ofb'];

    for (const mode of modes) {
      // session
      let iv = null;
      if (mode === 'ecb') iv = null;
      else if (mode === 'cbc') iv = Buffer.alloc(16);
      else { iv = Buffer.alloc(16); Buffer.from(nonce).copy(iv); }

      const decS = aesDecrypt(sessionData, key, iv, mode);
      const rS = asciiRatio(decS);
      if (rS > bestHit.ratio) bestHit = { name: keyInfo.name, mode, target: 'session', ratio: rS };
      if (rS > 0.6) {
        console.log(`*** ${keyInfo.name} session ${mode}: ${(rS*100).toFixed(0)}% ***`);
        const text = decS.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
        if (text.length > 3) console.log(`  text: "${text.substring(0,50)}"`);
      }

      // request
      const decR = aesDecrypt(requestData, key, iv, mode);
      const rR = asciiRatio(decR);
      if (rR > bestHit.ratio) bestHit = { name: keyInfo.name, mode, target: 'request', ratio: rR };
      if (rR > 0.6) {
        console.log(`*** ${keyInfo.name} request ${mode}: ${(rR*100).toFixed(0)}% ***`);
        const text = decR.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
        if (text.length > 3) console.log(`  text: "${text.substring(0,50)}"`);
      }
    }

    // XOR
    const xoredS = sessionData.map((b, i) => b ^ key[i % key.length]);
    const rXS = asciiRatio(xoredS);
    if (rXS > bestHit.ratio) bestHit = { name: keyInfo.name, mode: 'xor', target: 'session', ratio: rXS };
    if (rXS > 0.6) {
      console.log(`*** ${keyInfo.name} session XOR: ${(rXS*100).toFixed(0)}% ***`);
      const text = xoredS.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
      if (text.length > 3) console.log(`  text: "${text.substring(0,50)}"`);
    }

    const xoredR = requestData.map((b, i) => b ^ key[i % key.length]);
    const rXR = asciiRatio(xoredR);
    if (rXR > 0.6) {
      console.log(`*** ${keyInfo.name} request XOR: ${(rXR*100).toFixed(0)}% ***`);
    }
  }

  // 也用管线 encryptMode2
  console.log('\n=== 管线 encryptMode2 ===');
  for (const keyInfo of allKeys) {
    for (const flag of [0, 1]) {
      try {
        const dec = encryptMode2([...sessionData], [...keyInfo.data], flag);
        if (dec && dec.length > 5) {
          const r = asciiRatio(dec);
          if (r > bestHit.ratio) bestHit = { name: keyInfo.name, mode: `pipe f${flag}`, target: 'session', ratio: r };
          if (r > 0.6) {
            console.log(`*** ${keyInfo.name} session pipe f${flag}: ${(r*100).toFixed(0)}% ***`);
            const text = dec.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
            if (text.length > 3) console.log(`  text: "${text.substring(0,50)}"`);
          }
        }
      } catch(e) {}

      try {
        const dec = encryptMode2([...requestData], [...keyInfo.data], flag);
        if (dec && dec.length > 5) {
          const r = asciiRatio(dec);
          if (r > 0.6) console.log(`*** ${keyInfo.name} request pipe f${flag}: ${(r*100).toFixed(0)}% ***`);
        }
      } catch(e) {}
    }
  }

  console.log(`\n=== Best hit ===`);
  console.log(JSON.stringify(bestHit));

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-nextarr-keys.json'),
    JSON.stringify({
      nsd, cd,
      queries: queries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      pCookie,
      browserKeys2,
      pipeKeys2: gv.keys[2],
      keys16: gv.keys[16], keys17: gv.keys[17],
      basearrEncrypt,
      dec17,
      bestHit,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('Saved');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
