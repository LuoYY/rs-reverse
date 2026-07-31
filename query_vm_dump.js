/**
 * query_vm_dump.js — Patch trampoline，dump VM 上下文
 *
 * trampoline 源码已知：
 *   _$kE(_$iX, 0, _$iX._$hT.length, _$ej)  // VM dispatcher call
 *   _$_y = _$ej[4]  // exit code = 1
 *   _$hB = _$ej[5]  // return value = ""
 *
 * 策略：在 eval hook 中 patch 动态代码
 * 1. 找到 trampoline 中的 VM dispatcher 调用模式
 * 2. 在调用前插入 dump 代码：window.__vmCtx = _$iX
 * 3. 执行后检查 VM 上下文的属性
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

function createProtoXHR() {
  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    open: function(method, url) { this._method = method; this._url = String(url); this.readyState = 1; },
    send: function(body) { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
  };
  return RSXHR;
}

(async () => {
  console.log('=== Patch trampoline，dump VM 上下文 ===\n');

  // 获取挑战页
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  // 获取管线 cookie
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
  const RSXHR = createProtoXHR();
  env.sandbox.XMLHttpRequest = RSXHR;

  // Patch eval hook：在动态代码中插入 VM 上下文 dump
  const origEval = env.sandbox.eval;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      console.log('[Patch] 动态代码:', code.length, 'bytes');

      // 策略：找到 trampoline 中的 VM dispatcher 调用
      // 模式: _$xx(_$yy,0,_$yy._$zz.length,_$ww)
      // 在调用前插入: window.__vmCtx=_$yy;window.__vmArgs=_$ww;

      // 找到所有匹配: _\$xx(_$yy,0,_$yy._$zz.length,_$ww)
      const vmCallPattern = /(_\$[a-zA-Z0-9]{2,3})\((_\$[a-zA-Z0-9]{2,3}),0,(_\$[a-zA-Z0-9]{2,3})\.(_\$[a-zA-Z0-9]{2,3})\.length,(_\$[a-zA-Z0-9]{2,3})\)/g;

      let match;
      let patchCount = 0;
      let patched = code;

      while ((match = vmCallPattern.exec(code)) !== null) {
        const fullMatch = match[0];
        const dispatcher = match[1];
        const ctxVar = match[2];
        const ctxProp1 = match[3]; // _$yy
        const ctxProp2 = match[4]; // _$zz
        const argsVar = match[5]; // _$ww

        console.log(`[Patch] Found VM call: ${fullMatch.substring(0, 60)}...`);
        console.log(`  dispatcher=${dispatcher}, ctx=${ctxVar}, args=${argsVar}`);

        // 在 VM 调用前插入 dump
        const dumpCode = `window.__vmCtx=${ctxVar};window.__vmArgs=${argsVar};window.__vmDispatcher=${dispatcher};`;
        patched = patched.replace(fullMatch, dumpCode + fullMatch);
        patchCount++;
      }

      console.log(`[Patch] Total VM calls patched: ${patchCount}`);

      // 也搜索 return 语句模式: if(_$_y===1)return _$hB;
      // 替换为: return _$hB; (always return)
      const returnPattern = /if\(_\$[a-zA-Z0-9]{2,3}===1\)return\s+_\$[a-zA-Z0-9]{2,3};/g;
      const returnMatches = patched.match(returnPattern);
      console.log(`[Patch] Return patterns: ${returnMatches ? returnMatches.length : 0}`);

      // 保存 patched 代码
      fs.writeFileSync('/tmp/patched-vm-dump.js', patched);
      console.log('[Patch] Saved to /tmp/patched-vm-dump.js');

      code = patched;
    }
    return origEval.call(this, code);
  };

  // 执行外层 VM
  console.log('\n执行外层 VM...');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  try { vm.runInContext(outerJsCode, env.proxied, { timeout: 30000 }); } catch (e) { console.log('VM error:', e.message.substring(0, 80)); }

  await new Promise(r => setTimeout(r, 2000));

  // 检查 VM 上下文是否被 dump
  console.log('\n检查 VM 上下文...');
  const hasVmCtx = vm.runInContext('typeof window.__vmCtx', env.proxied);
  console.log(`  window.__vmCtx: ${hasVmCtx}`);

  if (hasVmCtx !== 'undefined') {
    // Dump VM 上下文属性
    const ctxKeys = vm.runInContext('Object.keys(window.__vmCtx)', env.proxied);
    console.log(`  VM context keys: ${JSON.stringify(ctxKeys)}`);

    // Dump 每个属性
    for (const key of ctxKeys) {
      const val = vm.runInContext(`window.__vmCtx['${key}']`, env.proxied);
      const type = typeof val;
      let desc;
      if (type === 'string') {
        desc = `str[${val.length}]: ${val.substring(0, 50)}`;
      } else if (type === 'number') {
        desc = `num: ${val}`;
      } else if (type === 'boolean') {
        desc = `bool: ${val}`;
      } else if (Array.isArray(val)) {
        desc = `arr[${val.length}]: [${val.slice(0, 5).join(',')}...]`;
      } else if (type === 'object' && val !== null) {
        desc = `obj: {${Object.keys(val).slice(0, 5).join(',')}}`;
      } else if (type === 'function') {
        desc = `fn: ${val.toString().substring(0, 60)}`;
      } else {
        desc = `${type}: ${String(val).substring(0, 50)}`;
      }
      console.log(`    ${key} = ${desc}`);
    }

    // 特别检查 _$dX (cache flag)
    const dXKey = ctxKeys.find(k => k.match(/^_\$[a-zA-Z0-9]{2,3}$/) && typeof vm.runInContext(`window.__vmCtx['${k}']`, env.proxied) === 'boolean');
    if (dXKey) {
      const dXVal = vm.runInContext(`window.__vmCtx['${dXKey}']`, env.proxied);
      console.log(`\n  *** Cache flag ${dXKey} = ${dXVal} ***`);

      // 尝试设置为 true（启用缓存路径）
      vm.runInContext(`window.__vmCtx['${dXKey}'] = true`, env.proxied);
      console.log(`  Set ${dXKey} = true`);
    }

    // 检查 _$hT (bytecode)
    const hTKey = ctxKeys.find(k => {
      const v = vm.runInContext(`window.__vmCtx['${k}']`, env.proxied);
      return typeof v === 'string' && v.length > 100;
    });
    if (hTKey) {
      const hTVal = vm.runInContext(`window.__vmCtx['${hTKey}']`, env.proxied);
      console.log(`\n  *** Bytecode ${hTKey} = str[${hTVal.length}] ***`);
      console.log(`  First 50 chars: ${hTVal.substring(0, 50)}`);
    }
  }

  // 触发 XHR POST
  console.log('\n触发 XHR POST...');
  try {
    const xhr = new RSXHR();
    RSXHR.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

    // 强制 flag=true
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') {
        xhr[k] = true;
        console.log(`Forced ${k}=true`);
      }
    }

    // 调用 trampoline
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'function') {
        console.log(`\nCalling trampoline ${k}...`);

        // 在调用前再次 dump VM 上下文
        const ctxBefore = vm.runInContext('window.__vmCtx ? Object.keys(window.__vmCtx) : "no ctx"', env.proxied);
        console.log(`  VM ctx before: ${ctxBefore}`);

        const result = xhr[k].call(xhr, '{}');
        console.log(`  Result: ${typeof result} = "${String(result).substring(0, 80)}"`);

        // 在调用后检查 VM 上下文变化
        if (hasVmCtx !== 'undefined') {
          const argsAfter = vm.runInContext('window.__vmArgs ? [typeof window.__vmArgs[4], typeof window.__vmArgs[5], String(window.__vmArgs[5]).substring(0, 50)] : "no args"', env.proxied);
          console.log(`  VM args after: ${argsAfter}`);

          const ctxAfter = vm.runInContext('window.__vmCtx ? Object.keys(window.__vmCtx).map(k => k + ":" + typeof window.__vmCtx[k]).join(",") : "no ctx"', env.proxied);
          console.log(`  VM ctx after: ${ctxAfter?.substring(0, 200)}`);
        }

        break;
      }
    }
  } catch (e) {
    console.log('XHR error:', e.message.substring(0, 100));
  }

  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
