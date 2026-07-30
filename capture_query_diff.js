// 捕获同会话的 keys + query 样本，用于差分分析
// 用管线获取 keys，用 Patchright 获取 query
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const https = require('https');

function httpGet(url) {
  return new Promise(r => {
    https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '' }));
  });
}

(async () => {
  // Step 1: 用管线获取 keys
  const { PmosXjClient } = require('./pmos_xj_client');
  const client = new PmosXjClient();
  const { nsd, cd, oCookie } = await client._fetchChallenge();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: client.baseUrl, hasDebug: false, keynameNum: 909, cp3Override: cp3 };

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(__dirname);
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
  fs.writeFileSync('/tmp/q-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/q-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv); require('@src/config/')(gv); gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder'); const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const runRet = coder.run(); runRet['$_ts'].cp[3] = cp3; gv.config.codemap = runRet.codemap;
  const ck = new Cookie(coder); const cookie = ck.run();

  // 收集所有 keys
  const allKeys = {};
  for (let i = 0; i < gv.keys.length; i++) {
    allKeys[i] = gv.keys[i] ? [...gv.keys[i]] : null;
  }
  const keys7 = gv.utils.ascii2string(gv.keys[7]);
  const pName = keys7.split(';')[5] + 'P';
  const oName = keys7.split(';')[5] + 'O';
  const qName = keys7.split(';')[1];

  console.log('Keys count:', gv.keys.length);
  console.log('keys16:', JSON.stringify(allKeys[16]));
  console.log('keys17:', JSON.stringify(allKeys[17]));
  console.log('keys2 len:', allKeys[2].length);
  console.log('qName:', qName);
  console.log('cookie:', cookie.substring(0, 30) + '...');

  // Step 2: 用 Patchright 加载页面，注入 cookie，捕获 query
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: client.ua });

  // 注入 cookie - 注意 domain 格式
  await context.addCookies([
    { name: oName, value: oCookie.split('=')[1], domain: 'pmos.xj.sgcc.com.cn', path: '/' },
    { name: pName, value: cookie, domain: 'pmos.xj.sgcc.com.cn', path: '/' },
  ]);

  // 捕获所有带 query 的请求
  const queries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) queries.push({
        method: req.method(),
        path: new URL(url).pathname,
        query: m[1],
        body: req.postData() || '',
      });
    }
  });

  const page = await context.newPage();
  // 首次加载获取 RS cookie
  await page.goto(client.baseUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(5000);
  // 清除请求列表，只保留 reload 后的
  queries.length = 0;
  // reload 触发 SPA API 调用（带 query）
  await page.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(15000);

  await browser.close();

  console.log('\nCaptured', queries.length, 'queries');
  if (queries.length === 0) { console.log('No queries'); process.exit(1); }

  // Step 3: 解码 query，做差分分析
  const basestr = gv.basestr;
  const idxmap = {};
  basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

  function decode(str) {
    const n = []; let i = 0;
    const f = Math.floor(str.length / 4);
    for (let g = 0; g < f; g++) {
      const a = idxmap[str[i]], b = idxmap[str[i+1]], c = idxmap[str[i+2]], d = idxmap[str[i+3]];
      i += 4; n.push((a<<2)|(b>>4), ((b&15)<<4)|(c>>2), ((c&3)<<6)|d);
    }
    const r = str.length - i;
    if (r === 2) n.push((idxmap[str[i]]<<2)|(idxmap[str[i+1]]>>4));
    else if (r === 3) n.push((idxmap[str[i]]<<2)|(idxmap[str[i+1]]>>4), ((idxmap[str[i+1]]&15)<<4)|(idxmap[str[i+2]]>>2));
    return n;
  }

  // 解码所有 query
  const decoded = queries.map(q => ({
    ...q,
    bytes: decode(q.query.startsWith('0') ? q.query.slice(1) : q.query),
  }));

  // 分析结构
  console.log('\n=== Query structure ===');
  decoded.forEach((q, i) => {
    const u32 = [];
    for (let j = 0; j + 3 < q.bytes.length; j += 4) {
      u32.push((q.bytes[j]<<24|q.bytes[j+1]<<16|q.bytes[j+2]<<8|q.bytes[j+3]) >>> 0);
    }
    q.u32 = u32;
    console.log('#' + i, q.method, q.path.split('/').pop(), 'bytes=' + q.bytes.length, 'u32=' + u32.length);
  });

  // 找固定/变化部分
  console.log('\n=== Fixed vs Variable (byte level) ===');
  const len = decoded[0].bytes.length;
  for (let i = 0; i < len; i++) {
    const vals = decoded.map(d => d.bytes[i]);
    const allSame = vals.every(v => v === vals[0]);
    if (!allSame) {
      // Show only variable positions
    }
  }
  const fixed = [];
  const variable = [];
  for (let i = 0; i < len; i++) {
    const vals = decoded.map(d => d.bytes[i]);
    if (vals.every(v => v === vals[0])) fixed.push(i);
    else variable.push(i);
  }
  console.log('Fixed positions (' + fixed.length + '):', fixed.length > 20 ? fixed.slice(0,10).join(',') + '...' + fixed.slice(-5).join(',') : fixed.join(','));
  console.log('Variable positions (' + variable.length + '):', variable.join(','));

  // 输出完整数据用于离线分析
  const output = {
    nsd, cd,
    keys: allKeys,
    basestr,
    qName, pName, oName,
    cookie,
    oCookie,
    queries: decoded.map(d => ({
      method: d.method,
      path: d.path,
      query: d.query,
      bytes: d.bytes,
      u32: d.u32,
      body: d.body,
    })),
  };

  fs.writeFileSync(path.join(__dirname, 'output/capture-20080/query-diff-data.json'), JSON.stringify(output, null, 2));
  console.log('\nSaved to output/capture-20080/query-diff-data.json');

  // 尝试用各种 key 解密 query
  console.log('\n=== Decryption attempts ===');
  const parser = require('@src/handler/parser/');
  const { encryptMode2 } = parser;

  const queryBytes = decoded[0].bytes;
  console.log('First query bytes (' + queryBytes.length + '):', queryBytes.slice(0, 20).join(',') + '...');

  // 尝试每个 key
  for (let ki = 0; ki < gv.keys.length; ki++) {
    const key = gv.keys[ki];
    if (!key || key.length < 8) continue;
    for (const flag of [0, 1]) {
      try {
        const dec = encryptMode2([...queryBytes], [...key], flag);
        if (dec.length > 5) {
          // 检查是否像有效数据（ASCII 或结构化）
          const ascii = dec.filter(b => b >= 32 && b <= 126).length;
          const ratio = ascii / dec.length;
          if (ratio > 0.5 || dec.length === queryBytes.length - 16) {
            console.log('  keys[' + ki + '] (len=' + key.length + ') flag=' + flag + ': ' + dec.length + 'B ascii=' + (ratio*100).toFixed(0) + '% head=[' + dec.slice(0, 10).join(',') + ']');
          }
        }
      } catch(e) {}
    }
  }

  // 也尝试 XOR
  console.log('\n=== XOR attempts ===');
  for (let ki = 0; ki < gv.keys.length; ki++) {
    const key = gv.keys[ki];
    if (!key || key.length < 4) continue;
    const xored = queryBytes.map((b, i) => b ^ key[i % key.length]);
    const ascii = xored.filter(b => b >= 32 && b <= 126).length;
    const ratio = ascii / xored.length;
    if (ratio > 0.5) {
      console.log('  XOR keys[' + ki + '] (len=' + key.length + '): ascii=' + (ratio*100).toFixed(0) + '% head=[' + xored.slice(0, 15).join(',') + ']');
      // 尝试解读为字符串
      const str = xored.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
      if (str.length > 5) console.log('    text:', str.substring(0, 50));
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
