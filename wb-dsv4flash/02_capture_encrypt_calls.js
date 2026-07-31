/**
 * 02_capture_encrypt_calls.js
 *
 * 目标：精确定位 query request_data 的加密调用（24B→32B flag=0）并捕获密钥
 * 方法：
 *   1. 修复 nsd/cd 捕获（page.on('response') 直接读 412 body）
 *   2. 包装 global 数组中全部函数，记录含数组参数/数组返回的调用
 *   3. 每个请求记录调用差值（同步 XHR）
 *   4. 触发后立即导出
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

  // ---- 捕获 412 挑战页 ----
  let challenge = null;
  page.on('response', async (resp) => {
    if (challenge) return;
    if (resp.status() === 412) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = {
          nsd: nsdM ? parseInt(nsdM[1]) : null,
          cd: cdM ? cdM[1] : null,
          cookies: await context.cookies(),
          bodyLen: body.length,
        };
        console.log('[challenge] nsd=' + challenge.nsd + ' cdLen=' + (challenge.cd || '').length + ' bodyLen=' + body.length);
      } catch (e) { console.log('[challenge] err:', e.message); }
    }
  });

  // ---- 捕获 query ----
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

  // ---- 包装全部函数 ----
  console.log('\n[5] 包装 global 全部函数（记录数组调用）...');
  const wrapR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var self = this;
      var log = [];
      this.__callLog = log;
      var wrapped = 0;
      var INTERESTING = [16, 21, 24, 32, 48, 88];

      for (var i = 0; i < this.length; i++) {
        if (typeof this[i] !== 'function') continue;
        var orig = this[i];
        (function(idx, orig) {
          self[idx] = function() {
            // 快速过滤：参数里有数组才算
            var hasArr = false;
            for (var a = 0; a < arguments.length; a++) {
              if (Array.isArray(arguments[a])) { hasArr = true; break; }
            }
            if (hasArr) {
              var entry = {
                idx: idx,
                time: Date.now(),
                args: Array.from(arguments).map(function(x) {
                  if (Array.isArray(x)) return 'arr[' + x.length + ']';
                  if (typeof x === 'string') return '"' + x.substring(0, 12) + '"';
                  return typeof x;
                }),
              };
              // 记录数组参数内容（只记长度 16/21/24/32/48/88）
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
                entry.result = result.substring(0, 60);
              } else {
                entry.resultType = typeof result;
                if (typeof result === 'number') entry.result = result;
              }
              log.push(entry);
              return result;
            }
            return orig.apply(this, arguments);
          };
        })(i, this[i]);
        wrapped++;
      }
      return 'wrapped=' + wrapped;
    }`,
    returnByValue: true,
  });
  console.log('  ', wrapR.result.value);

  // ---- 触发请求 ----
  console.log('\n[6] 触发多请求...');
  const REQS = [
    { method: 'POST', url: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{}' },
    { method: 'GET', url: '/px-gateway/GatewayConfig/security', body: null },
    { method: 'POST', url: '/px-common-authcenter/auth/v2/captcha/get', body: '{}' },
  ];
  for (let ri = 0; ri < REQS.length; ri++) {
    const r = REQS[ri];
    const lenBeforeR = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalId,
      functionDeclaration: 'function(){ return this.__callLog.length; }',
      returnByValue: true,
    });
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
  const callLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){ return JSON.stringify(this.__callLog || []); }',
    returnByValue: true,
  });
  const callLog = JSON.parse(callLogR.result.value);
  const out = {
    challenge,
    keys30,
    queryRequests,
    callLog,
    decodedQueries: queryRequests.map(q => {
      const bytes = decodeQuery(q.query);
      return { path: q.path, method: q.method, bytes,
        crc: bytes.slice(0, 4),
        session: bytes.slice(7, 55),
        request: bytes.slice(56, 88),
        sessionHex: bytes.slice(7, 55).map(b => b.toString(16).padStart(2, '0')).join(' '),
        requestHex: bytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' ') };
    }),
  };
  const fname = path.join(OUT, 'enc_calls_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('\n=== 保存:', fname);

  // ---- 关键摘要：24→32 加密调用 ----
  console.log('\n=== 24→32 加密调用（request_data 加密）===');
  for (const c of callLog) {
    const argsStr = (c.args || []).join(',');
    if (c.resultType === 'arr[32]' && argsStr.includes('arr[24]')) {
      console.log('  ★ idx=' + c.idx, 'args:', argsStr);
      if (c.arg1) console.log('    KEY21:', c.arg1.join(','));
      if (c.result) console.log('    OUT32:', c.result.join(','));
    }
  }
  console.log('\n=== 21 字节数组生成（key 候选）===');
  for (const c of callLog) {
    if (c.resultType === 'arr[21]') {
      console.log('  idx=' + c.idx, '→', c.result.join(','));
    }
  }
  console.log('\n=== 48 字节出现 ===');
  for (const c of callLog) {
    if (c.resultType === 'arr[48]' || (c.args || []).join(',').includes('arr[48]')) {
      console.log('  idx=' + c.idx, 'args:', (c.args || []).join(','), 'result:', c.resultType, c.result ? '[' + c.result.join(',') + ']' : '');
    }
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
