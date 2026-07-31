/**
 * 58_browser_assisted.js
 *
 * 浏览器辅助完整流程：
 *   1. 浏览器抓 keys2/16/17 + O cookie + query 样本（同会话）
 *   2. Node 用浏览器 keys + basearr303 构造 cookie
 *   3. 通过浏览器发请求重放（验证算法正确性）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function encodeStr(bytes) {
  let out = '';
  let i = 0;
  while (i + 3 <= bytes.length) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += BASESTR[b0 >> 2] + BASESTR[((b0 & 3) << 4) | (b1 >> 4)] + BASESTR[((b1 & 15) << 2) | (b2 >> 6)] + BASESTR[b2 & 63];
    i += 3;
  }
  if (i + 2 === bytes.length) {
    const b0 = bytes[i], b1 = bytes[i + 1];
    out += BASESTR[b0 >> 2] + BASESTR[((b0 & 3) << 4) | (b1 >> 4)] + BASESTR[(b1 & 15) << 2];
  } else if (i + 1 === bytes.length) {
    out += BASESTR[bytes[i] >> 2] + BASESTR[(bytes[i] & 3) << 4];
  }
  return out;
}

async function main() {
  // 读取 basearr303
  let basearr303;
  const exact = path.join(OUT, 'basearr_exact.json');
  if (fs.existsSync(exact)) basearr303 = JSON.parse(fs.readFileSync(exact)).basearr;
  else basearr303 = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_decoded.json'))).basearr;

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  let challenge = null;
  let challengeDate = null;
  page.on('response', async (resp) => {
    if (resp.status() === 412 && !challenge) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
        const d = resp.headers()['date'];
        if (d) challengeDate = Math.floor(new Date(d).getTime() / 1000);
      } catch (e) {}
    }
  });

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);
  console.log('challenge nsd:', challenge ? challenge.nsd : 'null');

  // 定位 global + hook keys
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const dm = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
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
  const dProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dScopesId;
  for (const ip of (dProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dScopesId = ip.value.objectId; }
  const dScopes = await cdp.send('Runtime.getProperties', { objectId: dScopesId, ownProperties: true });
  let globalId = null;
  for (const scope of dScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      if (v.value.description === 'Array(607)') {
        const chk = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function(){ return JSON.stringify({ t185: typeof this[185] }); }',
          returnByValue: true,
        });
        if (JSON.parse(chk.result.value).t185 === 'function') { globalId = v.value.objectId; break; }
      }
    }
    if (globalId) break;
  }
  if (!globalId) { console.log('未找到 global'); await browser.close(); return; }

  // hook 抓 keys + numenc（当前会话）
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var data = { keys16: [], keys17: [], keys2: [], innerInput: null };
      function wrap(idx, onCall) {
        var orig = self[idx];
        if (typeof orig !== 'function') return;
        self[idx] = function() {
          var r = orig.apply(this, arguments);
          try { onCall(arguments); } catch(e) {}
          return r;
        };
      }
      wrap(598, function(a) {
        if (Array.isArray(a[0]) && a[0].length === 16) {
          if (!data.keys16.length) data.keys16 = a[0].slice();
          else if (!data.keys17.length && !a[0].every(function(b,i){return b===data.keys16[i]})) data.keys17 = a[0].slice();
        }
      });
      wrap(187, function(a) {
        if (Array.isArray(a[1]) && a[1].length === 48) data.keys2 = a[1].slice();
      });
      wrap(185, function(a) {
        if (Array.isArray(a[0]) && a[0].length === 288 && Array.isArray(a[1]) && !data.innerInput) {
          data.innerInput = a[0].slice();
          data.innerKey = a[1].slice();
        }
        // 外层加密调用：输入 369B（含 uuid+nextarr）
        if (Array.isArray(a[0]) && a[0].length >= 300 && Array.isArray(a[1]) && a[0].length <= 500) {
          data.outerInput = a[0].slice();
          data.outerKey = a[1].slice();
        }
      });
      self.__keys = data;
      return 'ok';
    }`,
    returnByValue: true,
  });

  // 触发请求
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  const keysR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__keys || {}); }', returnByValue: true });
  const keys = JSON.parse(keysR.result.value);
  console.log('keys16:', keys.keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys17:', keys.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys2 :', keys.keys2.map(b => b.toString(16).padStart(2, '0')).join(' '));

  const cookies = await context.cookies();
  const oC = cookies.find(c => c.name.endsWith('O'));
  const pC = cookies.find(c => c.name.endsWith('P'));

  // 浏览器原始 P 请求验证（在浏览器内）
  const origR = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('\n浏览器原始请求:', origR.result.value);

  // 初始化管线（仅加密函数 + keys，不跑 Coder）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const tools = require('@src/handler/parser/common/tools');

  // 构造 cookie（用浏览器真实 key21 精确复现）
  const keys2 = keys.keys2, keys16 = keys.keys16, keys17 = keys.keys17;
  const innerInput = keys.innerInput;
  const innerKey = keys.innerKey;
  const outerKey = keys.outerKey;
  if (!innerInput || !innerKey || !outerKey) {
    console.log('未抓到完整 hook 数据:', { innerInput: !!innerInput, innerKey: !!innerKey, outerKey: !!outerKey });
    await browser.close(); process.exit(1);
  }
  console.log('浏览器 innerKey 前8:', innerKey.slice(0, 8).map(b => b.toString(16)).join(' '));
  console.log('浏览器 outerKey 前8:', outerKey.slice(0, 8).map(b => b.toString(16)).join(' '));
  // 验证 innerKey/outerKey 的 base 与 keys17/keys16 一致
  const revI = innerKey.slice(0, 16).map(b => b ^ innerKey[20]);
  const revO = outerKey.slice(0, 16).map(b => b ^ outerKey[20]);
  console.log('innerKey.base17 == keys17:', revI.every((b, i) => b === keys17[i]) ? 'YES ✓' : 'NO ✗');
  console.log('outerKey.base16 == keys16:', revO.every((b, i) => b === keys16[i]) ? 'YES ✓' : 'NO ✗');
  // 用浏览器真实 key21 构造（精确复现浏览器加密）
  // 注意：[185] 输入 innerInput 已是 numenc XOR keys2 后的结果，直接用它加密
  const innerEnc = encryptMode1([...innerInput], [...innerKey], 0);
  console.log('innerEnc:', innerEnc.length, '（浏览器应 304）');
  // nextarr：用浏览器 outerInput 的完整 t4（r2mkaTime + startTime）
  const outerInput = keys.outerInput;
  const na = outerInput.slice(4);
  const t4A = na.slice(2, 6);   // 浏览器 r2mkaTime
  const t4B = na.slice(6, 10);  // 浏览器 startTime
  console.log('浏览器 t4_A:', (t4A[0] << 24 | t4A[1] << 16 | t4A[2] << 8 | t4A[3]) >>> 0, 't4_B:', (t4B[0] << 24 | t4B[1] << 16 | t4B[2] << 8 | t4B[3]) >>> 0);
  // 验证管线 uuid 算法与浏览器一致（同一 nextarr）
  try {
    const parser2 = require('@src/handler/parser');
    const calcUuid = parser2.numToNumarr4(parser2.uuid(outerInput.slice(4)));
    console.log('浏览器 uuid4:', outerInput.slice(0, 4).map(b => b.toString(16)).join(''), '管线 uuid:', calcUuid.map(b => b.toString(16)).join(''), '一致:', calcUuid.every((b, i) => b === outerInput[i]) ? 'YES ✓' : 'NO ✗');
  } catch (e) { console.log('uuid 验证失败:', e.message.substring(0, 60)); }
  const encLenBytes = innerEnc.length > 255 ? [0x80 | (innerEnc.length >> 8), innerEnc.length & 255] : [innerEnc.length];
  const nextarr = [4, 8, ...t4A, ...t4B, 48, ...keys2, ...encLenBytes, ...innerEnc];
  // uuid4 = uuid(nextarr)（管线函数，服务器校验）
  const parser2 = require('@src/handler/parser');
  const uuid4 = parser2.uuid ? parser2.numToNumarr4(parser2.uuid(nextarr)) : [183, 202, 150, 131];
  console.log('uuid4:', uuid4.map(b => b.toString(16)).join(''));
  const outerEnc = encryptMode1([...uuid4, ...nextarr], [...outerKey], 1);
  const cookie = 'a' + encodeStr(outerEnc);
  const pName = pC.name;
  console.log('\n构造 cookie len:', cookie.length, '(', pName, ')');
  console.log('原始 P len:', pC.value.length);

  // 通过浏览器重放构造的 cookie（清空后只设 O+构造P）
  console.log('\n=== 清空 cookie 只设 O+构造P ===');
  await context.clearCookies();
  await context.addCookies([
    { name: oC.name, value: oC.value, domain: 'pmos.nx.sgcc.com.cn', path: '/' },
    { name: pName, value: cookie, domain: 'pmos.nx.sgcc.com.cn', path: '/' },
  ]);
  const cookiesAfterB = await context.cookies();
  console.log('设置后 cookies:', cookiesAfterB.map(c => c.name + '=' + c.value.length).join(', '));
  const pcAfter = cookiesAfterB.find(c => c.name.endsWith('P'));
  console.log('替换后 P len:', pcAfter.value.length);
  const replayR = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var x = new XMLHttpRequest();
        x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send('{}');
        return x.status;
      } catch(e) { return e.message; }
    })()`,
    returnByValue: true,
  });
  console.log('构造 cookie 请求:', replayR.result.value);
  if (replayR.result.value === '200') console.log('★★★ 纯算法构造 cookie 有效！');

  // 保存构造 P 与原始 P + keys 供同会话对比
  fs.writeFileSync(path.join(OUT, 'cookie_compare.json'), JSON.stringify({
    cookie, pName, oName: oC.name, oVal: oC.value, origP: pC.value,
    keys16: keys.keys16, keys17: keys.keys17, keys2: keys.keys2, innerInput: keys.innerInput,
    capturedAt: Date.now(),
  }));

  // 同会话解密对比（构造 vs 原始）
  const decodeP = (val, k16, tRange) => {
    const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
    const bytes = [];
    let qi = 0;
    const payload = val.slice(1);
    const groups = Math.floor(payload.length / 4);
    for (let g = 0; g < groups; g++) {
      const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
      qi += 4;
      bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
    }
    if (qi + 2 < payload.length) {
      const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]];
      bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
    } else if (qi + 1 < payload.length) {
      bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi + 1]] >> 4));
    }
    const now = Math.floor(Date.now() / 1000);
    for (let t = now - tRange; t <= now + tRange; t++) {
      for (let ele = 1; ele <= 256; ele++) {
        try {
          const arr = numarrAddTime([...k16], t, ele / 256)[0];
          const dec = encryptMode1 && false ? null : null;
          // 用 encryptMode2 解密
          const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
          const d = encryptMode2([...bytes], arr, 1);
          if (d.length > 50 && d[4] === 4 && d[14] === 48) return { t, ele, dec: d };
        } catch (e) {}
      }
    }
    return null;
  };

  const decMine = decodeP(cookie, keys.keys16, 600);
  const decOrig = decodeP(pC.value, keys.keys16, 600);
  console.log('\n=== 同会话解密对比 ===');
  if (decMine) {
    const na = decMine.dec.slice(4);
    console.log('构造 P: t=' + decMine.t + ' nextarr头=' + na.slice(0, 16).join(','));
    console.log('  keys2段=', na.slice(11, 17).map(b => b.toString(16)).join(' '), 'hook keys2前6=', keys.keys2.slice(0, 6).map(b => b.toString(16)).join(' '));
  } else console.log('构造 P 解密失败');
  if (decOrig) {
    const na = decOrig.dec.slice(4);
    console.log('原始 P: t=' + decOrig.t + ' nextarr头=' + na.slice(0, 16).join(','));
    console.log('  keys2段=', na.slice(11, 17).map(b => b.toString(16)).join(' '));
  } else console.log('原始 P 解密失败');

  // Node 重放（O 新鲜 + 构造 P）
  console.log('\n=== Node 重放（O + 构造 P）===');
  const https = require('https');
  function httpGet(cookieH) {
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'pmos.nx.sgcc.com.cn', port: 10443, path: '/', method: 'GET', rejectUnauthorized: false,
        headers: { 'User-Agent': UA, 'Accept': '*/*', 'Cookie': cookieH },
      }, res => {
        let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b }));
      });
      req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
      req.end();
    });
  }
  const r1 = await httpGet(`${oC.name}=${oC.value}; ${pName}=${cookie}`);
  console.log('Node 重放(构造P) →', r1.status);
  const r2 = await httpGet(`${oC.name}=${oC.value}; ${pName}=${pC.value}`);
  console.log('Node 重放(原始P) →', r2.status);

  // 触发请求后的最新 P（浏览器新生成的）
  const cookiesAfter2 = await context.cookies();
  const pcLatest = cookiesAfter2.find(c => c.name.endsWith('P'));
  console.log('触发后最新 P len:', pcLatest.value.length);
  const r4 = await httpGet(`${oC.name}=${oC.value}; ${pName}=${pcLatest.value}`);
  console.log('Node 重放(触发后P) →', r4.status);
  // 构造 P 与触发后 P 是否相同
  console.log('构造 P == 触发后 P:', cookie === pcLatest.value ? 'YES' : 'NO');
  if (cookie !== pcLatest.value) {
    let d = -1;
    for (let i = 0; i < Math.min(cookie.length, pcLatest.value.length); i++) {
      if (cookie[i] !== pcLatest.value[i]) { d = i; break; }
    }
    console.log('首个差异 @', d);
  }
  // 保存触发后 P 供精确对比
  const ccData = JSON.parse(fs.readFileSync(path.join(OUT, 'cookie_compare.json')));
  ccData.latestP = pcLatest.value;
  ccData.origP = pC.value;
  ccData.mineP = cookie;
  fs.writeFileSync(path.join(OUT, 'cookie_compare.json'), JSON.stringify(ccData, null, 2));

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
