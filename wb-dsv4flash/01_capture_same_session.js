/**
 * 01_capture_same_session.js
 *
 * 核心突破脚本：同一会话内同时捕获
 *   1. 412 挑战页的 nsd/cd（保证与浏览器同 cd）
 *   2. 每个 XHR 请求的 query 值（Network.requestWillBeSent）
 *   3. global[165] 加密函数的每次调用（含 key/data/flag/result）——精确到请求
 *   4. global 数组中 VM 入口点（sub 编号 + 返回值）——21 字节密钥来源
 *   5. 闭包 keys 数组（idx 30，45 个 cd keys）
 *
 * 通过"同步 XHR + encLog 前后差值"把加密调用精确绑定到每个请求。
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

// 解码 query（'0'+numarr2string 编码）→ 88 字节
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
function decodeQuery(query) {
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
  // 尾部余数（119 字符 = 29*4 + 3 → 还有 2 字节）
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

  // ---- 捕获 412 挑战页 nsd/cd ----
  let challenge = null;
  cdp.on('Network.responseReceived', async (params) => {
    if (challenge) return;
    if (params.type === 'Document' && params.response.status === 412) {
      try {
        const body = await cdp.send('Network.getResponseBody', { requestId: params.requestId });
        challenge = { nsd: null, cd: null, setCookies: params.response.headers['set-cookie'] || '' };
        const nsdM = body.body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        if (nsdM) challenge.nsd = parseInt(nsdM[1]);
        if (cdM) challenge.cd = cdM[1];
        console.log('[challenge] nsd=' + challenge.nsd + ' cdLen=' + (challenge.cd || '').length);
      } catch (e) {}
    }
  });

  // ---- 捕获 query 请求 ----
  const queryRequests = [];
  cdp.on('Network.requestWillBeSent', (params) => {
    const url = params.request.url;
    const m = url.match(/r20SZOQm=([^&]+)/);
    if (m) {
      queryRequests.push({
        path: url.split('?')[0],
        query: m[1],
        method: params.request.method,
        ts: Date.now(),
      });
    }
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
  console.log('  dispatcher:', dName);

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
  if (!globalName) { console.log('  ❌ 未找到 global 变量名'); await browser.close(); return; }
  console.log('  global 变量:', globalName);

  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });

  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId;
    }
  }
  if (!globalId) { console.log('  ❌ 未找到 global 数组'); await browser.close(); return; }

  // ---- 提取 keys 数组（idx 30 = 45 个 cd keys）----
  console.log('\n[5] 提取闭包 cd keys...');
  const keysArrR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var out = { length: this.length };
      var idx30 = this[30];
      if (Array.isArray(idx30)) {
        out.keys30 = idx30.map(function(k) {
          if (Array.isArray(k)) return { t: 'arr', len: k.length, d: k.slice(0, 64) };
          return { t: typeof k, v: typeof k === 'string' ? k.substring(0, 200) : k };
        });
      } else out.keys30 = null;
      return JSON.stringify(out);
    }`,
    returnByValue: true,
  });
  const keysInfo = JSON.parse(keysArrR.result.value);
  console.log('  global.length =', keysInfo.length, ' keys30 =', keysInfo.keys30 ? keysInfo.keys30.length + ' 项' : 'null');

  // ---- Hook [165] 加密函数 + VM 入口点 ----
  console.log('\n[6] Hook 加密函数 + VM 入口点...');
  const hookR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var self = this;
      var encLog = [];
      this.__encLog = encLog;
      var vmLog = [];
      this.__vmLog = vmLog;

      // 识别加密函数：源码包含 getCfg 特征（combine4 / cfgnum）或 idx 151/165
      var encIdx = [];
      for (var i = 0; i < this.length; i++) {
        if (typeof this[i] !== 'function') continue;
        var src = Function.prototype.toString.call(this[i]);
        if (src.indexOf('combine4') >= 0 || src.indexOf('cfgnum') >= 0 || src.indexOf('2654435769') >= 0) {
          encIdx.push(i);
        }
      }

      for (var ei = 0; ei < encIdx.length; ei++) {
        var idx = encIdx[ei];
        (function(idx, orig) {
          self[idx] = function() {
            var args = Array.from(arguments);
            var e = {
              idx: idx,
              time: Date.now(),
              argTypes: args.map(function(a) { return Array.isArray(a) ? 'arr[' + a.length + ']' : typeof a; }),
            };
            // key = 第二参数（21 字节）
            if (args[1] && Array.isArray(args[1])) { e.key = args[1].slice(0, 40); e.keyLen = args[1].length; }
            // data = 第一参数
            if (args[0] && Array.isArray(args[0])) { e.dataLen = args[0].length; e.data = args[0].slice(0, 24); }
            e.flag = args[2];
            var result = orig.apply(this, arguments);
            if (Array.isArray(result)) { e.resultLen = result.length; e.result = result.slice(0, 24); }
            encLog.push(e);
            return result;
          };
        })(idx, this[idx]);
      }

      // 识别并 hook VM 入口点：var _$x=[N];...push.apply...apply(this
      var vmIdx = [];
      for (var i = 0; i < this.length; i++) {
        if (typeof this[i] !== 'function') continue;
        var src = Function.prototype.toString.call(this[i]);
        var m = src.match(/\\[([0-9]+)\\]/);
        if (m && src.indexOf('push.apply') >= 0 && src.indexOf('.apply(this') >= 0) vmIdx.push({ idx: i, sub: parseInt(m[1]) });
      }

      for (var vi = 0; vi < vmIdx.length; vi++) {
        var v = vmIdx[vi];
        (function(v, orig) {
          self[v.idx] = function() {
            var result = orig.apply(this, arguments);
            var rl = Array.isArray(result) ? 'arr[' + result.length + ']' : typeof result;
            var rd = Array.isArray(result) ? result.slice(0, 24) : (typeof result === 'string' ? result.substring(0, 40) : result);
            vmLog.push({ sub: v.sub, idx: v.idx, resultType: rl, result: rd });
            return result;
          };
        })(v, this[v.idx]);
      }

      return JSON.stringify({ encIdx: encIdx, vmIdx: vmIdx.map(function(v){return v.sub + '@' + v.idx;}) });
    }`,
    returnByValue: true,
  });
  const hookInfo = JSON.parse(hookR.result.value);
  console.log('  Hooked encrypt:', hookInfo.encIdx.join(','), '| VM entries:', hookInfo.vmIdx.join(','));

  // ---- 触发多个请求，每个请求记录 encLog 前后差值 ----
  console.log('\n[7] 触发多请求...');
  const REQS = [
    { method: 'GET', url: '/px-gateway/GatewayConfig/security', body: null },
    { method: 'POST', url: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{}' },
    { method: 'POST', url: '/px-common-authcenter/auth/v2/captcha/get', body: '{}' },
    { method: 'GET', url: '/px-gateway/GatewayConfig/security', body: null },
    { method: 'POST', url: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{"a":1}' },
  ];

  const perRequest = [];
  for (let ri = 0; ri < REQS.length; ri++) {
    const r = REQS[ri];
    const lenBefore = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalId,
      functionDeclaration: 'function(){ return this.__encLog.length; }',
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
    const encDeltaR = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalId,
      functionDeclaration: `function(){
        var start = ${JSON.stringify(lenBefore.result.value)};
        return JSON.stringify({ total: this.__encLog.length, delta: this.__encLog.slice(start) });
      }`,
      returnByValue: true,
    });
    const encDelta = JSON.parse(encDeltaR.result.value);
    perRequest.push({ req: r, status: trig.result.value, encDelta: encDelta.delta });
    console.log('  [' + ri + '] ' + r.method + ' ' + r.url + ' → ' + trig.result.value + ' encCalls=' + encDelta.delta.length);
    await page.waitForTimeout(800);
  }

  // ---- 导出日志 ----
  console.log('\n[8] 导出日志...');
  const encAllR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){ return JSON.stringify(this.__encLog || []); }',
    returnByValue: true,
  });
  const vmAllR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){ return JSON.stringify(this.__vmLog || []); }',
    returnByValue: true,
  });

  const encAll = JSON.parse(encAllR.result.value);
  const vmAll = JSON.parse(vmAllR.result.value);

  // 保存
  const out = {
    challenge,
    globalLen: keysInfo.length,
    keys30: keysInfo.keys30,
    queryRequests,
    perRequest,
    encAll,
    vmAll,
    decodedQueries: queryRequests.map(q => {
      const bytes = decodeQuery(q.query);
      return {
        path: q.path,
        method: q.method,
        query: q.query,
        bytes,
        crc: bytes.slice(0, 4),
        session: bytes.slice(7, 55),
        request: bytes.slice(56, 88),
        sessionHex: bytes.slice(7, 55).map(b => b.toString(16).padStart(2, '0')).join(' '),
        requestHex: bytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' '),
      };
    }),
  };
  fs.writeFileSync(path.join(OUT, 'same_session_' + Date.now() + '.json'), JSON.stringify(out, null, 2));

  console.log('\n=== 完成 ===');
  console.log('query 数量:', out.decodedQueries.length);
  if (out.decodedQueries.length > 0) {
    console.log('session_data:', out.decodedQueries[0].sessionHex);
  }
  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
