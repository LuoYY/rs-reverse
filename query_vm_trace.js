/**
 * query_vm_trace.js — Hook VM dispatcher 追踪操作码
 *
 * 已知：trampoline 调用 VM dispatcher（如 _$iB/_$bb/_$kE）
 * VM dispatcher 执行 bytecode，内部有条件判断导致 query 生成被跳过
 *
 * 策略：patch 动态代码，用 logging wrapper 包裹 VM dispatcher
 * 追踪所有操作码执行，找到跳过条件
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

(async () => {
  console.log('=== Hook VM dispatcher 追踪操作码 ===\n');

  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  const { PmosXjClient } = require('./pmos_xj_client');
  const client = new PmosXjClient();
  await client.init();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;

  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const env = buildEnv({ nsd, cd }, { seedCookie });
  env.sandbox.document = new Proxy(env.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });

  function RSXHR() {}
  RSXHR.prototype = {
    open: function(m, u) { this._url = String(u); this.readyState = 1; },
    send: function() { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState: 0, status: 0, responseText: '', responseURL: '',
  };
  env.sandbox.XMLHttpRequest = RSXHR;

  // Patch eval: wrap VM dispatcher with logging
  const origEval = env.sandbox.eval;
  let dispatcherName = null;
  let ctxVarName = null;

  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      console.log('Dyn code:', code.length);

      // 找到 VM dispatcher 调用: _\$xx(_$yy,0,_$yy._$zz.length,_$ww)
      const pattern = /(_\$[a-zA-Z0-9]+)\((_\$[a-zA-Z0-9]+),0,(_\$[a-zA-Z0-9]+)\.(_\$[a-zA-Z0-9]+)\.length,(_\$[a-zA-Z0-9]+)\)/g;
      let match;
      while ((match = pattern.exec(code)) !== null) {
        dispatcherName = match[1];
        ctxVarName = match[2];
        console.log(`VM dispatcher: ${dispatcherName}(${ctxVarName},...)`);

        // 在动态代码开头插入 dispatcher wrapper
        // 但我们不知道 dispatcher 的定义位置
        // 改为：在 VM 调用前插入 dump
        const insert = `window.__vmCtx=${ctxVarName};window.__vmArgs=${match[5]};`;
        code = code.replace(match[0], insert + match[0]);
        break;
      }

      // 也搜索 dispatcher 函数定义
      // 模式: function _$xx(_$yy,_$zz,_$AA,_$BB){...while...switch...}
      const defPattern = new RegExp('function\\s+' + (dispatcherName || '_\\$[a-zA-Z0-9]+') + '\\s*\\(', 'g');
      const defMatch = code.match(defPattern);
      console.log('Dispatcher definitions:', defMatch ? defMatch.length : 0);

      // 在 dispatcher 定义后插入 logging
      if (dispatcherName) {
        // 找到 dispatcher 函数体开始位置
        const defIdx = code.indexOf('function ' + dispatcherName + '(');
        if (defIdx >= 0) {
          // 找到函数体的第一个 {
          let braceIdx = code.indexOf('{', defIdx);
          if (braceIdx >= 0) {
            // 在函数体开头插入 logging
            const logCode = `
              if(!window.__vmLog) window.__vmLog=[];
              window.__vmLog.push({op:'enter',ctx:typeof ${ctxVarName},args:typeof ${match ? match[5] : 'undefined'}});
            `;
            code = code.substring(0, braceIdx + 1) + logCode + code.substring(braceIdx + 1);
            console.log('Inserted logging at dispatcher body');
          }
        }
      }
    }
    return origEval.call(this, code);
  };

  // 执行外层 VM
  console.log('\n执行外层 VM...');
  try { vm.runInContext(OUTER_JS ? fs.readFileSync(OUTER_JS, 'utf8') : '', env.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 检查 VM 上下文
  const hasCtx = vm.runInContext('typeof window.__vmCtx', env.proxied);
  console.log(`\nVM ctx: ${hasCtx}`);

  if (hasCtx !== 'undefined') {
    const keys = vm.runInContext('Object.keys(window.__vmCtx)', env.proxied);
    console.log('Keys:', keys);

    // 获取 bytecode
    for (const k of keys) {
      const v = vm.runInContext(`window.__vmCtx['${k}']`, env.proxied);
      if (Array.isArray(v) && v.length > 50) {
        console.log(`\nBytecode (${k}): ${v.length} elements`);
        console.log(`  First 30: [${v.slice(0, 30).join(',')}]`);

        // 保存 bytecode
        fs.writeFileSync(
          path.join(ROOT, 'output/capture-20080/vm-bytecode.json'),
          JSON.stringify({ bytecode: v, ctxKeys: keys, source: 'query_vm_trace' }, null, 2)
        );
        console.log('Bytecode saved');

        // 尝试解码 bytecode
        // JSVMP bytecode: 每个操作码是 1-2 个数字
        // 第一个数字是操作码 ID，后面是参数
        console.log('\n=== Bytecode decompile attempt ===');
        let pos = 0;
        let count = 0;
        while (pos < v.length && count < 50) {
          const opcode = v[pos];
          console.log(`  [${pos}] op=${opcode} args=[${v.slice(pos + 1, pos + 5).join(',')}...]`);
          pos += 1; // 至少跳过操作码
          // 根据操作码决定参数数量（需要操作码表）
          // 暂时每次跳 1
          count++;
        }
        break;
      }
    }

    // 触发 trampoline
    console.log('\n触发 trampoline...');
    const xhr = new RSXHR();
    RSXHR.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true;
    }
    let tramp = null;
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; }
    }

    if (tramp) {
      console.log('Calling trampoline...');
      // 清空 VM log
      vm.runInContext('window.__vmLog = []', env.proxied);

      const result = tramp.call(xhr, '{}');
      console.log(`Result: "${String(result).substring(0, 80)}"`);

      // 检查 VM log
      const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env.proxied);
      console.log(`VM log entries: ${logLen}`);

      if (logLen > 0) {
        const log = vm.runInContext('JSON.stringify(window.__vmLog.slice(0, 10))', env.proxied);
        console.log(`First 10: ${log?.substring(0, 300)}`);
      }
    }
  } else {
    console.log('No VM ctx captured');
    console.log('Errors:', env.captured.errors.length);
    env.captured.errors.slice(0, 3).forEach(e => console.log('  ' + e.substring(0, 100)));
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
