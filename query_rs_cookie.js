/**
 * query_rs_cookie.js — 用 RS 生成的 cookie（非管线）触发 query 生成
 *
 * 1. Pass 1: 默认 buildEnv（实例 XHR）→ RS 生成 cookie
 * 2. Pass 2: 原型 XHR + seedCookie = RS P cookie → RS 追加 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== RS 生成的 cookie 触发 query ===\n');

  const ch = await httpGet(TARGET, { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  // Pass 1: RS 生成 cookie
  console.log('[Pass 1] RS 生成 cookie...');
  const env1 = buildEnv({ nsd, cd }, { seedCookie: oCookie });
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 3000));

  const rsCookies = env1.captured.cookies;
  const rsPCookie = rsCookies.find(c => c.includes('aoU85Lxl9xxNP='));
  console.log(`RS cookies: ${rsCookies.length}`);
  console.log(`RS P cookie: ${rsPCookie ? rsPCookie.substring(0, 60) + '...' : 'not found'}`);

  if (!rsPCookie) {
    console.log('RS did not generate P cookie');
    console.log('Errors:', env1.captured.errors.length);
    process.exit(1);
  }

  // 提取 RS P cookie 的完整值
  const pCookieValue = rsPCookie.split(';')[0];
  console.log(`P cookie value: ${pCookieValue.substring(0, 40)}... (${pCookieValue.length} chars)`);

  // Pass 2: 用原型 XHR + RS P cookie
  console.log('\n[Pass 2] 原型 XHR + RS P cookie...');
  const seedCookie2 = `${oCookie}; ${pCookieValue}`;

  function makeProtoXHR() {
    function RSXHR() {}
    RSXHR.prototype = {
      readyState: 0, status: 0, responseText: '', responseURL: '',
      UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
      timeout: 0, withCredentials: false,
      open: function(m, u) { this._method = m; this._url = String(u); this.readyState = 1; },
      send: function(body) {
        const self = this;
        // 检查 RS 是否修改了 URL
        Promise.resolve().then(() => {
          if (self._url && self._url.includes('r20SZOQm=')) {
            const match = self._url.match(/r20SZOQm=([^&]+)/);
            if (match) {
              console.log(`\n*** QUERY CAPTURED! ***`);
              console.log(`Query: ${match[1]}`);
              console.log(`Length: ${match[1].length}`);
              fs.writeFileSync(
                path.join(ROOT, 'output/capture-20080/query-captured.json'),
                JSON.stringify({ query: match[1], url: self._url, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
              );
            }
          }
          self.readyState = 4; self.status = 200; self.responseText = '{"status":0}';
          if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        });
      },
      setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
      getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
      addEventListener: function() {}, removeEventListener: function() {},
    };
    return RSXHR;
  }

  const env2 = buildEnv({ nsd, cd }, { seedCookie: seedCookie2 });
  // Lock cookie
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie2; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  env2.sandbox.XMLHttpRequest = makeProtoXHR();

  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 3000));

  // 检查 XHR hook
  const RSXHR = env2.sandbox.XMLHttpRequest;
  const openStr = RSXHR.prototype.open.toString();
  console.log(`XHR.open hooked: ${!openStr.includes('_method')}`);

  // 发 XHR POST
  console.log('\n[Pass 3] 发 XHR POST...');
  try {
    const xhr = new RSXHR();
    RSXHR.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

    // 检查 RS 设置的实例属性
    const rsProps = [];
    for (const k in xhr) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        rsProps.push(`${k}=${typeof xhr[k]}:${String(xhr[k]).substring(0, 30)}`);
      }
    }
    console.log(`RS props: ${rsProps.join(', ')}`);

    // 检查 flag
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') {
        console.log(`Flag ${k} = ${xhr[k]}`);
      }
    }

    // 强制 flag=true
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true;
    }

    RSXHR.prototype.send.call(xhr, '{}');
    console.log(`After send: _url=${xhr._url}`);

    // 等待 async
    await new Promise(r => setTimeout(r, 2000));
    console.log(`Final URL: ${xhr._url}`);

    if (xhr._url && xhr._url.includes('r20SZOQm=')) {
      console.log('\n*** SUCCESS! Query generated! ***');
    } else {
      console.log('\nNo query in URL');
      
      // 尝试直接调用 trampoline
      console.log('\n--- Direct trampoline call ---');
      for (const k in xhr) {
        if (k.startsWith('_$') && typeof xhr[k] === 'function') {
          try {
            const result = xhr[k].call(xhr, '{}');
            console.log(`Trampoline ${k}: "${String(result).substring(0, 80)}"`);
            if (result && typeof result === 'string' && result.length > 10) {
              console.log(`*** POTENTIAL QUERY: ${result.substring(0, 80)} ***`);
              fs.writeFileSync(
                path.join(ROOT, 'output/capture-20080/query-captured.json'),
                JSON.stringify({ query: result, method: 'trampoline', nsd, cd, timestamp: new Date().toISOString() }, null, 2)
              );
            }
          } catch(e) { console.log(`  Error: ${e.message.substring(0, 60)}`); }
          break;
        }
      }
    }
  } catch (e) {
    console.log('XHR error:', e.message.substring(0, 100));
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
