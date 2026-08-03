/** 474 dump 内层 VM 函数第 4 参数（_$_t 环境数组来源） */
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

// 从动态代码找 4 参数函数（内层 VM 特征：参数含 4 个）
function findInnerVMs(code) {
  const fns = [];
  const re = /function\s+([_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const params = m[2].split(',').map(s => s.trim()).filter(Boolean);
    if (params.length === 4) {
      // 检查函数体（前 800 字符）含字节码特征（.xxx 属性访问）
      const open = m.index + m[0].length - 1;
      const body = code.substring(open, open + 800);
      // 内层 VM 特征：参数 A 后跟 ._$ 属性（如 _$_F._$iz）
      const p0 = params[0];
      if (body.includes(p0 + '._') || body.includes('[' + p0 + ']') || body.includes(p0 + '[')) {
        fns.push({ name: m[1], params, open });
      }
    }
  }
  return fns;
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

  // 找内层 VM 函数
  const vms = findInnerVMs(dynCode);
  console.log('内层 VM 候选:', vms.map(v => v.name + '(' + v.params.join(',') + ')').join(' | ') || '无');

  // 注入 __proxy + polyfill
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get: function(t,p){ return window.__proxy(); }, set: function(t,p,v){ return true; } }); };
    __proxy = window.__proxy;
    if (typeof DataView !== 'undefined' && !DataView.prototype.getFloat16) {
      DataView.prototype.getFloat16 = function(byteOffset, littleEndian) { var u = this.getUint16(byteOffset, littleEndian); var sign = (u&0x8000)?-1:1; var exp=(u&0x7c00)>>10; var frac=u&0x03ff; if(exp===0)return sign*frac*Math.pow(2,-24); if(exp===0x1f)return frac?NaN:sign*Infinity; return sign*(1+frac/1024)*Math.pow(2,exp-15); };
    }
    window.$_ts = window.$_ts || {};
    window.__t4 = [];
  `, sandbox);

  let runCode = dynCode;
  // op69
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(runCode)) runCode = runCode.replace(re69, '!$1?($2+=0):0;');
  // env safe（防 documentMode 报错）
  runCode = runCode.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) =>
    '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) =>
    '=((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\]\[/g, (mm, x, y) => '=((' + x + '[' + y + '])||__proxy())[');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)-1\](?![=(])/g, (mm, x, y) => '=((' + x + '[' + y + '-1])||__proxy())');
  runCode = runCode.replace(/(?<![=!<>])=([_$\w]+)\[--([_$\w]+)\](?![=(])/g, (mm, x, y) => '=((' + x + '[--' + y + '])||__proxy())');
  // disabledOpcodes 初步（721/154）
  runCode = runCode.replace(/if\(([_$\w]+)===721\)\{[^{}]*\}/g, (mm, v) => 'if(' + v + '===721){}');
  runCode = runCode.replace(/if\(([_$\w]+)===154\)\{[^{}]*\}/g, (mm, v) => 'if(' + v + '===154){}');
  // patch 4 参数函数入口 dump 第 4 参数（replace 一次性，特征：参数0 属性访问）
  let dumpCnt = 0;
  runCode = runCode.replace(/(function\s+([_$][\w$]*)\s*\(([_$][\w$]+),([_$][\w$]+),([_$][\w$]+),([_$][\w$]+)\)\{)([^]{0,200})/g, (mm, head, fn, p1, p2, p3, p4, body) => {
    // 只 dump 参数0 属性访问的函数（内层 VM 特征）
    if (!body.includes(p1 + '._') && !body.includes(p1 + '[')) return mm;
    dumpCnt++;
    return head + 'window.__t4.push("' + fn + ':"+(typeof ' + p4 + '==="undefined"?"undef":(Array.isArray(' + p4 + ')?("arr"+' + p4 + '.length):(typeof ' + p4 + '))));' + body;
  });
  console.log('dump patch:', dumpCnt);
  // while 插桩
  let gi = 0;
  runCode = runCode.replace(/while\(1\)\{/g, () => {
    gi++;
    return 'while(1){window.__w' + gi + '=(window.__w' + gi + '||0)+1;window.__lastW=' + gi + ';if(window.__all>8000000)throw new Error("ALL_LOOP_w' + gi + '");window.__all=(window.__all||0)+1;';
  });
  fs.writeFileSync('/tmp/nx_dump_t4.js', runCode);

  console.log('[运行]...');
  try {
    vm.runInContext(runCode, sandbox, { timeout: 40000, filename: 'dyn.js' });
    console.log('运行完成');
  } catch (e) {
    console.log('运行失败:', e.message.substring(0, 150));
  }
  const t4 = vm.runInContext('JSON.stringify(window.__t4)', sandbox);
  console.log('\n=== 内层 VM 第 4 参数 ===');
  console.log(t4.substring(0, 1500));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
