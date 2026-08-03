/**
 * 600_basearr_breakpoint.js
 * CDP 断点定位 nx basearr 生成：
 * hook huffman 编码函数（numarrEncrypt 等价物），捕获 basearr 数组构造
 * xb 方法：通过 XMLHttpRequest.prototype.send 的 [[Scopes]] 找 VM dispatcher → global 数组 → hook 关键函数
 * nx 目标：定位生成 basearr（huffman 编码前的明文数组，含绑定字节）的函数
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');

function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '', raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          const setCookies = [];
          resHead.split('\r\n').forEach(l => { if (/^set-cookie:/i.test(l)) setCookies.push(l.substring(11).split(';')[0]); });
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4), setCookies });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  console.log('nsd=' + m[1]);

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });

  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 20000));

  // 找 VM dispatcher：通过 XMLHttpRequest.prototype.send
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const sendSrc = sendSrcR.result.value || '';
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  console.log('[2] send trampoline:', dm ? dm[1] + '(' + dm[2] + ',0,' + dm[3] + '.' + dm[4] + '.length,' + dm[5] + ')' : '未匹配');
  if (!dm) {
    console.log('send src 前 500:', sendSrc.substring(0, 500));
    // 尝试宽松匹配
    const dm2 = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,[^,]+\.([_$\w]+)\.length/);
    console.log('宽松匹配:', dm2 ? dm2[1] : '无');
    await browser.close(); process.exit(0);
  }

  const dName = dm[1];
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  let dId = null;
  if (scopesId) {
    const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
    for (const scope of scopes.result) {
      if (!scope.value?.objectId) continue;
      const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
      for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
    }
  }
  console.log('[3] dispatcher:', dId ? '已找到' : '未找到');
  if (!dId) { await browser.close(); process.exit(0); }

  // 从 dispatcher 源码找 global 数组名
  const dSrcR = await cdp.send('Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
  const dSrc = dSrcR.result.value || '';
  fs.writeFileSync('/tmp/nx_browser_disp.js', dSrc);
  console.log('[4] dispatcher len:', dSrc.length);

  // 找 global 数组（瑞数特征：= _\$..[N] 访问 165 等）
  // query 用 global[165]，basearr 的 huffman 编码用另一个索引
  // 找 dispatcher 里 push 到数组的操作（_\$..[_\$..++] =）或 hash 相关
  // 关键：定位 huffman 编码函数（numarrEncrypt 等价物）
  // 瑞数内层 VM 的编码函数是 global 数组里的某个函数，输入 basearr 明文，输出 huffman 流

  // 简化：直接在 dispatcher 里找 numarrEncrypt 特征（bitshift 循环 + 256）
  // 先 dump dispatcher 操作码语义找 hash/编码

  // 用 561 号反编译路径：提取 bytecode + 操作码表
  // 但这里用 CDP 更直接：枚举 global 数组所有函数，找接收 160-170 长度数组的

  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  console.log('[5] global 数组名:', globalName);

  // 提取 global 数组
  let globalId = null;
  if (globalName) {
    const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
    let dispScopesId;
    for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
    if (dispScopesId) {
      const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
      for (const scope of dispScopes.result) {
        if (!scope.value?.objectId) continue;
        const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
        for (const v of vars.result) { if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId; }
      }
    }
  }

  // 枚举 global 数组的所有元素，找函数
  if (globalId) {
    const gprops = await cdp.send('Runtime.getProperties', { objectId: globalId, ownProperties: true });
    const funcs = [];
    for (const p of gprops.result) {
      if (p.value?.type === 'function') {
        try {
          const src = await cdp.send('Runtime.callFunctionOn', { objectId: p.value.objectId, functionDeclaration: 'function(){ return Function.prototype.toString.call(this); }', returnByValue: true });
          const s = src.result.value || '';
          if (s.length > 200 && s.length < 3000) funcs.push({ idx: p.name, len: s.length, src: s });
        } catch (e) {}
      }
    }
    console.log('[6] global 函数数:', funcs.length);
    // 找 numarrEncrypt 特征：huffman 编码 = 移位 + 256 循环
    const huffCands = funcs.filter(f => /<<|>>/.test(f.src) && /\+=|<256|>=8|&255|& 255/.test(f.src) && f.len > 300);
    console.log('huffman 候选:', huffCands.map(f => f.idx + '(' + f.len + ')').join(','));
    // 保存所有候选源码
    fs.writeFileSync('/tmp/nx_global_funcs.json', JSON.stringify(funcs, null, 1));
    for (const f of huffCands.slice(0, 3)) {
      fs.writeFileSync('/tmp/nx_huff_cand_' + f.idx + '.js', f.src);
      console.log('--- global[' + f.idx + '] 源码 ---');
      console.log(f.src.substring(0, 1200));
    }
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
