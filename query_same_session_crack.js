/**
 * query_same_session_crack.js — 同会话捕获 VM trace keys + 浏览器 query
 *
 * 核心问题：之前 VM trace 和 query 来自不同会话（不同 nsd/cd），key 不匹配
 * 解决方案：
 * 1. 浏览器通过代理加载真实页面，捕获 nsd/cd + query
 * 2. 沙箱用同一 nsd/cd 跑 VM trace，提取所有 key
 * 3. 用沙箱 key 解密浏览器 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');

// ---- 工具函数 ----
function decodeQuery(queryStr) {
  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  const idxmap = {};
  basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
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

// ---- Step 1: 浏览器捕获 nsd/cd + query ----
async function browserCapture() {
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  let browserNsd = null, browserCd = null;
  const queries = [];

  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) queries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  const page = await context.newPage();
  page.on('response', async resp => {
    if (resp.status() === 412 && !browserNsd) {
      const body = await resp.text().catch(() => '');
      const m = body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (m) { browserNsd = +m[1]; browserCd = m[2]; }
    }
  });

  console.log('  浏览器加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log(`  nsd=${browserNsd}, reload...`);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  await browser.close();
  return { nsd: browserNsd, cd: browserCd, queries };
}

// ---- Step 2: 沙箱 VM trace（用浏览器 nsd/cd）----
async function sandboxTrace(nsd, cd) {
  // 获取 O cookie
  const ch = await httpGet(TARGET, { userAgent: 'Mozilla/5.0' });
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  // 管线 cookie
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  await client.init();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;

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
  if (!trampSrc) return { keys: [] };

  // 提取变量名
  const idx0 = trampSrc.indexOf(',0,');
  let p = idx0; while (p > 0 && trampSrc[p] !== '(') p--;
  let fnStart = p - 1; while (fnStart >= 0 && /[_$a-zA-Z0-9]/.test(trampSrc[fnStart])) fnStart--;
  const dispName = trampSrc.substring(fnStart + 1, p);
  const ctxVar = trampSrc.substring(p + 1, idx0);
  const bcProp = trampSrc.substring(idx0).match(/\.([^( ]+)\.length/)[1];
  const argsVar = trampSrc.substring(idx0).match(/length,([^( )]+)\)/)[1];

  // Pass 2: patch
  const callPattern = `${dispName}(${ctxVar},0,${ctxVar}.${bcProp}.length,${argsVar})`;
  const callPos = dynCode.indexOf(callPattern);
  const afterLog = `,(window.__vmLog=window.__vmLog||[]).push({a5:typeof ${argsVar}[5]==='undefined'?'undef':typeof ${argsVar}[5]==='string'?${argsVar}[5].substring(0,200):String(${argsVar}[5]).substring(0,200),a4:typeof ${argsVar}[4]==='undefined'?'undef':String(${argsVar}[4])})`;
  let patched = dynCode.substring(0, callPos) + callPattern + afterLog + dynCode.substring(callPos + callPattern.length);

  // Pass 3: 执行
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

  vm.runInContext('window.__vmLog = []', env2.proxied);

  // 触发 trampoline
  const xhr2 = new RSXHR2();
  RSXHR2.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true; }
  let tramp2 = null;
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; } }

  let keyArrays = [];
  if (tramp2) {
    tramp2.call(xhr2, '{}');
    const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env2.proxied);
    if (logLen > 0) {
      const log = JSON.parse(vm.runInContext('JSON.stringify(window.__vmLog)', env2.proxied));
      for (let i = 0; i < log.length; i++) {
        const a5 = log[i].a5;
        if (!a5 || a5 === 'undef' || a5.indexOf(',') < 0) continue;
        const parts = a5.split(',');
        const bytes = [];
        let valid = true;
        for (const part of parts) {
          const n = parseInt(part.trim());
          if (isNaN(n) || n < 0 || n > 255) { valid = false; break; }
          bytes.push(n);
        }
        if (valid && bytes.length >= 8) keyArrays.push({ idx: i, data: bytes });
      }
    }
  }
  return { keys: keyArrays };
}

// ---- 主流程 ----
(async () => {
  console.log('=== 同会话破解 query ===\n');

  // Step 1: 浏览器捕获
  console.log('[Step 1] 浏览器捕获 nsd/cd + query...');
  const { nsd, cd, queries } = await browserCapture();
  console.log(`  nsd=${nsd}, queries=${queries.length}`);
  if (queries.length === 0) { console.log('No queries captured'); process.exit(1); }

  // Step 2: 沙箱 VM trace
  console.log('\n[Step 2] 沙箱 VM trace...');
  const { keys } = await sandboxTrace(nsd, cd);
  console.log(`  Keys: ${keys.length}`);
  keys.forEach(k => console.log(`    [${k.idx}] len=${k.data.length} data=[${k.data.slice(0, 10).join(',')}...]`));

  // Step 3: 用沙箱 key 解密浏览器 query
  console.log('\n[Step 3] 解密 query...');
  const queryBytes = decodeQuery(queries[0].query);
  const sessionData = queryBytes.slice(7, 55);
  const requestData = queryBytes.slice(56, 88);
  const nonce = queryBytes.slice(0, 4);

  console.log(`  Query: ${queries[0].query.substring(0, 40)}... (${queryBytes.length} bytes)`);

  let hits = [];
  for (const keyInfo of keys) {
    const key = keyInfo.data;
    if (key.length < 16) continue;
    const key16 = key.slice(0, 16);
    const nonceIv = [...nonce, ...new Array(12).fill(0)];

    const tests = [
      { name: 'session f0', data: sessionData, iv: new Array(16).fill(0), key: key16 },
      { name: 'session f1', data: sessionData.slice(16), iv: sessionData.slice(0, 16), key: key16 },
      { name: 'session nonce', data: sessionData, iv: nonceIv, key: key16 },
      { name: 'request f0', data: requestData, iv: new Array(16).fill(0), key: key16 },
      { name: 'request f1', data: requestData.slice(16), iv: requestData.slice(0, 16), key: key16 },
      { name: 'request nonce', data: requestData, iv: nonceIv, key: key16 },
    ];

    if (key.length >= 32) {
      const key32 = key.slice(0, 32);
      tests.push({ name: 'session 256', data: sessionData, iv: new Array(16).fill(0), key: key32 });
      tests.push({ name: 'request 256', data: requestData, iv: new Array(16).fill(0), key: key32 });
    }

    for (const t of tests) {
      const dec = aesDecrypt(t.data, t.key, t.iv);
      const r = asciiRatio(dec);
      if (r > 0.5) {
        hits.push({ idx: keyInfo.idx, name: t.name, ratio: r, key: t.key, dec });
        console.log(`\n  *** HIT [${keyInfo.idx}] ${t.name}: ${(r*100).toFixed(0)}% ***`);
        console.log(`  key=[${t.key.join(',')}]`);
        console.log(`  dec=[${dec.slice(0, 16).join(',')}]`);
        const text = dec.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
        if (text.length > 3) console.log(`  text: "${text.substring(0, 50)}"`);
      }
    }

    // XOR
    for (const [name, data] of [['session XOR', sessionData], ['request XOR', requestData]]) {
      const xored = data.map((b, i) => b ^ key16[i % key16.length]);
      const r = asciiRatio(xored);
      if (r > 0.6) {
        hits.push({ idx: keyInfo.idx, name, ratio: r, key: key16, dec: xored });
        console.log(`\n  *** XOR HIT [${keyInfo.idx}] ${name}: ${(r*100).toFixed(0)}% ***`);
        const text = xored.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
        if (text.length > 3) console.log(`  text: "${text.substring(0, 50)}"`);
      }
    }
  }

  // 组合 key
  console.log('\n=== 组合 key ===');
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i === j || keys[i].data.length < 16 || keys[j].data.length < 16) continue;
      const key32 = [...keys[i].data.slice(0, 16), ...keys[j].data.slice(0, 16)];
      for (const [name, data] of [['session combo', sessionData], ['request combo', requestData]]) {
        const dec = aesDecrypt(data, key32, new Array(16).fill(0));
        const r = asciiRatio(dec);
        if (r > 0.6) {
          console.log(`  *** COMBO [${i}+${j}] ${name}: ${(r*100).toFixed(0)}% ***`);
          const text = dec.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
          if (text.length > 3) console.log(`  text: "${text.substring(0, 50)}"`);
        }
      }
    }
  }

  if (hits.length === 0) {
    console.log('\n无解密命中');
    console.log('可能原因：');
    console.log('1. query 加密不是标准 AES-CBC');
    console.log('2. query key 不在 VM trace args[5] 中');
    console.log('3. query 用 RS 自定义加密（encryptMode1）');
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-same-session-crack.json'),
    JSON.stringify({
      nsd, cd,
      queries: queries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      keys: keys.map(k => ({ idx: k.idx, data: k.data })),
      hits: hits.map(h => ({ idx: h.idx, name: h.name, ratio: h.ratio })),
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('\n结果已保存');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
