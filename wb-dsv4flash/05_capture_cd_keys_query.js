/**
 * 05_capture_cd_keys_query.js
 *
 * 一次会话内同时捕获：
 *   1. 第一个 412 挑战页 nsd/cd
 *   2. 浏览器闭包 keys30（45 个 keys，含 keys2/16/17）
 *   3. query 值（Network）
 *   4. [165]/[151] 加密调用（按实际索引动态识别，仅包装少量候选）
 *
 * 离线验证：
 *   - 管线(cd) keys2 == 浏览器 keys30[2] == session_data ？
 *   - query 加密密钥是什么
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

function decodeQuery(query) {
  const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const payload = query.startsWith('0') ? query.slice(1) : query;
  const idxmap = {};
  for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 1 < payload.length) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]];
    bytes.push((c0 << 2) | (c1 >> 4));
  }
  return bytes;
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  console.log('[1] 启动浏览器...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const challenges = [];
  page.on('response', async (resp) => {
    if (challenges.length > 0) return;
    if (resp.status() === 412) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenges.push({ nsd: nsdM ? parseInt(nsdM[1]) : null, cd: cdM ? cdM[1] : null, url: resp.url(), ts: Date.now() });
        console.log('[challenge] nsd=' + challenges[0].nsd + ' cdLen=' + (challenges[0].cd || '').length + ' url=' + challenges[0].url);
      } catch (e) {}
    }
  });

  const queryRequests = [];
  cdp.on('Network.requestWillBeSent', (params) => {
    const m = params.request.url.match(/r20SZOQm=([^&]+)/);
    if (m) queryRequests.push({ path: params.request.url.split('?')[0], query: m[1], method: params.request.method, ts: Date.now() });
  });

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  const test = await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("GET","/px-gateway/GatewayConfig/security",false);x.send();return x.status})()',
    returnByValue: true,
  });
  console.log('[3] 验证 GET:', test.result.value);

  // ---- 定位 global 数组 ----
  console.log('\n[4] 定位 global 数组...');
  const sendSrcR = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  const sendSrc = sendSrcR.result.value;
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];

  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });

  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }

  const dSrcR = await cdp.send('Runtime.callFunctionOn', {
    objectId: dId,
    functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
    returnByValue: true,
  });
  const dSrc = dSrcR.result.value;
  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  if (!globalName) { console.log('  ❌ 未找到 global'); await browser.close(); return; }

  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });

  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId; }
  }
  if (!globalId) { console.log('  ❌ 未找到 global 数组'); await browser.close(); return; }

  // ---- 提取 keys30 ----
  const keys30R = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var idx30 = this[30];
      if (!Array.isArray(idx30)) return 'null';
      return JSON.stringify(idx30.map(function(k) {
        if (Array.isArray(k)) return { t: 'arr', len: k.length, d: k.slice(0, 64) };
        return { t: typeof k, v: typeof k === 'string' ? k.substring(0, 200) : k };
      }));
    }`,
    returnByValue: true,
  });
  const keys30 = JSON.parse(keys30R.result.value);
  console.log('  keys30:', keys30.length, '项');
  if (keys30[2] && keys30[2].t === 'arr') {
    console.log('  keys30[2]:', keys30[2].d.map(b => b.toString(16).padStart(2, '0')).join(' '));
  }

  // ---- 识别并包装加密函数（少量候选，避免破坏）----
  console.log('\n[5] 识别加密函数候选...');
  const candR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var out = [];
      for (var i = 140; i < 175; i++) {
        if (typeof this[i] !== 'function') continue;
        var src = Function.prototype.toString.call(this[i]);
        out.push({ idx: i, len: src.length, preview: src.substring(0, 120) });
      }
      return JSON.stringify(out);
    }`,
    returnByValue: true,
  });
  const cands = JSON.parse(candR.result.value);
  for (const c of cands) console.log('  [' + c.idx + '] len=' + c.len, c.preview.replace(/\n/g, ' ').substring(0, 90));

  // 包装 idx 151/165 和所有 len>400 的候选
  const wrapTargets = [151, 165, ...cands.filter(c => c.len > 400).map(c => c.idx)];
  console.log('  包装目标:', wrapTargets.join(','));
  const wrapR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(targets) {
      var self = this;
      var log = [];
      this.__encLog = log;
      var INTERESTING = [16, 21, 24, 32, 48, 88];
      for (var t = 0; t < targets.length; t++) {
        var idx = targets[t];
        if (typeof this[idx] !== 'function') continue;
        (function(idx, orig) {
          self[idx] = function() {
            var entry = {
              idx: idx,
              time: Date.now(),
              args: Array.from(arguments).map(function(x) {
                if (Array.isArray(x)) return 'arr[' + x.length + ']';
                if (typeof x === 'string') return '"' + x.substring(0, 12) + '"';
                return typeof x;
              }),
            };
            for (var a = 0; a < arguments.length; a++) {
              if (Array.isArray(arguments[a]) && INTERESTING.indexOf(arguments[a].length) >= 0) {
                entry['arg' + a] = arguments[a].slice(0, 48);
              }
            }
            var result = orig.apply(this, arguments);
            if (Array.isArray(result)) {
              entry.resultType = 'arr[' + result.length + ']';
              if (INTERESTING.indexOf(result.length) >= 0) entry.result = result.slice(0, 48);
            } else if (typeof result === 'string') {
              entry.resultType = 'str(' + result.length + ')';
              entry.result = result.substring(0, 80);
            } else if (typeof result === 'number') {
              entry.resultType = 'num';
              entry.result = result;
            } else {
              entry.resultType = typeof result;
            }
            log.push(entry);
            return result;
          };
        })(idx, this[idx]);
      }
      return 'wrapped';
    }`,
    returnByValue: true,
  });
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){ return arguments; }',
  });
  const wrapCall = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){ 
      var self = this;
      var log = [];
      this.__encLog = log;
      var INTERESTING = [16,21,24,32,48,88];
      var targets = ${JSON.stringify(wrapTargets)};
      for (var t = 0; t < targets.length; t++) {
        var idx = targets[t];
        if (typeof this[idx] !== 'function') continue;
        (function(idx, orig) {
          self[idx] = function() {
            var entry = { idx: idx, time: Date.now(), args: Array.from(arguments).map(function(x){ if(Array.isArray(x)) return 'arr['+x.length+']'; if(typeof x==='string') return '"'+x.substring(0,12)+'"'; return typeof x; }) };
            for (var a = 0; a < arguments.length; a++) if (Array.isArray(arguments[a]) && INTERESTING.indexOf(arguments[a].length) >= 0) entry['arg'+a] = arguments[a].slice(0,48);
            var result = orig.apply(this, arguments);
            if (Array.isArray(result)) { entry.resultType = 'arr['+result.length+']'; if (INTERESTING.indexOf(result.length) >= 0) entry.result = result.slice(0,48); }
            else if (typeof result === 'string') { entry.resultType = 'str('+result.length+')'; entry.result = result.substring(0,80); }
            else if (typeof result === 'number') { entry.resultType = 'num'; entry.result = result; }
            else entry.resultType = typeof result;
            log.push(entry);
            return result;
          };
        })(idx, this[idx]);
      }
      return 'wrapped=' + targets.length;
    }`,
    returnByValue: true,
  });
  console.log('  ', wrapCall.result.value);

  // ---- 触发请求 ----
  console.log('\n[6] 触发多请求...');
  const REQS = [
    { method: 'POST', url: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{}' },
    { method: 'GET', url: '/px-gateway/GatewayConfig/security', body: null },
    { method: 'POST', url: '/px-common-authcenter/auth/v2/captcha/get', body: '{}' },
  ];
  for (let ri = 0; ri < REQS.length; ri++) {
    const r = REQS[ri];
    const trig = await cdp.send('Runtime.evaluate', {
      expression: `(function(){
        try {
          var x = new XMLHttpRequest();
          x.open('${r.method}', '${r.url}', false);
          x.setRequestHeader('Content-Type', 'application/json');
          x.send(${r.body === null ? 'null' : "'" + r.body + "'"});
          return JSON.stringify({ status: x.status, q: (x.responseURL || '').indexOf('r20SZOQm=') >= 0 });
        } catch(e) { return e.message; }
      })()`,
      returnByValue: true,
    });
    console.log('  [' + ri + '] ' + r.method + ' ' + r.url + ' → ' + trig.result.value);
    await page.waitForTimeout(500);
  }

  // ---- 导出 ----
  const encLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){ return JSON.stringify(this.__encLog || []); }',
    returnByValue: true,
  });
  const encLog = JSON.parse(encLogR.result.value);

  const out = {
    capturedAt: Date.now(),
    challenges,
    keys30,
    queryRequests,
    encLog,
    decodedQueries: queryRequests.map(q => {
      const bytes = decodeQuery(q.query);
      return { path: q.path, method: q.method, query: q.query, bytes,
        crc: bytes.slice(0, 4),
        session: bytes.slice(7, 55),
        request: bytes.slice(56, 88),
        sessionHex: bytes.slice(7, 55).map(b => b.toString(16).padStart(2, '0')).join(' '),
        requestHex: bytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' ') };
    }),
  };
  const fname = path.join(OUT, 'cd_keys_query_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('\n=== 保存:', fname);

  // 摘要
  console.log('\n=== 24→32 加密调用 ===');
  for (const c of encLog) {
    if (c.resultType === 'arr[32]' && (c.args || []).join(',').includes('arr[24]')) {
      console.log('  ★ idx=' + c.idx, 'args:', c.args.join(','));
      if (c.arg1) console.log('    KEY21:', c.arg1.join(','));
    }
  }
  console.log('\n=== 全部加密调用 ===');
  for (const c of encLog) {
    console.log('  idx=' + c.idx, 'args:', (c.args || []).join(','), '→', c.resultType, c.result ? (Array.isArray(c.result) ? '[' + c.result.join(',') + ']' : c.result) : '');
    if (c.arg0) console.log('    arg0:', c.arg0.join(','));
    if (c.arg1) console.log('    arg1:', c.arg1.join(','));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
