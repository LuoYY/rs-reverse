/**
 * query_cross_validate.js — 交叉验证：沙箱 key 解密浏览器 query
 *
 * 1. 浏览器自己加载页面（不注入 cookie），捕获 query + nsd/cd
 * 2. 用同一 nsd/cd 在沙箱中跑 VM trace，提取 entry [109] key
 * 3. 用沙箱 key 解密浏览器 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

(async () => {
  console.log('=== 交叉验证：沙箱 key 解密浏览器 query ===\n');

  // Step 1: 浏览器加载页面，捕获 nsd/cd + query
  console.log('[Step 1] 浏览器加载页面...');
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  let browserNsd = null, browserCd = null;
  const capturedQueries = [];

  // 捕获首次 412 页面的 nsd/cd
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  // 用 page.on('response') 捕获 412 页面内容
  // 捕获所有请求（调试用）
  const allRequests = [];
  context.on('request', req => {
    const url = req.url();
    if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('.woff') && !url.includes('favicon')) {
      allRequests.push({ m: req.method(), u: url.substring(0, 100) });
    }
  });

  const page = await context.newPage();
  let firstResponse = null;
  page.on('response', async resp => {
    if (resp.status() === 412 && !firstResponse) {
      firstResponse = await resp.text().catch(() => '');
      const m = firstResponse.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (m) { browserNsd = +m[1]; browserCd = m[2]; }
    }
  });

  console.log('  导航（通过代理）...');
  await page.goto(TARGET, { timeout: 120000 }).catch(e => console.log('  goto:', e.message.substring(0, 40)));
  await page.waitForTimeout(5000);

  console.log(`  首次 nsd: ${browserNsd}`);

  // 第二次加载（带 cookie）
  console.log('  Reload...');
  await page.reload({ timeout: 120000 }).catch(e => console.log('  reload:', e.message.substring(0, 40)));
  await page.waitForTimeout(15000);

  console.log(`  总请求: ${allRequests.length}`);
  allRequests.slice(0, 10).forEach((r, i) => console.log(`    [${i}] ${r.m} ${r.u}`));
  const queryReqs = allRequests.filter(r => r.u.includes('r20SZOQm='));
  console.log(`  Query 请求: ${queryReqs.length}`);

  console.log(`  Queries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 3).forEach((q, i) => console.log(`    [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`));

  // 获取 cookies
  const cookies = await context.cookies();
  await browser.close();

  if (!browserNsd || !browserCd) {
    console.log('\n未捕获 nsd/cd');
    process.exit(1);
  }

  if (capturedQueries.length === 0) {
    console.log('\n未捕获 query');
    process.exit(1);
  }

  console.log(`\n浏览器 nsd=${browserNsd}, cd_len=${browserCd.length}`);

  // Step 2: 沙箱 VM trace（用浏览器 nsd/cd）
  console.log('\n[Step 2] 沙箱 VM trace...');
  const { httpGet } = require('./proxy_http');

  // 获取同一 nsd/cd 的 O cookie（需要新请求，因为浏览器的 O cookie 可能不同）
  // 实际上 nsd/cd 每次请求都变，我们需要用浏览器捕获的 nsd/cd
  // 但沙箱需要 O cookie... O cookie 是服务器设置的，与 nsd/cd 无关

  // 用浏览器的 nsd/cd，不需要重新获取挑战页
  // O cookie 用浏览器捕获的
  const oCookieVal = cookies.find(c => c.name.endsWith('O'))?.value || '';
  const oCookieName = cookies.find(c => c.name.endsWith('O'))?.name || 'aoU85Lxl9xxNO';
  const oCookie = `${oCookieName}=${oCookieVal}`;

  // 用管线生成 cookie（用浏览器的 nsd/cd）
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  const cp3 = client._extractCp3(browserNsd, browserCd);
  const ts = { nsd: browserNsd, cd: browserCd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;

  // 沙箱 trace
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

  // Pass 1: trampoline
  const env1 = buildEnv({ nsd: browserNsd, cd: browserCd }, { seedCookie });
  env1.sandbox.document = new Proxy(env1.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR() {}
  RSXHR.prototype = {
    open: function(m, u) { this._url = String(u); this.readyState = 1; },
    send: function() { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState: 0, status: 0, responseText: '', responseURL: '',
  };
  env1.sandbox.XMLHttpRequest = RSXHR;

  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));

  const xhr1 = new RSXHR();
  RSXHR.prototype.open.call(xhr1, 'POST', '/test', true);
  let trampSrc = null;
  for (const k in xhr1) { if (k.startsWith('_$') && typeof xhr1[k] === 'function') { trampSrc = xhr1[k].toString(); break; } }
  if (!trampSrc) { console.log('No trampoline'); process.exit(1); }

  // 提取变量名
  const idx0 = trampSrc.indexOf(',0,');
  let p = idx0; while (p > 0 && trampSrc[p] !== '(') p--;
  let fnStart = p - 1; while (fnStart >= 0 && /[_$a-zA-Z0-9]/.test(trampSrc[fnStart])) fnStart--;
  const dispName = trampSrc.substring(fnStart + 1, p);
  const ctxVar = trampSrc.substring(p + 1, idx0);
  const propMatch = trampSrc.substring(idx0).match(/\.([^( ]+)\.length/);
  const bcProp = propMatch ? propMatch[1] : null;
  const argsMatch = trampSrc.substring(idx0).match(/length,([^( )]+)\)/);
  const argsVar = argsMatch ? argsMatch[1] : null;

  // Pass 2: patch
  const callPattern = `${dispName}(${ctxVar},0,${ctxVar}.${bcProp}.length,${argsVar})`;
  const callPos = dynCode.indexOf(callPattern);
  const afterLog = `,(window.__vmLog=window.__vmLog||[]).push({t:'a',a5:typeof ${argsVar}[5]==='undefined'?'undef':typeof ${argsVar}[5]==='string'?${argsVar}[5].substring(0,200):String(${argsVar}[5]).substring(0,200),a4:typeof ${argsVar}[4]==='undefined'?'undef':String(${argsVar}[4])})`;
  let patched = dynCode.substring(0, callPos) + callPattern + afterLog + dynCode.substring(callPos + callPattern.length);

  // Pass 3: 执行
  const env2 = buildEnv({ nsd: browserNsd, cd: browserCd }, { seedCookie });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let patched2 = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !patched2) { patched2 = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));

  vm.runInContext('window.__vmLog = []', env2.proxied);

  // 触发 trampoline
  const xhr2 = new RSXHR2();
  RSXHR2.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true; }
  let tramp2 = null;
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; } }

  let vmTraceKeys = [];
  if (tramp2) {
    tramp2.call(xhr2, '{}');
    const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env2.proxied);
    console.log(`VM log: ${logLen} entries`);

    if (logLen > 0) {
      const fullLog = JSON.parse(vm.runInContext('JSON.stringify(window.__vmLog)', env2.proxied));
      for (const entry of fullLog) {
        if (entry.t !== 'a' || !entry.a5 || entry.a5 === 'undef' || entry.a5.indexOf(',') < 0) continue;
        const parts = entry.a5.split(',');
        const bytes = [];
        let valid = true;
        for (const part of parts) {
          const n = parseInt(part.trim());
          if (isNaN(n) || n < 0 || n > 255) { valid = false; break; }
          bytes.push(n);
        }
        if (valid && bytes.length >= 8) vmTraceKeys.push({ idx: fullLog.indexOf(entry), data: bytes, len: bytes.length });
      }
      console.log(`VM trace keys: ${vmTraceKeys.length}`);
      vmTraceKeys.forEach(a => console.log(`  [${a.idx}] len=${a.len} data=[${a.data.join(',')}]`));
    }
  }

  // Step 3: 用沙箱 key 解密浏览器 query
  console.log('\n[Step 3] 用沙箱 key 解密浏览器 query...');

  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  const idxmap = {};
  basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

  function decodeQuery(queryStr) {
    const payload = queryStr.startsWith('0') ? queryStr.slice(1) : queryStr;
    const bytes = [];
    let i = 0;
    const full = Math.floor(payload.length / 4);
    for (let g = 0; g < full; g++) {
      const c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
      i += 4; bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
    }
    const rem = payload.length - i;
    if (rem === 2) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
    else if (rem === 3) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4), ((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));
    return bytes;
  }

  function aesDecrypt(data, key, iv) {
    try {
      const dec = crypto.createDecipheriv('aes-' + (key.length * 8) + '-cbc', Buffer.from(key), Buffer.from(iv));
      dec.setAutoPadding(false);
      return Array.from(Buffer.concat([dec.update(Buffer.from(data)), dec.final()]));
    } catch (e) { return null; }
  }

  function asciiRatio(bytes) { if (!bytes) return 0; return bytes.filter(b => b >= 32 && b <= 126).length / bytes.length; }

  // 解码第一个 query
  const queryBytes = decodeQuery(capturedQueries[0].query);
  const sessionData = queryBytes.slice(7, 55);
  const requestData = queryBytes.slice(56, 88);
  const nonce = queryBytes.slice(0, 4);

  console.log(`Query: ${capturedQueries[0].query.substring(0, 40)}... (${queryBytes.length} bytes)`);

  // 尝试每个 key
  let hits = [];
  for (const a of vmTraceKeys) {
    if (a.len < 16) continue;
    const key = a.data.slice(0, 16);
    const nonceIv = [...nonce, ...new Array(12).fill(0)];

    const tests = [
      { name: 'session f0', data: sessionData, iv: new Array(16).fill(0) },
      { name: 'session f1', data: sessionData.slice(16), iv: sessionData.slice(0, 16) },
      { name: 'session nonce', data: sessionData, iv: nonceIv },
      { name: 'request f0', data: requestData, iv: new Array(16).fill(0) },
      { name: 'request f1', data: requestData.slice(16), iv: requestData.slice(0, 16) },
      { name: 'request nonce', data: requestData, iv: nonceIv },
    ];

    for (const t of tests) {
      const dec = aesDecrypt(t.data, key, t.iv);
      const r = asciiRatio(dec);
      if (r > 0.5) {
        hits.push({ idx: a.idx, name: t.name, ratio: r, key, dec });
        console.log(`\n*** HIT [${a.idx}] ${t.name}: ${(r*100).toFixed(0)}% ***`);
        console.log(`  key=[${key.join(',')}]`);
        console.log(`  dec=[${dec.slice(0, 16).join(',')}]`);
        const text = dec.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
        if (text.length > 3) console.log(`  text: "${text.substring(0, 50)}"`);
      }
    }

    // XOR
    for (const [name, data] of [['session XOR', sessionData], ['request XOR', requestData]]) {
      const xored = data.map((b, i) => b ^ key[i % key.length]);
      const r = asciiRatio(xored);
      if (r > 0.6) {
        hits.push({ idx: a.idx, name, ratio: r, key, dec: xored });
        console.log(`\n*** XOR HIT [${a.idx}] ${name}: ${(r*100).toFixed(0)}% ***`);
      }
    }

    // 也尝试 32 字节 key
    if (a.len >= 32) {
      const key32 = a.data.slice(0, 32);
      for (const [name, data] of [['session 256', sessionData], ['request 256', requestData]]) {
        const dec = aesDecrypt(data, key32, new Array(16).fill(0));
        const r = asciiRatio(dec);
        if (r > 0.5) {
          hits.push({ idx: a.idx, name, ratio: r, key: key32, dec });
          console.log(`\n*** HIT [${a.idx}] ${name}: ${(r*100).toFixed(0)}% ***`);
        }
      }
    }
  }

  // 组合 key
  for (let i = 0; i < vmTraceKeys.length; i++) {
    for (let j = 0; j < vmTraceKeys.length; j++) {
      if (i === j || vmTraceKeys[i].len < 16 || vmTraceKeys[j].len < 16) continue;
      const key32 = [...vmTraceKeys[i].data.slice(0, 16), ...vmTraceKeys[j].data.slice(0, 16)];
      const dec = aesDecrypt(sessionData, key32, new Array(16).fill(0));
      const r = asciiRatio(dec);
      if (r > 0.6) {
        hits.push({ idx: `${i}+${j}`, name: 'session 256 combo', ratio: r, key: key32, dec });
        console.log(`\n*** COMBO HIT [${i}+${j}] session: ${(r*100).toFixed(0)}% ***`);
      }
      const dec2 = aesDecrypt(requestData, key32, new Array(16).fill(0));
      const r2 = asciiRatio(dec2);
      if (r2 > 0.6) {
        hits.push({ idx: `${i}+${j}`, name: 'request 256 combo', ratio: r2, key: key32, dec: dec2 });
        console.log(`\n*** COMBO HIT [${i}+${j}] request: ${(r2*100).toFixed(0)}% ***`);
      }
    }
  }

  if (hits.length === 0) {
    console.log('\n无解密命中');
    console.log('可能原因：');
    console.log('1. 浏览器 nsd/cd 与沙箱 nsd/cd 不同（每次请求变）');
    console.log('2. query key 不是简单的 AES key');
    console.log('3. query 加密不是标准 AES-CBC');
  } else {
    console.log(`\n=== ${hits.length} 个命中 ===`);
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-cross-validate.json'),
    JSON.stringify({
      browserNsd, browserCd,
      vmTraceKeys: vmTraceKeys.map(a => ({ idx: a.idx, data: a.data })),
      capturedQueries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      hits: hits.map(h => ({ idx: h.idx, name: h.name, ratio: h.ratio, key: h.key, dec: h.dec.slice(0, 20) })),
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('结果已保存');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
