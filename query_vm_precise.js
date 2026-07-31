/**
 * query_vm_precise.js — 精确定位 trampoline 函数并 dump VM 上下文
 *
 * trampoline 唯一特征: if(XX===1)return YY;
 * 搜索动态代码中的这个模式，定位 trampoline 函数
 * 从 trampoline 函数体提取 VM dispatcher 调用
 * 在 dispatcher 调用前插入 dump
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

(async () => {
  console.log('=== 精确定位 trampoline 并 dump VM 上下文 ===\n');

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

  // Patch eval: 精确定位 trampoline
  const origEval = env.sandbox.eval;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      console.log('Dyn code:', code.length);

      // 搜索 ===1)return 模式（trampoline 的 exit code 检查）
      const exitPattern = '===1)return';
      let pos = 0;
      let trampolineFound = false;

      while ((pos = code.indexOf(exitPattern, pos)) !== -1) {
        // 向前搜索到函数定义
        let funcStart = pos;
        while (funcStart > 0) {
          if (code.substring(funcStart, funcStart + 9) === 'function ') break;
          funcStart--;
        }

        if (funcStart > 0 && code.substring(funcStart, funcStart + 9) === 'function ') {
          // 找到函数定义
          const funcSrc = code.substring(funcStart, pos + exitPattern.length + 20);
          console.log(`\nFound trampoline at pos ${funcStart}:`);
          console.log(`  Source (${funcSrc.length} chars): ${funcSrc.substring(0, 200)}...`);

          // 在函数体中搜索 VM dispatcher 调用: func(ctx,0,ctx.prop.length,args)
          // 搜索 ",0," 后跟 ".length,"
          const callStart = funcSrc.indexOf(',0,');
          if (callStart >= 0) {
            const afterCall = funcSrc.substring(callStart);
            const lengthIdx = afterCall.indexOf('.length,');
            if (lengthIdx >= 0) {
              // 提取 ctx 变量名
              // 模式: ,0,CTX.PROP.length,ARGS)
              const callPart = afterCall.substring(0, lengthIdx + 10);
              const ctxMatch = callPart.match(/,0,(_\$[a-zA-Z0-9$]+)\.(_\$[a-zA-Z0-9$]+)\.length,(_\$[a-zA-Z0-9$]+)\)/);

              if (ctxMatch) {
                const ctxVar = ctxMatch[1];
                const prop = ctxMatch[2];
                const argsVar = ctxMatch[3];
                console.log(`  VM ctx: ${ctxVar}`);
                console.log(`  Bytecode prop: .${prop}`);
                console.log(`  Args: ${argsVar}`);

                // 在动态代码中搜索 ctxVar 的定义
                // 模式: ctxVar={ 或 ctxVar=new 或 ctxVar=
                // 找到 ctxVar 作为对象属性的赋值
                const searchPattern = ctxVar + '={';
                let assignPos = code.indexOf(searchPattern);
                if (assignPos < 0) {
                  // 尝试 ctxVar=new
                  const altPattern = ctxVar + '=new ';
                  assignPos = code.indexOf(altPattern);
                }
                if (assignPos < 0) {
                  // 尝试在函数定义附近搜索
                  // ctxVar 可能在 trampoline 函数之前被赋值
                  const beforeFunc = code.substring(Math.max(0, funcStart - 5000), funcStart);
                  const match = beforeFunc.lastIndexOf(ctxVar + '=');
                  if (match >= 0) {
                    assignPos = Math.max(0, funcStart - 5000) + match;
                  }
                }

                if (assignPos >= 0) {
                  console.log(`  Assignment at pos ${assignPos}: ${code.substring(assignPos, assignPos + 40)}`);

                  // 找到赋值结束位置
                  let end = assignPos;
                  let depth = 0;
                  while (end < code.length) {
                    if (code[end] === '{' || code[end] === '(' || code[end] === '[') depth++;
                    if (code[end] === '}' || code[end] === ')' || code[end] === ']') depth--;
                    if (depth === 0 && code[end] === ';') break;
                    end++;
                  }

                  // 在赋值后插入 dump
                  const insert = `;window.__vmCtx=${ctxVar};`;
                  code = code.substring(0, end + 1) + insert + code.substring(end + 1);
                  console.log(`  Inserted dump at pos ${end + 1}`);
                  trampolineFound = true;
                } else {
                  console.log(`  Assignment not found for ${ctxVar}`);
                  // 尝试在 VM dispatcher 调用前直接插入
                  // 在 code 中找到 trampoline 函数内的 dispatcher 调用位置
                  const fullCodePos = code.indexOf(ctxMatch[0], funcStart);
                  if (fullCodePos >= 0) {
                    // 在调用前插入 dump（在函数作用域内）
                    const insert = `window.__vmCtx=${ctxVar};`;
                    code = code.substring(0, fullCodePos) + insert + code.substring(fullCodePos);
                    console.log(`  Inserted dump before dispatcher call at pos ${fullCodePos}`);
                    trampolineFound = true;
                  }
                }
                break;
              }
            }
          }
        }
        pos += exitPattern.length;
      }

      if (!trampolineFound) {
        console.log('Trampoline not found via exit pattern, trying broader search...');
        // 搜索所有 ,0, 后跟 .length, 的位置
        let searchPos = 0;
        while ((searchPos = code.indexOf(',0,', searchPos)) !== -1) {
          const after = code.substring(searchPos, searchPos + 80);
          if (after.includes('.length,')) {
            // 提取变量名
            const match = after.match(/,0,(_\$[a-zA-Z0-9$]+)\.(_\$[a-zA-Z0-9$]+)\.length,(_\$[a-zA-Z0-9$]+)\)/);
            if (match) {
              const ctxVar = match[1];
              const prop = match[2];
              const argsVar = match[3];
              console.log(`  Found VM call: ctx=${ctxVar} prop=.${prop} args=${argsVar} at pos ${searchPos}`);

              // 找到 ( 前面的位置 — 这是函数调用的第一个参数
              // 模式: FUNC(ctxVar,0,ctxVar.prop.length,argsVar)
              // 向前找 ( 
              let parenPos = searchPos;
              while (parenPos > 0 && code[parenPos] !== '(') parenPos--;
              // ctxVar 在 ( 后面
              const ctxStart = parenPos + 1;
              const ctxEnd = ctxStart + ctxVar.length;

              // 验证
              if (code.substring(ctxStart, ctxEnd) === ctxVar) {
                // 用赋值表达式替换 ctxVar: (window.__vmCtx=ctxVar)
                // 这在语法上等价于 ctxVar，但会额外设置 window.__vmCtx
                const replacement = '(window.__vmCtx=' + ctxVar + ')';
                code = code.substring(0, ctxStart) + replacement + code.substring(ctxEnd);
                console.log(`  Replaced ${ctxVar} with assignment expression at pos ${ctxStart}`);
                trampolineFound = true;
                break;
              } else {
                console.log(`  ctxVar mismatch: expected ${ctxVar}, got ${code.substring(ctxStart, ctxEnd)}`);
              }
            }
          }
          searchPos += 3;
        }
      }

      // 保存 patched 代码
      fs.writeFileSync('/tmp/patched-precise.js', code);
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
      console.log(`Bytecode: [${bytecode.join(',')}]`);
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
    env.captured.errors.slice(0, 5).forEach(e => console.log('  ' + e.substring(0, 100)));
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
