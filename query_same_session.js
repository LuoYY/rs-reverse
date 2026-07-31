/**
 * query_same_session.js — 同会话捕获 VM trace + query
 *
 * 关键发现：VM trace entry [109] 包含一个 16 字节 key
 * 不在 cd keys 中，可能是 query 专用 key
 *
 * 但 VM trace 和 query 数据来自不同会话
 * 需要在同一会话中同时捕获两者
 *
 * 方案：
 * 1. 获取挑战页（nsd/cd）
 * 2. 用管线生成 cookie（同一 nsd/cd）
 * 3. 用沙箱跑 RS 动态代码（同一 nsd/cd），patch 捕获 VM trace
 * 4. 用浏览器加载页面（注入管线 cookie），捕获 query
 * 5. 用 VM trace 中的 key 解密 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');

(async () => {
  console.log('=== 同会话捕获 VM trace + query ===\n');

  // Step 1: 获取挑战页
  console.log('[Step 1] 获取挑战页...');
  const ch = await httpGet(TARGET, { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  console.log(`nsd=${nsd}, cd_len=${cd.length}`);

  // Step 2: 管线生成 cookie
  console.log('\n[Step 2] 管线生成 cookie...');
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  // 不调用 init（它会重新获取挑战页），直接用已有的 nsd/cd
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;
  console.log(`cookie: ${pName}=${pCookie.substring(0, 30)}... (${pCookie.length} chars)`);

  // Step 3: 沙箱 VM trace
  console.log('\n[Step 3] 沙箱 VM trace...');
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

  // Pass 1: 获取 trampoline
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
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

  // Pass 2: patch 动态代码
  const callPattern = `${dispName}(${ctxVar},0,${ctxVar}.${bcProp}.length,${argsVar})`;
  const callPos = dynCode.indexOf(callPattern);
  const beforeLog = `(window.__vmLog=window.__vmLog||[]).push({t:'b'}),`;
  const afterLog = `,(window.__vmLog=window.__vmLog||[]).push({t:'a',a5:typeof ${argsVar}[5]==='undefined'?'undef':typeof ${argsVar}[5]==='string'?${argsVar}[5].substring(0,200):String(${argsVar}[5]).substring(0,200),a4:typeof ${argsVar}[4]==='undefined'?'undef':String(${argsVar}[4])})`;
  let patched = dynCode.substring(0, callPos) + beforeLog + callPattern + afterLog + dynCode.substring(callPos + callPattern.length);

  // ctx dump
  const ctxSearch = `,0,${ctxVar}.`;
  const ctxPos = patched.indexOf(ctxSearch, callPos);
  if (ctxPos >= 0) {
    let pp = ctxPos; while (pp > 0 && patched[pp] !== '(') pp--;
    const cs = pp + 1, ce = cs + ctxVar.length;
    if (patched.substring(cs, ce) === ctxVar) {
      patched = patched.substring(0, cs) + `(window.__vmCtx=${ctxVar})` + patched.substring(ce);
    }
  }

  // Pass 3: 执行 patched
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
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

  // 清空 log
  vm.runInContext('window.__vmLog = []', env2.proxied);

  // 触发 trampoline
  console.log('触发 trampoline...');
  const xhr2 = new RSXHR2();
  RSXHR2.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true; }
  let tramp2 = null;
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; } }

  let vmTraceKeys = [];
  if (tramp2) {
    const result = tramp2.call(xhr2, '{}');
    console.log(`Trampoline result: "${String(result).substring(0, 40)}"`);

    // 提取 VM trace 中的所有字节数组
    const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env2.proxied);
    console.log(`VM log entries: ${logLen}`);

    if (logLen > 0) {
      const fullLog = JSON.parse(vm.runInContext('JSON.stringify(window.__vmLog)', env2.proxied));

      // 提取字节数组
      for (const entry of fullLog) {
        if (entry.t !== 'a' || !entry.a5 || entry.a5 === 'undef') continue;
        if (entry.a5.indexOf(',') < 0) continue;
        const parts = entry.a5.split(',');
        const bytes = [];
        let valid = true;
        for (const part of parts) {
          const n = parseInt(part.trim());
          if (isNaN(n) || n < 0 || n > 255) { valid = false; break; }
          bytes.push(n);
        }
        if (valid && bytes.length >= 8) {
          vmTraceKeys.push({ idx: fullLog.indexOf(entry), data: bytes, len: bytes.length });
        }
      }

      console.log(`\nVM trace byte arrays: ${vmTraceKeys.length}`);
      vmTraceKeys.forEach(a => console.log(`  [${a.idx}] len=${a.len} data=[${a.data.join(',')}]`));
    }
  }

  // Step 4: 浏览器捕获 query（同一 nsd/cd）
  console.log('\n[Step 4] 浏览器捕获 query...');
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // 注入管线 cookie
  await context.addCookies([
    { name: oCookie.split('=')[0], value: oCookie.split('=')[1], domain: 'pmos.xj.sgcc.com.cn', path: '/' },
    { name: pName, value: pCookie, domain: 'pmos.xj.sgcc.com.cn', path: '/' },
  ]);

  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  const page = await context.newPage();
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(15000);

  await browser.close();

  console.log(`Captured queries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 3).forEach((q, i) => console.log(`  [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`));

  if (capturedQueries.length === 0) {
    console.log('\n浏览器未捕获 query（网络慢或 RS 检测到注入 cookie）');
    console.log('但 VM trace 中的 key 已捕获，可用于后续分析');
    process.exit(0);
  }

  // Step 5: 用 VM trace key 解密 query
  console.log('\n[Step 5] 用 VM trace key 解密 query...');

  // 解码 query
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

  function asciiRatio(bytes) {
    if (!bytes) return 0;
    return bytes.filter(b => b >= 32 && b <= 126).length / bytes.length;
  }

  const queryBytes = decodeQuery(capturedQueries[0].query);
  const sessionData = queryBytes.slice(7, 55);
  const requestData = queryBytes.slice(56, 88);
  const nonce = queryBytes.slice(0, 4);

  console.log(`Query decoded: ${queryBytes.length} bytes`);
  console.log(`Session data: ${sessionData.length} bytes`);
  console.log(`Request data: ${requestData.length} bytes`);

  // 用每个 VM trace key 尝试解密
  let hits = [];
  for (const a of vmTraceKeys) {
    if (a.len >= 16) {
      const key16 = a.data.slice(0, 16);
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
        const dec = aesDecrypt(t.data, key16, t.iv);
        const r = asciiRatio(dec);
        if (r > 0.5) {
          hits.push({ idx: a.idx, test: t.name, ratio: r, key: key16, dec });
          console.log(`*** HIT [${a.idx}] ${t.name}: ${(r*100).toFixed(0)}% ***`);
          console.log(`  key=[${key16.join(',')}]`);
          console.log(`  dec=[${dec.slice(0, 16).join(',')}]`);
          const text = dec.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
          if (text.length > 3) console.log(`  text: ${text.substring(0, 50)}`);
        }
      }

      // 也尝试 XOR
      const xoredS = sessionData.map((b, i) => b ^ key16[i % 16]);
      const rS = asciiRatio(xoredS);
      if (rS > 0.6) {
        hits.push({ idx: a.idx, test: 'session XOR', ratio: rS, key: key16, dec: xoredS });
        console.log(`*** XOR HIT [${a.idx}] session: ${(rS*100).toFixed(0)}% ***`);
      }
      const xoredR = requestData.map((b, i) => b ^ key16[i % 16]);
      const rR = asciiRatio(xoredR);
      if (rR > 0.6) {
        hits.push({ idx: a.idx, test: 'request XOR', ratio: rR, key: key16, dec: xoredR });
        console.log(`*** XOR HIT [${a.idx}] request: ${(rR*100).toFixed(0)}% ***`);
      }
    }
  }

  if (hits.length === 0) {
    console.log('\n无解密命中（可能需要浏览器同会话的 key）');
    console.log('注意：VM trace 来自沙箱（沙箱 cookie 被 RS 覆盖），浏览器用管线 cookie');
    console.log('如果 RS 为每个 cookie 生成不同 key，则沙箱 key ≠ 浏览器 key');
  }

  // 保存结果
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-same-session.json'),
    JSON.stringify({
      nsd, cd,
      vmTraceKeys: vmTraceKeys.map(a => ({ idx: a.idx, data: a.data })),
      capturedQueries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      hits: hits.map(h => ({ idx: h.idx, test: h.test, ratio: h.ratio })),
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('\n结果已保存');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
