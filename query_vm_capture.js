/**
 * query_vm_capture.js — 稳健捕获 VM bytecode
 *
 * 不用 regex，直接在 eval hook 中搜索动态代码的字符串模式
 * 找到 VM dispatcher 调用并 dump 上下文
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

(async () => {
  console.log('=== 稳健捕获 VM bytecode ===\n');

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

  // Patch eval: 不用 regex，直接搜索字符串
  const origEval = env.sandbox.eval;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      console.log('Dyn code:', code.length, 'bytes');
      // 保存动态代码用于分析
      fs.writeFileSync('/tmp/dyn-code-raw.js', code);

      // 搜索 ",0," 模式（VM dispatcher 调用的第二个参数总是 0）
      // 模式: func(ctx,0,ctx.prop.length,args)
      // 搜索: ",0," 后面跟 "._" 和 ".length,"
      let found = false;
      for (let i = 0; i < code.length - 60; i++) {
        // 查找 ",0," 模式
        if (code[i] === ',' && code[i+1] === '0' && code[i+2] === ',') {
          // 检查后面是否有 .length,
          const after = code.substring(i, i + 60);
          if (after.includes('.length,') && after.includes('_$')) {
            // 找到 VM dispatcher 调用！
            // 向前找函数名和 ctx 变量
            let start = i - 1;
            while (start > 0 && code[start] !== '(' && code[start] !== ';') start--;
            const before = code.substring(Math.max(0, start - 20), i);
            const fullCall = code.substring(start, i + 60);

            // 提取变量名
            const parts = fullCall.match(/(_\$[a-zA-Z0-9]+)/g);
            if (parts && parts.length >= 3) {
              const funcName = parts[0];
              const ctxVar = parts[1];
              console.log(`Found VM call at pos ${i}: ${funcName}(${ctxVar},0,...)`);
              console.log(`  Full: ${fullCall.substring(0, 80)}`);

              // 在调用前插入 dump
              const insert = `window.__vmCtx=${ctxVar};`;
              code = code.substring(0, start) + insert + code.substring(start);
              found = true;
              break;
            }
          }
        }
      }

      if (!found) {
        console.log('VM call not found, trying alternate search...');
        // 搜索 ".length," 模式
        let pos = 0;
        while ((pos = code.indexOf('.length,', pos)) !== -1) {
          const context = code.substring(Math.max(0, pos - 40), pos + 20);
          if (context.includes('_$') && context.includes(',0,')) {
            console.log(`  Found at ${pos}: ...${context}...`);
            // 提取 ctx 变量
            const match = context.match(/(_\$[a-zA-Z0-9]+)\.(_\$[a-zA-Z0-9]+)\.length/);
            if (match) {
              const ctxVar = match[1];
              console.log(`  ctx var: ${ctxVar}`);
              const insert = `window.__vmCtx=${ctxVar};`;
              code = code.substring(0, pos - 40) + insert + code.substring(pos - 40);
              found = true;
              break;
            }
          }
          pos += 8;
        }
      }

      console.log('Patch applied:', found);
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

    const ctxData = {};
    for (const k of keys) {
      const v = vm.runInContext(`window.__vmCtx['${k}']`, env.proxied);
      ctxData[k] = v;
      if (Array.isArray(v)) {
        console.log(`  ${k}: arr[${v.length}] = [${v.slice(0, 20).join(',')}${v.length > 20 ? '...' : ''}]`);
      } else {
        console.log(`  ${k}: ${typeof v} = ${v}`);
      }
    }

    // 保存 bytecode 和上下文
    const bytecodeKey = keys.find(k => Array.isArray(ctxData[k]) && ctxData[k].length > 20);
    if (bytecodeKey) {
      const bytecode = ctxData[bytecodeKey];
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/vm-bytecode.json'),
        JSON.stringify({
          bytecode: bytecode,
          bytecodeKey: bytecodeKey,
          ctxKeys: keys,
          ctxData: Object.fromEntries(Object.entries(ctxData).map(([k, v]) =>
            [k, Array.isArray(v) ? v : v]
          )),
          nsd: nsd,
          cd: cd,
          timestamp: new Date().toISOString(),
        }, null, 2)
      );
      console.log(`\nBytecode saved: ${bytecode.length} bytes`);
      console.log(`Bytecode: [${bytecode.join(',')}]`);

      // 尝试简单反编译
      console.log('\n=== 简单反编译 ===');
      let pos = 0;
      let opCount = 0;
      while (pos < bytecode.length && opCount < 30) {
        const op = bytecode[pos];
        const args = bytecode.slice(pos + 1, pos + 5);
        console.log(`  [${pos}] op=${op} args=[${args.join(',')}]`);
        pos += 1;
        opCount++;
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
      const result = tramp.call(xhr, '{}');
      console.log(`Trampoline result: "${String(result).substring(0, 80)}"`);
    }
  } else {
    console.log('No VM ctx captured');
    console.log('Errors:', env.captured.errors.length);
    env.captured.errors.slice(0, 3).forEach(e => console.log('  ' + e.substring(0, 100)));
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
