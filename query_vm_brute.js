/**
 * query_vm_brute.js — 暴力测试 VM 上下文的 _$eu 值
 *
 * VM context: { _$eu: 5, _$jH: 1, _$b1: bytecode[106], _$_9: arr[2], _$gt: arr[0] }
 * _$eu=5 可能控制 query 生成。尝试 0-20 看哪个值能让 trampoline 返回非空字符串。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url) {
  return new Promise(r => {
    https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '' }));
  });
}

(async () => {
  console.log('=== 暴力测试 VM _$eu 值 ===\n');

  // 获取挑战页 + 管线 cookie
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

  // 构建沙箱
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const env = buildEnv({ nsd, cd }, { seedCookie });

  // 锁定 P cookie
  const pMatch = seedCookie.match(/(aoU85Lxl9xxNP)=[^;]+/);
  const pName2 = pMatch ? pMatch[1] : null;
  const origDoc = env.sandbox.document;
  env.sandbox.document = new Proxy(origDoc, {
    get(target, prop) { if (prop === 'cookie') return seedCookie; return target[prop]; },
    set(target, prop, value) {
      if (prop === 'cookie' && pName2 && String(value).includes(pName2 + '=')) return true;
      target[prop] = value; return true;
    },
  });

  // 原型 XHR
  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    open: function(method, url) { this._method = method; this._url = String(url); this.readyState = 1; },
    send: function(body) { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
  };
  env.sandbox.XMLHttpRequest = RSXHR;

  // Patch eval: dump VM context + bytecode
  const origEval = env.sandbox.eval;
  let vmCtxName = null;
  let bytecodeArr = null;
  let allCtxKeys = null;

  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      // 找到 VM dispatcher 调用
      const vmCallPattern = /(_\$[a-zA-Z0-9]{2,3})\((_\$[a-zA-Z0-9]{2,3}),0,(_\$[a-zA-Z0-9]{2,3})\.(_\$[a-zA-Z0-9]{2,3})\.length,(_\$[a-zA-Z0-9]{2,3})\)/g;
      let match;
      while ((match = vmCallPattern.exec(code)) !== null) {
        const ctxVar = match[2];
        // 插入 dump
        const dumpCode = `window.__vmCtx=${ctxVar};`;
        code = code.replace(match[0], dumpCode + match[0]);
        vmCtxName = ctxVar;
        break; // 只 patch 第一个
      }
    }
    return origEval.call(this, code);
  };

  // 执行外层 VM
  console.log('执行外层 VM...');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  try { vm.runInContext(outerJsCode, env.proxied, { timeout: 30000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 VM 上下文
  const hasCtx = vm.runInContext('typeof window.__vmCtx', env.proxied);
  console.log(`VM context: ${hasCtx}`);

  if (hasCtx === 'undefined') {
    console.log('No VM context captured');
    process.exit(1);
  }

  allCtxKeys = vm.runInContext('Object.keys(window.__vmCtx)', env.proxied);
  console.log('VM context keys:', allCtxKeys);

  // 获取每个属性的值
  const ctxValues = {};
  for (const key of allCtxKeys) {
    const val = vm.runInContext(`window.__vmCtx['${key}']`, env.proxied);
    ctxValues[key] = val;
    console.log(`  ${key}: ${typeof val} = ${typeof val === 'number' ? val : typeof val === 'string' ? val.substring(0, 30) : Array.isArray(val) ? 'arr[' + val.length + ']' : typeof val}`);
  }

  // 获取 bytecode
  const bytecodeKey = allCtxKeys.find(k => Array.isArray(ctxValues[k]) && ctxValues[k].length > 50);
  if (bytecodeKey) {
    bytecodeArr = ctxValues[bytecodeKey];
    console.log(`\nBytecode (${bytecodeKey}): ${bytecodeArr.length} elements`);
    console.log(`  First 20: [${bytecodeArr.slice(0, 20).join(',')}]`);
  }

  // 获取 state key (_$eu = 5)
  const stateKey = allCtxKeys.find(k => typeof ctxValues[k] === 'number');
  if (stateKey) {
    console.log(`\nState variable: ${stateKey} = ${ctxValues[stateKey]}`);
  }

  // 创建 XHR 并获取 trampoline
  const xhr = new RSXHR();
  RSXHR.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

  // 强制 flag=true
  for (const k in xhr) {
    if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true;
  }

  // 找到 trampoline
  let trampoline = null;
  let trampName = null;
  for (const k in xhr) {
    if (k.startsWith('_$') && typeof xhr[k] === 'function') {
      trampoline = xhr[k];
      trampName = k;
      break;
    }
  }

  if (!trampoline) {
    console.log('No trampoline found');
    process.exit(1);
  }

  console.log(`\nTrampoline: ${trampName}`);

  // 测试原始值
  console.log('\n=== 测试原始 _$eu 值 ===');
  const origResult = trampoline.call(xhr, '{}');
  console.log(`  _$eu=${ctxValues[stateKey]}: result="${String(origResult).substring(0, 80)}"`);

  // 暴力测试 _$eu = 0..20
  console.log('\n=== 暴力测试 _$eu 值 ===');
  for (let testVal = 0; testVal <= 20; testVal++) {
    try {
      // 设置 _$eu 为测试值
      vm.runInContext(`window.__vmCtx['${stateKey}'] = ${testVal}`, env.proxied);

      // 重新创建 XHR（清除 RS 设置的状态）
      const xhr2 = new RSXHR();
      RSXHR.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
      for (const k in xhr2) {
        if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true;
      }

      // 找到 trampoline
      let tramp2 = null;
      for (const k in xhr2) {
        if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; }
      }

      if (tramp2) {
        const result = tramp2.call(xhr2, '{}');
        const resultStr = String(result);
        if (resultStr.length > 5) {
          console.log(`  *** _$eu=${testVal}: result="${resultStr.substring(0, 80)}" ***`);
        } else {
          console.log(`  _$eu=${testVal}: result="${resultStr}"`);
        }
      }
    } catch (e) {
      console.log(`  _$eu=${testVal}: error: ${e.message.substring(0, 60)}`);
    }
  }

  // 也测试修改其他属性
  console.log('\n=== 测试修改其他 VM 属性 ===');

  // 测试 _$jH (exit code)
  const exitKey = allCtxKeys.find(k => typeof ctxValues[k] === 'number' && k !== stateKey);
  if (exitKey) {
    console.log(`\nTesting ${exitKey} (current=${ctxValues[exitKey]}):`);
    for (let testVal = 0; testVal <= 5; testVal++) {
      try {
        vm.runInContext(`window.__vmCtx['${stateKey}'] = 5`, env.proxied); // reset state
        vm.runInContext(`window.__vmCtx['${exitKey}'] = ${testVal}`, env.proxied);

        const xhr3 = new RSXHR();
        RSXHR.prototype.open.call(xhr3, 'POST', '/test', true);
        for (const k in xhr3) {
          if (k.startsWith('_$') && typeof xhr3[k] === 'boolean') xhr3[k] = true;
        }
        let tramp3 = null;
        for (const k in xhr3) {
          if (k.startsWith('_$') && typeof xhr3[k] === 'function') { tramp3 = xhr3[k]; break; }
        }
        if (tramp3) {
          const result = tramp3.call(xhr3, '{}');
          const resultStr = String(result);
          if (resultStr.length > 5) {
            console.log(`  *** ${exitKey}=${testVal}: "${resultStr.substring(0, 80)}" ***`);
          } else {
            console.log(`  ${exitKey}=${testVal}: "${resultStr}"`);
          }
        }
      } catch (e) {}
    }
  }

  // 保存 bytecode 供分析
  if (bytecodeArr) {
    fs.writeFileSync(
      path.join(ROOT, 'output/capture-20080/vm-bytecode.json'),
      JSON.stringify({ bytecode: bytecodeArr, ctxKeys: allCtxKeys, stateValue: ctxValues[stateKey], exitValue: ctxValues[exitKey] }, null, 2)
    );
    console.log('\nBytecode saved to output/capture-20080/vm-bytecode.json');
  }

  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
