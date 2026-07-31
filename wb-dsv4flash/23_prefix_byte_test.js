/**
 * 23_prefix_byte_test.js
 *
 * 决定性测试：逐一修改 prefix 13 个字节 + 其他字段，服务器响应
 * 目的：确定服务器校验 prefix 的哪些位置
 *   - 若只有部分位置校验（如 mask=0 的位置=keys2 派生），只需 keys2 即可生成
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
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

const https = require('https');
function httpPost(pathStr, cookies, query, body) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path: pathStr + '?r20SZOQm=' + encodeURIComponent(query),
      method: 'POST', rejectUnauthorized: false,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json;charset=UTF-8', 'Content-Length': Buffer.byteLength(body), 'Cookie': cookies },
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', e => resolve({ status: 'ERR' }));
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

  // 定位 global + hook [165]
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

  // hook [165] 捕获明文/密钥，同时抓取最新 query
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self=this; var log=[]; this.__encLog=log;
      for(var t=0;t<2;t++){
        var idx=[165,151][t];
        if(typeof this[idx]!=='function')continue;
        (function(idx,orig){ self[idx]=function(){
          var e={args:Array.from(arguments).map(function(x){return Array.isArray(x)?'arr['+x.length+']':typeof x;})};
          if(Array.isArray(arguments[0]))e.arg0=arguments[0].slice(0,48);
          if(Array.isArray(arguments[1]))e.arg1=arguments[1].slice(0,48);
          var r=orig.apply(this,arguments);
          if(Array.isArray(r)){e.resultType='arr['+r.length+']';e.result=r.slice(0,48);}
          log.push(e); return r;
        };})(idx,this[idx]);
      }
      return 'ok';
    }`,
    returnByValue: true,
  });

  // 触发捕获
  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){ var x=new XMLHttpRequest(); x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false); x.setRequestHeader('Content-Type','application/json'); x.send('{}'); return x.responseURL; })()`,
    returnByValue: true,
  });
  const query = decodeURIComponent(trig.result.value.match(/r20SZOQm=([^&]+)/)[1]);
  const encR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__encLog||[]); }', returnByValue: true });
  const encLog = JSON.parse(encR.result.value);
  const enc24 = encLog.filter(c => c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]'));
  const plain = enc24[enc24.length - 1].arg0;
  const key21 = enc24[enc24.length - 1].arg1;
  console.log('[3] 明文:', plain.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // cookies
  const cookies = await context.cookies();
  const oCookie = cookies.find(c => c.name.endsWith('O'));
  const pCookie = cookies.find(c => c.name.endsWith('P'));
  const cookieStr = `${oCookie.name}=${oCookie.value}; ${pCookie.name}=${pCookie.value}`;

  // 加载管线加密
  process.chdir(path.join(__dirname, '..'));
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.join(__dirname, '..'));
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  require('@src/handler/parser/constData').init();

  // 构造 query
  const bytes = decodeQuery(query);
  function makeQuery(requestData) {
    const b = [...bytes.slice(0, 7), ...bytes.slice(7, 55), ...bytes.slice(55, 56), ...requestData];
    const crc = crc32b(Buffer.from(b.slice(4)));
    b[0] = (crc >>> 24) & 255; b[1] = (crc >>> 16) & 255; b[2] = (crc >>> 8) & 255; b[3] = crc & 255;
    return encodeQuery(b);
  }

  // 测试矩阵
  console.log('\n[4] 逐字节修改测试:');
  const tests = [];
  // 基线（用浏览器明文重构）
  const encBase = encryptMode1([...plain], key21, 0);
  tests.push({ name: '基线(重构)', query: makeQuery(encBase), expect: '?' });
  // 修改 prefix 每个字节
  for (let i = 0; i < 13; i++) {
    const p2 = [...plain];
    p2[i] ^= 1;
    const e2 = encryptMode1(p2, key21, 0);
    tests.push({ name: `prefix[${i}] XOR 1`, query: makeQuery(e2), expect: '?' });
  }
  // 修改其他字段
  const p3 = [...plain]; p3[19] = (p3[19] + 2) & 255; tests.push({ name: 'counter+2', query: makeQuery(encryptMode1(p3, key21, 0)) });
  const p4 = [...plain]; p4[13] = 0x11; tests.push({ name: 'time[0]=0x11', query: makeQuery(encryptMode1(p4, key21, 0)) });
  const p5 = [...plain]; p5[20] = (p5[20] + 1) & 255; tests.push({ name: 'url_crc[0]+1', query: makeQuery(encryptMode1(p5, key21, 0)) });

  const results = [];
  for (const t of tests) {
    const r = await httpPost('/px-gateway/GatewayConfig/getGatewayConfig', cookieStr, t.query, '{}');
    results.push({ name: t.name, status: r.status });
    console.log(`  ${t.name}: ${r.status}`);
    await new Promise(r2 => setTimeout(r2, 200));
  }

  // 保存结果
  require('fs').writeFileSync(path.join(__dirname, 'captures', 'prefix_test_' + Date.now() + '.json'), JSON.stringify({ plain, key21, results }, null, 2));
  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
