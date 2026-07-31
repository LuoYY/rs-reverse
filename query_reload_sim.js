/**
 * query_reload_sim.js — 模拟真实 reload 流程
 * Pass 1: RS 生成 cookie
 * Pass 2: 新 nsd/cd + 新 O cookie + RS P cookie → RS 启用 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

(async () => {
  console.log('=== 模拟真实 reload 流程 ===\n');

  // Pass 1: RS 生成 cookie
  const ch1 = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m1 = ch1.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd1 = +m1[1], cd1 = m1[2];
  const sc1 = [].concat(ch1.headers['set-cookie'] || []);
  const oCookie1 = sc1.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc1.map(c => c.split(';')[0])[0];

  console.log(`Pass 1: nsd=${nsd1}`);
  const env1 = buildEnv({ nsd: nsd1, cd: cd1 }, { seedCookie: oCookie1 });
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 3000));

  const rsCookies = env1.captured.cookies;
  const rsPCookie = rsCookies.find(c => c.includes('aoU85Lxl9xxNP='));
  console.log(`RS P cookie: ${rsPCookie ? rsPCookie.substring(0, 40) + '...' : 'not found'}`);

  // Pass 2: 新 nsd/cd + 新 O cookie + RS P cookie
  const ch2 = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m2 = ch2.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd2 = +m2[1], cd2 = m2[2];
  const sc2 = [].concat(ch2.headers['set-cookie'] || []);
  const oCookie2 = sc2.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc2.map(c => c.split(';')[0])[0];

  console.log(`\nPass 2: nsd=${nsd2} (new nsd/cd + new O cookie + RS P cookie)`);
  const seedCookie2 = oCookie2 + '; ' + (rsPCookie ? rsPCookie.split(';')[0] : '');

  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    open: function(m, u) { this._method = m; this._url = String(u); this.readyState = 1; },
    send: function() { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
  };

  const env2 = buildEnv({ nsd: nsd2, cd: cd2 }, { seedCookie: seedCookie2 });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie2; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  env2.sandbox.XMLHttpRequest = RSXHR;

  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 3000));

  const openStr = RSXHR.prototype.open.toString();
  console.log(`XHR.open hooked: ${!openStr.includes('_method')}`);

  const xhr = new RSXHR();
  RSXHR.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

  const rsProps = [];
  for (const k in xhr) {
    if (k.startsWith('_$') || k.startsWith('_$$')) {
      rsProps.push(`${k}=${typeof xhr[k]}`);
    }
  }
  console.log(`RS props: ${rsProps.join(', ')}`);

  for (const k in xhr) {
    if (k.startsWith('_$') && typeof xhr[k] === 'boolean') {
      console.log(`Flag ${k} = ${xhr[k]}`);
    }
  }

  for (const k in xhr) {
    if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true;
  }

  for (const k in xhr) {
    if (k.startsWith('_$') && typeof xhr[k] === 'function') {
      const result = xhr[k].call(xhr, '{}');
      console.log(`Trampoline: "${String(result).substring(0, 80)}"`);
      if (result && typeof result === 'string' && result.length > 10) {
        console.log(`\n*** QUERY CAPTURED! ***`);
        console.log(`Query: ${result.substring(0, 80)}`);
        fs.writeFileSync(
          path.join(__dirname, 'output/capture-20080/query-captured.json'),
          JSON.stringify({ query: result, nsd: nsd2, cd: cd2, timestamp: new Date().toISOString() }, null, 2)
        );
      }
      break;
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
