/**
 * query_vm_direct.js — 直接从 trampoline 源码提取 VM 上下文
 *
 * 不搜索整个动态代码，而是：
 * 1. 执行动态代码
 * 2. 从 XHR 实例获取 trampoline 函数
 * 3. 打印完整源码
 * 4. 用字符串搜索（非 regex）找到 VM dispatcher 调用
 * 5. 提取变量名
 * 6. 在动态代码中搜索赋值位置
 * 7. 重新执行 patched 代码
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

const { httpGet } = require('./proxy_http');

(async () => {
  console.log('=== 直接从 trampoline 提取 VM 上下文 ===\n');

  const ch = await httpGet(TARGET);
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

  // ---- Pass 1: 执行动态代码，获取 trampoline 源码 ----
  console.log('[Pass 1] 执行动态代码，获取 trampoline...');

  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  env1.sandbox.document = new Proxy(env1.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });

  function RSXHR1() {}
  RSXHR1.prototype = {
    open: function(m, u) { this._url = String(u); this.readyState = 1; },
    send: function() { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState: 0, status: 0, responseText: '', responseURL: '',
  };
  env1.sandbox.XMLHttpRequest = RSXHR1;

  // 捕获动态代码
  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) { dynCode = code; }
    return origEval1.call(this, code);
  };

  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 trampoline
  const xhr1 = new RSXHR1();
  RSXHR1.prototype.open.call(xhr1, 'POST', '/test', true);
  let trampSrc = null;
  for (const k in xhr1) {
    if (k.startsWith('_$') && typeof xhr1[k] === 'function') {
      trampSrc = xhr1[k].toString();
      console.log(`Trampoline: ${k} (${trampSrc.length} chars)`);
      break;
    }
  }

  if (!trampSrc) { console.log('No trampoline'); process.exit(1); }

  // 打印完整源码
  console.log('\n=== Full trampoline source ===');
  console.log(trampSrc);

  // 搜索 ,0, 在 trampoline 源码中
  const idx0 = trampSrc.indexOf(',0,');
  console.log(`\n,0, found at: ${idx0}`);

  if (idx0 >= 0) {
    // 提取 ,0, 后面的内容
    const after = trampSrc.substring(idx0);
    console.log(`After ,0,: ${after.substring(0, 80)}`);

    // 搜索 .length,
    const lenIdx = after.indexOf('.length,');
    console.log(`.length, found at: ${lenIdx}`);

    if (lenIdx >= 0) {
      // 提取完整模式: ,0,CTX.PROP.length,ARGS)
      const pattern = after.substring(0, lenIdx + 20);
      console.log(`Pattern: ${pattern}`);

      // 手动提取变量名
      // ,0,_$xx._$yy.length,_$zz)
      const parts = pattern.match(/,0,([^( )]+)\.([^( )]+)\.length,([^( )]+)\)/);
      if (parts) {
        const ctxVar = parts[1];
        const prop = parts[2];
        const argsVar = parts[3];
        console.log(`\nVM context: ${ctxVar}`);
        console.log(`Bytecode prop: .${prop}`);
        console.log(`Args: ${argsVar}`);

        // ---- Pass 2: patch 动态代码，暴露 VM 上下文 ----
        console.log('\n[Pass 2] Patch 动态代码...');

        if (dynCode) {
          // 在动态代码中找到 trampoline 函数内的 dispatcher 调用
          // 搜索 ,0,ctxVar. 在动态代码中
          const searchStr = ',0,' + ctxVar + '.';
          const callPos = dynCode.indexOf(searchStr);
          console.log(`Dispatcher call in dyn code at: ${callPos}`);

          if (callPos >= 0) {
            // 找到 ( 前面的位置
            let parenPos = callPos;
            while (parenPos > 0 && dynCode[parenPos] !== '(') parenPos--;

            // ctxVar 在 ( 后面
            const ctxStart = parenPos + 1;
            const ctxEnd = ctxStart + ctxVar.length;

            if (dynCode.substring(ctxStart, ctxEnd) === ctxVar) {
              // 用赋值表达式替换
              const replacement = '(window.__vmCtx=' + ctxVar + ')';
              const patchedCode = dynCode.substring(0, ctxStart) + replacement + dynCode.substring(ctxEnd);
              console.log('Patched!');

              // ---- Pass 3: 执行 patched 代码 ----
              console.log('\n[Pass 3] 执行 patched 代码...');

              const env2 = buildEnv({ nsd, cd }, { seedCookie });
              env2.sandbox.document = new Proxy(env2.sandbox.document, {
                get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
                set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
              });

              function RSXHR2() {}
              RSXHR2.prototype = { ...RSXHR1.prototype };
              env2.sandbox.XMLHttpRequest = RSXHR2;

              // eval hook: 执行 patched 代码
              const origEval2 = env2.sandbox.eval;
              let patched = false;
              env2.sandbox.eval = function(code) {
                if (typeof code === 'string' && code.length > 50000 && !patched) {
                  patched = true;
                  console.log('Executing patched code...');
                  return origEval2.call(this, patchedCode);
                }
                return origEval2.call(this, code);
              };

              try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
              await new Promise(r => setTimeout(r, 2000));

              // 检查 VM 上下文
              const hasCtx = vm.runInContext('typeof window.__vmCtx', env2.proxied);
              console.log(`\nVM ctx: ${hasCtx}`);

              if (hasCtx !== 'undefined') {
                const keys = vm.runInContext('Object.keys(window.__vmCtx)', env2.proxied);
                console.log('Keys:', keys);

                for (const k of keys) {
                  const v = vm.runInContext(`window.__vmCtx['${k}']`, env2.proxied);
                  if (Array.isArray(v)) {
                    console.log(`  ${k}: arr[${v.length}] = [${v.slice(0, 20).join(',')}${v.length > 20 ? '...' : ''}]`);
                  } else {
                    console.log(`  ${k}: ${typeof v} = ${v}`);
                  }
                }

                // 保存 bytecode
                const bcKey = keys.find(k => {
                  const v = vm.runInContext(`window.__vmCtx['${k}']`, env2.proxied);
                  return Array.isArray(v) && v.length > 20;
                });
                if (bcKey) {
                  const bytecode = vm.runInContext(`window.__vmCtx['${bcKey}']`, env2.proxied);
                  fs.writeFileSync(
                    path.join(ROOT, 'output/capture-20080/vm-bytecode.json'),
                    JSON.stringify({ bytecode, bcKey, ctxKeys: keys, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
                  );
                  console.log(`\nBytecode saved: ${bytecode.length} bytes`);
                  console.log(`Bytecode: [${bytecode.join(',')}]`);
                }

                // 触发 trampoline
                console.log('\n触发 trampoline...');
                const xhr2 = new RSXHR2();
                RSXHR2.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
                for (const k in xhr2) {
                  if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true;
                }
                let tramp2 = null;
                for (const k in xhr2) {
                  if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; }
                }
                if (tramp2) {
                  const result = tramp2.call(xhr2, '{}');
                  console.log(`Trampoline result: "${String(result).substring(0, 80)}"`);
                }
              } else {
                console.log('No VM ctx captured');
              }
            } else {
              console.log(`ctxVar mismatch!`);
            }
          } else {
            console.log(`Dispatcher call not found in dyn code`);
          }
        } else {
          console.log('No dynamic code captured');
        }
      } else {
        console.log('Could not extract variable names from pattern');
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
