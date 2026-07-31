/**
 * query_sandbox_real_http.js — 沙箱 XHR 用真实 HTTP 请求
 * 
 * RS send hook 检查响应 200 → 启用 query 生成
 * trampoline 生成 query → 捕获 query 值
 * 
 * 关键：不逆向加密算法，让 RS 自己生成 query
 * 然后在 Node.js 中调用生成函数
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet, httpPost } = require('./proxy_http');

(async () => {
  console.log('=== 沙箱 XHR 用真实 HTTP 请求 ===\n');

  // Step 1: 获取挑战页 + 管线 cookie
  const ch = await httpGet(TARGET, { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  await client.init();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;
  console.log(`nsd=${nsd}, cookie valid`);

  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

  // 用真实 HTTP 请求的 XHR
  function makeRealXHR() {
    function RSXHR() {}
    RSXHR.prototype = {
      readyState: 0, status: 0, responseText: '', responseURL: '',
      UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
      timeout: 0, withCredentials: false,
      open: function(method, url) {
        this._method = method;
        this._url = String(url);
        this._headers = {};
        this.readyState = 1;
      },
      setRequestHeader: function(k, v) { if (!this._headers) this._headers = {}; this._headers[k] = v; },
      send: function(body) {
        const self = this;
        // 检查 RS 是否修改了 URL（追加了 query）
        const finalUrl = self._url;
        const hasQuery = finalUrl.includes('r20SZOQm=');
        
        if (hasQuery) {
          const match = finalUrl.match(/r20SZOQm=([^&]+)/);
          if (match) {
            console.log(`  [XHR] RS modified URL: ${finalUrl.substring(0, 100)}`);
            console.log(`  [XHR] Query: ${match[1].substring(0, 60)}`);
          }
        }
        
        // 用真实 HTTP 请求
        const fullUrl = finalUrl.startsWith('http') ? finalUrl : TARGET.replace(/\/$/, '') + finalUrl;
        const cookieHeader = seedCookie;
        
        // 同步模拟（用同步方式模拟 async HTTP）
        const doRequest = async () => {
          try {
            let result;
            if (self._method === 'GET') {
              result = await httpGet(fullUrl, { userAgent: 'Mozilla/5.0', headers: { Cookie: cookieHeader } });
            } else {
              result = await httpPost(fullUrl, body || '{}', { userAgent: 'Mozilla/5.0', headers: { Cookie: cookieHeader } });
            }
            
            self.readyState = 4;
            self.status = result.status;
            self.responseText = result.body || '';
            self.responseURL = fullUrl;
            
            console.log(`  [XHR] Response: ${result.status} (${self._method} ${finalUrl.substring(0, 60)})`);
            
            if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
            if (self.onload) { try { self.onload(); } catch(e) {} }
          } catch (e) {
            self.readyState = 4;
            self.status = 0;
            self.responseText = JSON.stringify({ error: e.message });
            console.log(`  [XHR] Error: ${e.message.substring(0, 60)}`);
          }
        };
        
        // 用 Promise 模拟异步
        doRequest();
      },
      abort: function() {}, overrideMimeType: function() {},
      getAllResponseHeaders: function() { return ''; },
      getResponseHeader: function() { return null; },
      addEventListener: function(type, fn) { if (type === 'load') this.onload = fn; if (type === 'readystatechange') this.onreadystatechange = fn; },
      removeEventListener: function() {},
      upload: { addEventListener: function() {}, removeEventListener: function() {} },
    };
    return RSXHR;
  }

  function lockCookie(env, seedCookie) {
    env.sandbox.document = new Proxy(env.sandbox.document, {
      get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
      set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
    });
  }

  // Pass 1: 执行动态代码
  console.log('\n[Pass 1] 执行动态代码（用真实 HTTP XHR）...');
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  lockCookie(env1, seedCookie);
  env1.sandbox.XMLHttpRequest = makeRealXHR();

  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }

  // 等待动态代码执行 + cookie 生成 + RS hook
  console.log('等待 5 秒让 RS 执行...');
  await new Promise(r => setTimeout(r, 5000));

  // 检查 RS 状态
  const captured = env1.captured;
  console.log(`Cookies: ${captured.cookies.length}`);
  console.log(`Errors: ${captured.errors.length}`);
  if (captured.errors.length > 0) console.log(`  First: ${captured.errors[0].substring(0, 80)}`);

  // 检查 XHR prototype 是否被 RS hook
  const RSXHR = env1.sandbox.XMLHttpRequest;
  const openStr = RSXHR.prototype.open.toString();
  const sendStr = RSXHR.prototype.send.toString();
  console.log(`\nXHR.open hooked: ${!openStr.includes('_method')}`);
  console.log(`  open: ${openStr.substring(0, 80)}`);
  console.log(`  send: ${sendStr.substring(0, 80)}`);

  // 尝试发 XHR POST（RS 应该追加 query）
  console.log('\n[Pass 2] 发 XHR POST...');
  try {
    const xhr = new RSXHR();
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    
    // 检查 RS 设置的实例属性
    const rsProps = [];
    for (const k in xhr) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        rsProps.push(`${k}=${typeof xhr[k]}:${String(xhr[k]).substring(0, 30)}`);
      }
    }
    console.log(`  RS props: ${rsProps.join(', ')}`);
    
    // 检查 flag
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') {
        console.log(`  Flag ${k} = ${xhr[k]}`);
      }
    }

    // 强制 flag=true
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true;
    }

    // 发 XHR
    xhr.send('{}');
    
    // 等待真实 HTTP 响应
    console.log('  等待 HTTP 响应...');
    await new Promise(r => setTimeout(r, 5000));
    
    console.log(`  Final URL: ${xhr._url}`);
    console.log(`  Status: ${xhr.status}`);
    console.log(`  Response: ${xhr.responseText?.substring(0, 80)}`);
    
    if (xhr._url && xhr._url.includes('r20SZOQm=')) {
      const match = xhr._url.match(/r20SZOQm=([^&]+)/);
      if (match) {
        console.log(`\n*** QUERY CAPTURED! ***`);
        console.log(`Query: ${match[1]}`);
        console.log(`Length: ${match[1].length}`);
        
        // 保存 query
        fs.writeFileSync(
          path.join(ROOT, 'output/capture-20080/query-captured.json'),
          JSON.stringify({
            query: match[1],
            url: xhr._url,
            method: 'POST',
            status: xhr.status,
            nsd, cd,
            timestamp: new Date().toISOString(),
          }, null, 2)
        );
        console.log('Saved!');
      }
    } else {
      console.log('\nNo query in URL');
      console.log('RS did not append query parameter');
    }
  } catch (e) {
    console.log('XHR error:', e.message.substring(0, 100));
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
