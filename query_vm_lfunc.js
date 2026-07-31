/**
 * query_vm_lfunc.js — 用 $_ts.l__ 探索 VM 内部
 *
 * $_ts.l__ = function _$k6(){var _$e5=[186];...return _$$g.apply(this,_$e5);}
 * 这是 RS 留在 $_ts 上的唯一函数，调用 VM dispatcher _$$g
 *
 * 策略：
 * 1. 调用 $_ts.l__ 探索 VM 功能
 * 2. 用不同参数测试，找到能返回 query 值的调用
 * 3. 如果 l__ 内部能访问 VM 上下文，dump 它
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

(async () => {
  console.log('=== 用 $_ts.l__ 探索 VM 内部 ===\n');

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

  // Patch eval: 捕获动态代码 + 插入 VM 上下文 dump
  const origEval = env.sandbox.eval;
  let dynCodeSaved = null;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      dynCodeSaved = code;
      console.log('Dyn code captured:', code.length);

      // 搜索 trampoline 中的 VM dispatcher 调用
      // 模式: func(ctx,0,ctx.prop.length,args)
      // 搜索 ",0," 后跟 ".length,"
      for (let i = 0; i < code.length - 60; i++) {
        if (code.substring(i, i + 3) === ',0,' && code.substring(i, i + 60).includes('.length,')) {
          // 向前搜索找到函数调用开始
          let start = i;
          while (start > 0 && code[start] !== '(' && code[start] !== ';' && code[start] !== '{') start--;
          if (code[start] === '(') {
            // 向前找函数名
            let fnEnd = start;
            let fnStart = fnEnd - 1;
            while (fnStart > 0 && /[_$a-zA-Z0-9]/.test(code[fnStart])) fnStart--;
            const fnName = code.substring(fnStart + 1, fnEnd);
            if (fnName.startsWith('_$')) {
              // 提取 ctx 变量名（第一个参数）
              const args = code.substring(start + 1, i + 60);
              const ctxMatch = args.match(/^(_\$[a-zA-Z0-9]+),0,/);
              if (ctxMatch) {
                const ctxVar = ctxMatch[1];
                console.log(`VM call: ${fnName}(${ctxVar},0,${ctxVar}.xxx.length,...) at pos ${start}`);

                // 在动态代码中搜索 ctxVar 的赋值
                // 通常: ctxVar = {prop1:val1, prop2:val2, ...}
                // 或: ctxVar = new SomeClass(...)
                // 在赋值后插入 window.__vmCtx = ctxVar

                // 搜索 ctxVar = 模式
                const assignPattern = ctxVar + '=';
                let assignPos = code.indexOf(assignPattern);
                while (assignPos >= 0) {
                  // 检查是否是赋值（前面是 ; 或 { 或 , ）
                  const before = code[assignPos - 1];
                  if (before === ';' || before === '{' || before === ',' || before === '(' || before === ' ') {
                    console.log(`  Found assignment at pos ${assignPos}: ${code.substring(assignPos, assignPos + 40)}`);
                    // 找到赋值结束（; 或 ,）
                    let end = assignPos + ctxVar.length + 1;
                    let depth = 0;
                    while (end < code.length) {
                      if (code[end] === '{' || code[end] === '(' || code[end] === '[') depth++;
                      if (code[end] === '}' || code[end] === ')' || code[end] === ']') depth--;
                      if (depth === 0 && (code[end] === ';' || code[end] === ',')) break;
                      end++;
                    }
                    // 在赋值后插入 dump
                    const insert = `;window.__vmCtx=${ctxVar};`;
                    code = code.substring(0, end) + insert + code.substring(end);
                    console.log(`  Inserted dump at pos ${end}`);
                    break;
                  }
                  assignPos = code.indexOf(assignPattern, assignPos + 1);
                }
                break;
              }
            }
          }
        }
      }
    }
    return origEval.call(this, code);
  };

  // 执行外层 VM
  console.log('\n执行外层 VM...');
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 检查 VM 上下文
  const hasCtx = vm.runInContext('typeof window.__vmCtx', env.proxied);
  console.log(`\nVM ctx: ${hasCtx}`);

  if (hasCtx !== 'undefined') {
    const keys = vm.runInContext('Object.keys(window.__vmCtx)', env.proxied);
    console.log('Keys:', keys);

    for (const k of keys) {
      const v = vm.runInContext(`window.__vmCtx['${k}']`, env.proxied);
      if (Array.isArray(v)) {
        console.log(`  ${k}: arr[${v.length}] = [${v.slice(0, 20).join(',')}${v.length > 20 ? '...' : ''}]`);
      } else {
        console.log(`  ${k}: ${typeof v} = ${v}`);
      }
    }

    // 保存 bytecode
    const bcKey = keys.find(k => {
      const v = vm.runInContext(`window.__vmCtx['${k}']`, env.proxied);
      return Array.isArray(v) && v.length > 20;
    });
    if (bcKey) {
      const bytecode = vm.runInContext(`window.__vmCtx['${bcKey}']`, env.proxied);
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/vm-bytecode.json'),
        JSON.stringify({ bytecode, bcKey, ctxKeys: keys, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
      );
      console.log(`\nBytecode saved: ${bytecode.length} bytes`);
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
      const result = tramp.call(xhr, '{}');
      console.log(`Trampoline result: "${String(result).substring(0, 80)}"`);
    }
  } else {
    console.log('No VM ctx captured');
    // 检查 $_ts.l__
    const lSrc = vm.runInContext('$_ts.l__.toString()', env.proxied);
    console.log(`\n$_ts.l__ source: ${lSrc}`);

    // 尝试调用 l__
    console.log('\n尝试调用 $_ts.l__...');
    try {
      const result = vm.runInContext('$_ts.l__("test")', env.proxied);
      console.log(`l__("test"): ${typeof result} = ${String(result).substring(0, 80)}`);
    } catch (e) { console.log(`l__("test") error: ${e.message.substring(0, 80)}`); }

    try {
      const result = vm.runInContext('$_ts.l__()', env.proxied);
      console.log(`l__(): ${typeof result} = ${String(result).substring(0, 80)}`);
    } catch (e) { console.log(`l__() error: ${e.message.substring(0, 80)}`); }

    try {
      const result = vm.runInContext('$_ts.l__("query")', env.proxied);
      console.log(`l__("query"): ${typeof result} = ${String(result).substring(0, 80)}`);
    } catch (e) { console.log(`l__("query") error: ${e.message.substring(0, 80)}`); }

    // 尝试用 l__ 传递 XHR 对象
    try {
      const xhr2 = new RSXHR();
      RSXHR.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      for (const k in xhr2) {
        if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true;
      }
      vm.runInContext('window.__testXHR = arguments[0]', env.proxied, [xhr2]);
      const result = vm.runInContext('$_ts.l__(window.__testXHR)', env.proxied);
      console.log(`l__(xhr): ${typeof result} = ${String(result).substring(0, 80)}`);
    } catch (e) { console.log(`l__(xhr) error: ${e.message.substring(0, 80)}`); }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
