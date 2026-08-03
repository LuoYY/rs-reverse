/** 488 dump op5 环境属性检查（try{if(env[prop]){）的属性名和对象类型 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const tls = require('tls');

const ROOT = path.join(__dirname, '..');
const PROXY = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        resolve({ status: headEnd >= 0 ? parseInt((body.substring(0, headEnd).split(' ')[1] || '').trim()) : 'ERR', body: body.substring(headEnd + 4) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战:', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const nsd = +m[1], cd = m[2];
  console.log('nsd=' + nsd);

  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env = buildEnv({ nsd, cd }, { outerJsCode, target: TARGET, ua: UA, patchDyn: false });
  const sandbox = env.sandbox;
  try { vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 5000));
  const dynCode = env.getDynCode();
  if (!dynCode) { console.log('无动态代码'); process.exit(1); }
  console.log('dynCode len:', dynCode.length);

  // 注入基础
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get: function(t,p){ return window.__proxy(); }, set: function(t,p,v){ return true; } }); };
    __proxy = window.__proxy;
    window.__eD = [];
    if (typeof DataView !== 'undefined' && !DataView.prototype.getFloat16) {
      DataView.prototype.getFloat16 = function(byteOffset, littleEndian) { var u = this.getUint16(byteOffset, littleEndian); var sign = (u&0x8000)?-1:1; var exp=(u&0x7c00)>>10; var frac=u&0x03ff; if(exp===0)return sign*frac*Math.pow(2,-24); if(exp===0x1f)return frac?NaN:sign*Infinity; return sign*(1+frac/1024)*Math.pow(2,exp-15); };
    }
    try { window.$_ts = window.$_ts || {}; } catch(e){}
  `, sandbox);

  let runCode = dynCode;
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(runCode)) runCode = runCode.replace(re69, '!$1?($2+=0):0;');
  runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) =>
    '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) =>
    '=((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\]\[/g, (mm, x, y) => '=((' + x + '[' + y + '])||__proxy())[');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)-1\](?![=(])/g, (mm, x, y) => '=((' + x + '[' + y + '-1])||__proxy())');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[--([_$\w]+)\](?![=(])/g, (mm, x, y) => '=((' + x + '[--' + y + '])||__proxy())');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([0-3])\](?![=(])/g, (mm, x, n) => '=(((' + x + ')&&(' + x + ')[' + n + '])||__proxy())');
  runCode = runCode.replace(/if\(([_$\w]+)===721\)\{[^{}]*\}/g, (mm, v) => 'if(' + v + '===721){}');
  runCode = runCode.replace(/if\(([_$\w]+)===154\)\{[^{}]*\}/g, (mm, v) => 'if(' + v + '===154){}');

  // ★ dump op5 环境属性检查：try{if(envObj[propArr[N]]){ → 记录对象类型+属性名
  let dCnt = 0;
  runCode = runCode.replace(/try\{if\(([_$\w]+)\[([_$\w]+)\[(\d+)\]\]\)\{/g, (mm, obj, arr, num) => {
    dCnt++;
    return 'try{window.__eD.push(String(typeof ' + obj + ')+"|"+(String((' + arr + ')[' + num + ']).substring(0,30)));if(' + obj + '[' + arr + '[' + num + ']]){';
  });
  console.log('dump patch:', dCnt);

  let gi = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gi++;
    return 'while(1){window.__w' + gi + '=(window.__w' + gi + '||0)+1;window.__lastW=' + gi + ';if(window.__all>8000000)throw new Error("ALL_LOOP_w' + gi + '");window.__all=(window.__all||0)+1;';
  });
  fs.writeFileSync('/tmp/nx_dump_envprop.js', runCode);

  console.log('[运行]...');
  try {
    vm.runInContext(runCode, sandbox, { timeout: 40000, filename: 'dyn.js' });
    console.log('运行完成');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 150));
  }
  const eD = vm.runInContext('JSON.stringify(window.__eD)', sandbox);
  console.log('\n=== 环境属性检查 dump ===');
  console.log(eD.substring(0, 1200));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
