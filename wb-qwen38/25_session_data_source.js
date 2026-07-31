/**
 * 25_session_data_source.js
 * 
 * 追踪 session_data 来源：
 * 1. 提取 O cookie 并解码
 * 2. 检查 session_data 与 O cookie 的关系
 * 3. 提取 $_ts 对象的关键值
 * 4. 检查 session_data 是否是 cookie/keys 的哈希
 * 5. 提取 VM trampoline 的 bytecode（通过闭包链）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OUT = path.join(__dirname, 'captures');

const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

function string2numarr(str) {
  const keys = basestr.split('');
  const lookup = {};
  keys.forEach((ch, idx) => { lookup[ch] = idx; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = lookup[str[i]], c1 = lookup[str[i+1]], c2 = lookup[str[i+2]], c3 = lookup[str[i+3]];
    if (c0 !== undefined && c1 !== undefined) ans.push((c0 << 2) | (c1 >> 4));
    if (c1 !== undefined && c2 !== undefined) ans.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c2 !== undefined && c3 !== undefined) ans.push(((c2 & 3) << 6) | c3);
  }
  return ans;
}

async function evalCDP(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result.value;
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  
  // 捕获请求
  const queries = [];
  cdp.on('Network.requestWillBeSent', p => {
    const m = p.request.url.match(/r20SZOQm=([^&]+)/);
    if (m) queries.push({ url: p.request.url, query: m[1], cookies: p.request.headers?.Cookie || '' });
  });
  
  console.log('[1] 加载...');
  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  // 触发请求
  await evalCDP(cdp, `(function(){var x=new XMLHttpRequest();x.open('GET','/px-gateway/GatewayConfig/security',false);x.send();return x.status})()`);
  await page.waitForTimeout(1000);
  
  // [2] 提取 O cookie 和 P cookie
  console.log('\n[2] 提取 Cookie...');
  const cookies = await evalCDP(cdp, 'document.cookie');
  const oMatch = cookies.match(/aoU85Lxl9xxNO=([^;]+)/);
  const pMatch = cookies.match(/aoU85Lxl9xxNP=([^;]+)/);
  
  const oCookieVal = oMatch?.[1] || '';
  const pCookieVal = pMatch?.[1] || '';
  
  console.log(`  O cookie: ${oCookieVal.substring(0, 40)}... (${oCookieVal.length} chars)`);
  console.log(`  P cookie: ${pCookieVal.substring(0, 40)}... (${pCookieVal.length} chars)`);
  
  // 解码 O cookie
  const oBytes = oCookieVal ? string2numarr(oCookieVal) : [];
  console.log(`  O cookie 解码: ${oBytes.length}B`);
  console.log(`  O cookie hex: ${oBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  
  // 解码 P cookie
  const pBytes = pCookieVal ? string2numarr(pCookieVal.substring(1)) : []; // 去掉 '0' 前缀
  console.log(`  P cookie 解码: ${pBytes.length}B`);
  
  // [3] 提取 session_data
  console.log('\n[3] 提取 session_data...');
  let sessionData = null;
  if (queries.length > 0) {
    const qBytes = string2numarr(queries[0].query.substring(1));
    sessionData = qBytes.slice(7, 55);
    console.log(`  session_data (48B): [${sessionData.join(',')}]`);
  }
  
  if (!sessionData) { console.log('❌ 无 session_data'); await browser.close(); return; }
  
  // [4] 检查 session_data 与 O cookie 的关系
  console.log('\n[4] O cookie 关联分析...');
  
  // 直接匹配
  const oHex = oBytes.map(b => b.toString(16).padStart(2, '0')).join('');
  const sdHex = sessionData.map(b => b.toString(16).padStart(2, '0')).join('');
  console.log(`  session_data 在 O cookie 中: ${oHex.includes(sdHex) ? '✅' : '❌'}`);
  console.log(`  session_data[0:8] 在 O cookie 中: ${oHex.includes(sdHex.substring(0, 16)) ? '✅' : '❌'}`);
  
  // XOR 分析
  if (oBytes.length >= 48) {
    const xorResult = sessionData.map((b, i) => b ^ oBytes[i]);
    console.log(`  session_data XOR O_cookie[0:48]: [${xorResult.slice(0, 16).join(',')}]`);
    const xorAscii = xorResult.filter(b => b >= 32 && b < 127).length;
    console.log(`  XOR ASCII ratio: ${(xorAscii / 48 * 100).toFixed(0)}%`);
  }
  
  // [5] 哈希测试
  console.log('\n[5] 哈希测试...');
  
  // MD5(O_cookie_bytes) = 16B, 不是 48B
  // SHA384(O_cookie_bytes) = 48B!
  const sha384_o = crypto.createHash('sha384').update(Buffer.from(oBytes)).digest();
  console.log(`  SHA384(O_bytes) == session_data: ${Buffer.from(sessionData).equals(sha384_o) ? '✅ YES!' : '❌'}`);
  
  // SHA384(O_cookie_string)
  const sha384_ostr = crypto.createHash('sha384').update(oCookieVal).digest();
  console.log(`  SHA384(O_str) == session_data: ${Buffer.from(sessionData).equals(sha384_ostr) ? '✅ YES!' : '❌'}`);
  
  // SHA384(P_cookie_bytes)
  const sha384_p = crypto.createHash('sha384').update(Buffer.from(pBytes)).digest();
  console.log(`  SHA384(P_bytes) == session_data: ${Buffer.from(sessionData).equals(sha384_p) ? '✅ YES!' : '❌'}`);
  
  // SHA384(P_cookie_string)
  const sha384_pstr = crypto.createHash('sha384').update(pCookieVal).digest();
  console.log(`  SHA384(P_str) == session_data: ${Buffer.from(sessionData).equals(sha384_pstr) ? '✅ YES!' : '❌'}`);
  
  // MD5 组合
  const md5_o = crypto.createHash('md5').update(Buffer.from(oBytes)).digest();
  const md5_p = crypto.createHash('md5').update(Buffer.from(pBytes)).digest();
  const combined = Buffer.concat([md5_o, md5_p, md5_o]);
  console.log(`  MD5(O)+MD5(P)+MD5(O) == session_data: ${Buffer.from(sessionData).equals(combined) ? '✅ YES!' : '❌'}`);
  
  // [6] 检查 session_data 是否是 O cookie 的 AES 解密结果
  console.log('\n[6] O cookie 结构分析...');
  console.log(`  O cookie 前 20B: [${oBytes.slice(0, 20).join(',')}]`);
  console.log(`  O cookie 长度: ${oBytes.length}B`);
  
  // O cookie 结构：通常是 numarrJoin 格式
  // 检查前几个字节
  if (oBytes.length > 4) {
    console.log(`  O[0]=${oBytes[0]} O[1]=${oBytes[1]} (如果是 numarrJoin: 第一个参数)`);
  }
  
  // [7] 提取 $_ts 对象
  console.log('\n[7] 提取 $_ts...');
  const tsInfo = await evalCDP(cdp, `(function(){
    if (typeof $_ts === 'undefined') return JSON.stringify({error: 'no $_ts'});
    var keys = Object.keys($_ts);
    var result = {keys: keys};
    keys.forEach(function(k) {
      var v = $_ts[k];
      if (typeof v === 'number') result[k] = v;
      else if (typeof v === 'string') result[k] = v.substring(0, 50);
      else if (Array.isArray(v)) result[k] = 'arr[' + v.length + ']';
      else if (typeof v === 'object' && v) result[k] = 'obj{' + Object.keys(v).length + '}';
      else result[k] = typeof v;
    });
    return JSON.stringify(result);
  })()`);
  console.log('  $_ts:', tsInfo);
  
  // [8] 从 Network 请求中提取完整 cookie header
  console.log('\n[8] 请求 Cookie 分析...');
  if (queries.length > 0 && queries[0].cookies) {
    const reqCookies = queries[0].cookies;
    console.log(`  请求 Cookie: ${reqCookies.substring(0, 100)}...`);
    
    // 提取 O cookie 值
    const reqOMatch = reqCookies.match(/aoU85Lxl9xxNO=([^;]+)/);
    if (reqOMatch) {
      const reqOBytes = string2numarr(reqOMatch[1]);
      console.log(`  请求中 O cookie: ${reqOBytes.length}B`);
      
      // 检查 session_data 是否是请求 O cookie 的派生
      const sha384_reqO = crypto.createHash('sha384').update(Buffer.from(reqOBytes)).digest();
      console.log(`  SHA384(req_O_bytes) == session_data: ${Buffer.from(sessionData).equals(sha384_reqO) ? '✅ YES!' : '❌'}`);
    }
  }
  
  // [9] 检查 session_data 是否是 encryptMode1(O_cookie, keys17, 0) 的结果
  console.log('\n[9] 加密关联测试...');
  require('module-alias')(path.join(__dirname, '..'));
  const gv = require('@src/handler/globalVarible');
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  
  // 获取 keys17（从 hook 加密函数）
  // 先 hook 然后触发请求
  const sendSrcR = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  const dm2 = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName2 = dm2[1];
  
  const sendObj2 = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps2 = await cdp.send('Runtime.getProperties', { objectId: sendObj2.result.objectId, ownProperties: true });
  let scopesId2;
  for (const ip of (sendProps2.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId2 = ip.value.objectId; }
  const scopes2 = await cdp.send('Runtime.getProperties', { objectId: scopesId2, ownProperties: true });
  
  let dId2;
  for (const scope of scopes2.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName2 && v.value?.type === 'function') dId2 = v.value.objectId; }
  }
  
  const dSrcR2 = await cdp.send('Runtime.callFunctionOn', {
    objectId: dId2,
    functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
    returnByValue: true,
  });
  const m322 = dSrcR2.result.value.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName2 = m322[1];
  
  const dispProps2 = await cdp.send('Runtime.getProperties', { objectId: dId2, ownProperties: true });
  let dispScopesId2;
  for (const ip of (dispProps2.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId2 = ip.value.objectId; }
  const dispScopes2 = await cdp.send('Runtime.getProperties', { objectId: dispScopesId2, ownProperties: true });
  
  let globalId2 = null;
  for (const scope of dispScopes2.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === globalName2 && v.value?.objectId) globalId2 = v.value.objectId;
    }
  }
  
  // Hook 加密函数并触发请求
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId2,
    functionDeclaration: `function() {
      var self = this;
      this.__encLog2 = [];
      [151, 165].forEach(function(idx) {
        if (typeof self[idx] !== 'function') return;
        var orig = self[idx];
        self[idx] = function() {
          var args = Array.from(arguments);
          var entry = {
            data: args[0] && Array.isArray(args[0]) ? Array.from(args[0]) : null,
            key: args[1] && Array.isArray(args[1]) ? Array.from(args[1]) : null,
            flag: args[2],
          };
          var result = orig.apply(this, arguments);
          entry.result = result && Array.isArray(result) ? Array.from(result) : null;
          self.__encLog2.push(entry);
          return result;
        };
      });
      return 'ok';
    }`,
    returnByValue: true,
  });
  
  // 触发请求
  await evalCDP(cdp, `(function(){var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json;charset=UTF-8');x.send('{}');return x.status})()`);
  
  // 读取加密日志
  const encLog2R = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId2,
    functionDeclaration: 'function() { return JSON.stringify(this.__encLog2 || []); }',
    returnByValue: true,
  });
  const encLog2 = JSON.parse(encLog2R.result.value);
  
  // 提取 keys17
  const cookieInnerCall = encLog2.find(e => e.data?.length === 216);
  if (cookieInnerCall && cookieInnerCall.key) {
    const [keys17] = numarrAddTime.reverse([...cookieInnerCall.key]);
    console.log(`  keys17: [${keys17.join(',')}]`);
    
    // 尝试：session_data = encryptMode1(O_cookie_subset, keys17, 0)
    // O cookie 是 66B，取前 48B 或后 48B
    if (oBytes.length >= 48) {
      for (const [name, subset] of [
        ['O[0:48]', oBytes.slice(0, 48)],
        ['O[18:66]', oBytes.slice(18, 66)],
        ['O[last48]', oBytes.slice(oBytes.length - 48)],
      ]) {
        const enc = encryptMode1([...subset], [...cookieInnerCall.key], 0);
        const match = JSON.stringify(enc.slice(0, 48)) === JSON.stringify(sessionData);
        if (match) console.log(`  ★ encryptMode1(${name}, keys17, 0) == session_data! ✅`);
      }
    }
    
    // 尝试：session_data = encryptMode2(O_cookie, keys17, 0) 的某种截取
    try {
      const decO = encryptMode2([...oBytes], [...cookieInnerCall.key], 0);
      console.log(`  encryptMode2(O, keys17, 0): ${decO.length}B [${decO.slice(0, 16).join(',')}]`);
    } catch(e) {}
    
    // 尝试：session_data 的解密
    // 用 keys17 的不同 flag 解密 session_data
    for (const flag of [0, 1]) {
      try {
        const pt = encryptMode2([...sessionData], [...cookieInnerCall.key], flag);
        if (pt.length > 0) {
          console.log(`  encryptMode2(session_data, keys17+time, ${flag}): ${pt.length}B [${pt.slice(0, 16).join(',')}]`);
        }
      } catch(e) {}
    }
    
    // 用 keys16 解密
    const cookieOuterCall = encLog2.find(e => e.data?.length === 289);
    if (cookieOuterCall && cookieOuterCall.key) {
      for (const flag of [0, 1]) {
        try {
          const pt = encryptMode2([...sessionData], [...cookieOuterCall.key], flag);
          if (pt.length > 0) {
            const lastB = pt[pt.length - 1];
            const padOk = lastB >= 1 && lastB <= 16 && pt.slice(-lastB).every(b => b === lastB);
            console.log(`  encryptMode2(session_data, keys16+time, ${flag}): ${pt.length}B pad=${padOk ? '✅' + lastB : '❌'} [${pt.slice(0, 16).join(',')}]`);
          }
        } catch(e) {}
      }
    }
  }
  
  // 保存
  fs.writeFileSync(path.join(OUT, 'session_data_source.json'), JSON.stringify({
    sessionData,
    oCookieBytes: oBytes,
    pCookieBytes: pBytes.slice(0, 50),
    oCookieVal: oCookieVal.substring(0, 100),
    encLog: encLog2.map(e => ({ dataLen: e.data?.length, keyLen: e.key?.length, flag: e.flag, resultLen: e.result?.length })),
  }, null, 2));
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
