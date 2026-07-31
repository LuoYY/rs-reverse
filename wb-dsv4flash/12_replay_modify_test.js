/**
 * 12_replay_modify_test.js
 *
 * 决定性实验：服务器对 query 明文各字段的校验严格度
 *
 * 流程：
 *   1. 浏览器捕获一个合法 query（POST getGatewayConfig）
 *   2. 浏览器 context 导出 O/P cookies
 *   3. Node 中用 cookies + 修改后的 query 直接 POST
 *   4. 分别测试：原样重放 / 修改 time3 / 修改 counter / 修改 URL nonce / 修改 session 前缀
 *
 * 结果解读：
 *   - 原样重放 200 → cookies+query 可复用（说明 O/P+query 非一次性）
 *   - 修改 time3 仍 200 → time3 不严格校验（可随机生成！）
 *   - 修改 counter 仍 200 → counter 不严格校验
 *   - 修改 URL nonce 400/412 → URL 绑定严格（必须正确生成 CRC32）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');
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
  if (qi + 1 < payload.length) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]];
    bytes.push((c0 << 2) | (c1 >> 4));
  }
  return bytes;
}

function encodeQuery(bytes) {
  const keys = BASESTR.split('');
  const ans = [];
  let idx = 0;
  while (idx < bytes.length - 2) {
    const [one, two, three] = [bytes[idx], bytes[idx + 1], bytes[idx + 2]];
    idx += 3;
    ans.push(keys[one >> 2], keys[(one & 3) << 4 | two >> 4], keys[(two & 15) << 2 | three >> 6], keys[three & 63]);
  }
  if (idx < bytes.length) {
    ans.push(keys[bytes[idx] >> 2], keys[(bytes[idx] & 3) << 4 | bytes[idx + 1] >> 4]);
    if (bytes[idx + 1] !== undefined) ans.push(keys[(bytes[idx + 1] & 15) << 2]);
  }
  return '0' + ans.join('');
}

function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

function httpPost(pathStr, cookies, query, body) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path: pathStr + '?r20SZOQm=' + encodeURIComponent(query),
      method: 'POST', rejectUnauthorized: false,
      headers: {
        'User-Agent': UA, 'Content-Type': 'application/json;charset=UTF-8',
        'Content-Length': Buffer.byteLength(body),
        'Cookie': cookies,
      },
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, bodyLen: b.length, bodyHead: b.substring(0, 120) }));
    });
    req.on('error', e => resolve({ status: 'ERR', bodyLen: 0, bodyHead: e.message }));
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('[1] 启动浏览器...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // 触发一次 POST 获取合法 query
  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){ var x=new XMLHttpRequest(); x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false); x.setRequestHeader('Content-Type','application/json'); x.send('{}'); return JSON.stringify({status:x.status, url:x.responseURL}); })()`,
    returnByValue: true,
  });
  const trigData = JSON.parse(trig.result.value);
  console.log('[3] 浏览器 POST:', trigData.status);
  const qm = trigData.url.match(/r20SZOQm=([^&]+)/);
  if (!qm) { console.log('  无 query'); await browser.close(); return; }
  const query = decodeURIComponent(qm[1]);
  console.log('  query:', query.substring(0, 50) + '...');

  // 导出 cookies
  const cookies = await context.cookies();
  const oCookie = cookies.find(c => c.name.endsWith('O'));
  const pCookie = cookies.find(c => c.name.endsWith('P'));
  const cookieStr = `${oCookie.name}=${oCookie.value}; ${pCookie.name}=${pCookie.value}`;
  console.log('  cookies:', oCookie.name + '=' + oCookie.value.substring(0, 20) + '... ' + pCookie.name + '=' + pCookie.value.substring(0, 20) + '...');

  // 解码 query
  const bytes = decodeQuery(query);
  console.log('\n[4] query 88B 结构:');
  console.log('  crc:', bytes.slice(0, 4).map(b => b.toString(16)).join(''));
  console.log('  session:', bytes.slice(7, 55).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  request:', bytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 解密 request_data 得到明文（用 keys17 — 但我们不知道本会话 keys17... 用捕获的方式：浏览器里 hook）
  // 简化：直接用原始 query 做修改测试（不动 request_data 加密层，只改 88B 结构中非加密字段）
  // 结构: [crc4][1][0][48][session48][32][request32]
  // 明文在 request_data 内部，我们无法从外面直接改明文。

  // ★ 但我们可以测试另一件事：整个 query 的可重放性 + 修改 URL 后（带原 query）是否 400
  console.log('\n[5] 重放测试:');
  const r1 = await httpPost('/px-gateway/GatewayConfig/getGatewayConfig', cookieStr, query, '{}');
  console.log('  原样重放:', r1.status, r1.bodyHead.substring(0, 60));

  // 修改 URL（同 query）→ 应该 400（URL 绑定）
  const r2 = await httpPost('/px-gateway/GatewayConfig/security', cookieStr, query, '{}');
  console.log('  换 URL 重放:', r2.status, r2.bodyHead.substring(0, 60));

  // 用浏览器再生成一个新 query 验证（新 counter）
  const trig2 = await cdp.send('Runtime.evaluate', {
    expression: `(function(){ var x=new XMLHttpRequest(); x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false); x.setRequestHeader('Content-Type','application/json'); x.send('{}'); return JSON.stringify({status:x.status, url:x.responseURL}); })()`,
    returnByValue: true,
  });
  const trig2Data = JSON.parse(trig2.result.value);
  const qm2 = trig2Data.url.match(/r20SZOQm=([^&]+)/);
  console.log('  新 query 重放:', await (async () => { const r = await httpPost('/px-gateway/GatewayConfig/getGatewayConfig', cookieStr, decodeURIComponent(qm2[1]), '{}'); return r.status; })());

  // 保持浏览器打开，用浏览器内部 hook 拿到明文后做修改实验
  // 定位 global → [165] hook → 触发 → 拿明文
  console.log('\n[6] 浏览器内 hook 加密拿明文...');
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
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
  const dSrcR = await cdp.send('Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
  const m32 = dSrcR.result.value.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
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

  // hook [165]
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self=this; var log=[]; this.__encLog=log;
      var targets=[165,151];
      for(var t=0;t<targets.length;t++){
        var idx=targets[t];
        if(typeof this[idx]!=='function')continue;
        (function(idx,orig){ self[idx]=function(){
          var e={idx:idx,args:Array.from(arguments).map(function(x){return Array.isArray(x)?'arr['+x.length+']':typeof x;})};
          if(Array.isArray(arguments[0])){e.arg0=arguments[0].slice(0,48);}
          if(Array.isArray(arguments[1])){e.arg1=arguments[1].slice(0,48);}
          var r=orig.apply(this,arguments);
          if(Array.isArray(r)){e.resultType='arr['+r.length+']';e.result=r.slice(0,48);}
          else e.resultType=typeof r;
          log.push(e); return r;
        };})(idx,this[idx]);
      }
      return 'ok';
    }`,
    returnByValue: true,
  });

  // 触发，捕获明文
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){ var x=new XMLHttpRequest(); x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false); x.setRequestHeader('Content-Type','application/json'); x.send('{}'); return x.status; })()`,
    returnByValue: true,
  });
  const encR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__encLog||[]); }', returnByValue: true });
  const encLog = JSON.parse(encR.result.value);
  const enc24 = encLog.filter(c => c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]'));
  if (!enc24.length) { console.log('  未捕获 24→32'); await browser.close(); return; }
  const plain = enc24[enc24.length - 1].arg0;
  const key21 = enc24[enc24.length - 1].arg1;
  const ele = key21[20];
  const keyTime = ((key21[16]^ele)<<24|(key21[17]^ele)<<16|(key21[18]^ele)<<8|(key21[19]^ele))>>>0;
  console.log('  明文:', plain.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  密钥:', key21.map(b => b.toString(16).padStart(2, '0')).join(' '), 'ele=' + ele, 't=' + keyTime);

  // keys17 反推
  const keys17 = key21.slice(0, 16).map(b => b ^ ele);
  console.log('  keys17(从key反推):', keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 在 Node 中重构 request_data = encryptMode1(plain, key21, 0)，然后修改明文字段重加密，重放测试
  process.chdir(path.join(__dirname, '..'));
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.join(__dirname, '..'));
  const { encryptMode1: enc1 } = require('@src/handler/parser/common/modeEncrypt');
  require('@src/handler/parser/constData').init();

  // 重构 88B：用浏览器 query 的 crc + 新 request_data
  const bytes2 = decodeQuery(query);
  // 保持 session 段 + 改 request_data
  function makeQuery(requestData) {
    const b = [
      ...bytes2.slice(0, 7),      // crc4 + [1][0][48]
      ...bytes2.slice(7, 55),     // session
      ...bytes2.slice(55, 56),    // [32]
      ...requestData,             // 32B
    ];
    // 重算 CRC32
    const crc = crc32b(Buffer.from(b.slice(4)));
    b[0] = (crc >>> 24) & 255; b[1] = (crc >>> 16) & 255; b[2] = (crc >>> 8) & 255; b[3] = crc & 255;
    return encodeQuery(b);
  }

  const variants = [
    { name: '原样（浏览器最新 query）', query: query },
  ];
  // 用捕获的明文重构（含新 counter）→ 应该与浏览器新 query 相同
  const encNew = enc1([...plain], key21, 0);
  variants.push({ name: '重构（明文+key21，应等于浏览器新 query）', query: makeQuery(encNew) });

  // 修改 time3（bytes 13-15）为随机 → 重新加密
  const plain2 = [...plain];
  plain2[13] = 0x12; plain2[14] = 0x34; plain2[15] = 0x56;
  const enc2 = enc1(plain2, key21, 0);
  variants.push({ name: '修改 time3 为 12 34 56', query: makeQuery(enc2) });

  // 修改 counter（byte19）+2 → 重新加密
  const plain3 = [...plain];
  plain3[19] = (plain3[19] + 2) & 255;
  const enc3 = enc1(plain3, key21, 0);
  variants.push({ name: '修改 counter +2', query: makeQuery(enc3) });

  // 修改 session 前缀（bytes 0-12）→ 重新加密
  const plain4 = [...plain];
  plain4[0] ^= 1;
  const enc4 = enc1(plain4, key21, 0);
  variants.push({ name: '修改 prefix[0] XOR 1', query: makeQuery(enc4) });

  // 修改 const3（bytes 16-18）→ 重新加密
  const plain5 = [...plain];
  plain5[16] ^= 1;
  const enc5 = enc1(plain5, key21, 0);
  variants.push({ name: '修改 const3[0] XOR 1', query: makeQuery(enc5) });

  // 修改 URL nonce（bytes 20-23）→ 重新加密
  const plain6 = [...plain];
  plain6[20] ^= 1;
  const enc6 = enc1(plain6, key21, 0);
  variants.push({ name: '修改 url_crc[0] XOR 1', query: makeQuery(enc6) });

  console.log('\n[7] 修改测试（POST 同 URL，带浏览器 cookies）:');
  for (const v of variants) {
    const r = await httpPost('/px-gateway/GatewayConfig/getGatewayConfig', cookieStr, v.query, '{}');
    console.log(`  ${v.name}: ${r.status} ${r.bodyHead.substring(0, 50)}`);
    await new Promise(r2 => setTimeout(r2, 300));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
