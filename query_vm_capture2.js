/**
 * query_vm_capture2.js — 从 trampoline 源码提取 VM 上下文变量名
 *
 * 1. 执行动态代码
 * 2. 获取 trampoline 函数源码
 * 3. 从源码提取 VM dispatcher 调用: func(ctx,0,ctx.prop.length,args)
 * 4. 用变量名在动态代码中找到赋值位置
 * 5. 在赋值后插入 window.__vmCtx = ctx
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

(async () => {
  console.log('=== 从 trampoline 提取 VM 上下文 ===\n');

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

  // 执行外层 VM（不 patch eval）
  console.log('执行外层 VM...');
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 获取 trampoline 源码
  console.log('\n获取 trampoline 源码...');
  const xhr = new RSXHR();
  RSXHR.prototype.open.call(xhr, 'POST', '/test', true);

  let trampSrc = null;
  let trampName = null;
  for (const k in xhr) {
    if (k.startsWith('_$') && typeof xhr[k] === 'function') {
      trampSrc = xhr[k].toString();
      trampName = k;
      break;
    }
  }

  if (!trampSrc) {
    console.log('No trampoline found');
    process.exit(1);
  }

  console.log(`Trampoline: ${trampName}`);
  console.log(`Source (${trampSrc.length} chars): ${trampSrc.substring(0, 200)}...`);

  // 从源码提取 VM dispatcher 调用
  // 模式: func(ctx,0,ctx.prop.length,args)
  // 在源码中搜索 ",0," 后跟 ".length,"
  const vmCallMatch = trampSrc.match(/(_\$[a-zA-Z0-9]+)\((_\$[a-zA-Z0-9]+),0,(_\$[a-zA-Z0-9]+)\.(_\$[a-zA-Z0-9]+)\.length,(_\$[a-zA-Z0-9]+)\)/);
  if (vmCallMatch) {
    const dispatcher = vmCallMatch[1];
    const ctxVar = vmCallMatch[2];
    const ctxVar2 = vmCallMatch[3];
    const prop = vmCallMatch[4];
    const argsVar = vmCallMatch[5];

    console.log(`\nVM dispatcher: ${dispatcher}`);
    console.log(`VM context: ${ctxVar} (== ${ctxVar2}?)`);
    console.log(`Bytecode prop: .${prop}`);
    console.log(`Args: ${argsVar}`);

    // 从 trampoline 源码提取更多信息
    // 查找 if(ctx.prop) 模式 — 这是 cache flag 检查
    const cacheFlagMatch = trampSrc.match(new RegExp('if\\(' + ctxVar.replace(/\$/, '\\$') + '\\.(_\\$[a-zA-Z0-9]+)\\)'));
    if (cacheFlagMatch) {
      console.log(`Cache flag: ${ctxVar}.${cacheFlagMatch[1]}`);
    }

    // 查找 exit code 检查
    const exitMatch = trampSrc.match(/if\((_\$[a-zA-Z0-9]+)===1\)return/);
    if (exitMatch) {
      console.log(`Exit code var: ${exitMatch[1]}`);
    }

    // 查找 return value
    const returnMatch = trampSrc.match(/return\s+(_\$[a-zA-Z0-9]+);/);
    if (returnMatch) {
      console.log(`Return value var: ${returnMatch[1]}`);
    }

    // 现在用这些变量名在动态代码中搜索
    // 读取保存的动态代码
    const dynCode = fs.readFileSync('/tmp/dyn-code-raw.js', 'utf8').catch ? null : fs.readFileSync('/tmp/dyn-code-raw.js', 'utf8');
    if (!dynCode) {
      console.log('\nNo saved dynamic code. Re-capturing...');
      // 重新执行并捕获
      const origEval2 = env.sandbox.eval;
      let dynCode2 = null;
      // 已经执行过了，eval hook 已经被调用
      // 需要重新构建沙箱
      console.log('Need to re-run with eval hook to capture dynamic code');
    } else {
      console.log(`\nDynamic code: ${dynCode.length} bytes`);

      // 搜索 ctxVar 的赋值位置
      const ctxAssignPattern = new RegExp(ctxVar.replace(/\$/g, '\\$') + '\\s*=');
      const assignMatch = dynCode.match(ctxAssignPattern);
      console.log(`Context assignment found: ${!!assignMatch}`);

      // 搜索 dispatcher 函数定义
      const dispDefPattern = new RegExp('function\\s+' + dispatcher.replace(/\$/g, '\\$') + '\\s*\\(');
      const dispDef = dynCode.match(dispDefPattern);
      console.log(`Dispatcher definition found: ${!!dispDef}`);
    }
  } else {
    console.log('VM call pattern not found in trampoline source');
    console.log('Trying alternate pattern...');
    // 搜索 .length, 模式
    const lengthMatch = trampSrc.match(/(_\$[a-zA-Z0-9]+)\((_\$[a-zA-Z0-9]+),0,(_\$[a-zA-Z0-9]+)\.(_\$[a-zA-Z0-9]+)\.length,(_\$[a-zA-Z0-9]+)\)/);
    if (lengthMatch) {
      console.log('Found alternate:', lengthMatch[0]);
    } else {
      // 搜索所有函数调用
      const calls = trampSrc.matchAll(/(_\$[a-zA-Z0-9]+)\(([^)]+)\)/g);
      for (const call of calls) {
        if (call[2].includes(',0,')) {
          console.log('Found call with ,0,:', call[0]);
        }
      }
    }
  }

  // 无论如何，尝试强制 trampoline 并 dump 结果
  console.log('\n强制 trampoline...');
  for (const k in xhr) {
    if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true;
  }

  if (trampName) {
    const result = xhr[trampName].call(xhr, '{}');
    console.log(`Result: "${String(result).substring(0, 80)}" (type: ${typeof result})`);
  }

  // 尝试在 vm context 中搜索 VM 上下文
  console.log('\n搜索 VM 上下文...');
  // 检查 $_ts 是否有残留属性
  const tsKeys = vm.runInContext('Object.keys($_ts || {})', env.proxied);
  console.log(`$_ts keys: ${JSON.stringify(tsKeys)}`);

  // 检查 window 上是否有 _$ 开头的对象
  const winKeys = vm.runInContext('Object.getOwnPropertyNames(window).filter(k => k.startsWith("_$") && typeof window[k] === "object")', env.proxied);
  console.log(`window _$ objects: ${winKeys?.length || 0}`);
  if (winKeys && winKeys.length > 0) {
    for (const k of winKeys.slice(0, 5)) {
      const subKeys = vm.runInContext(`Object.keys(window['${k}'])`, env.proxied);
      console.log(`  window.${k}: {${subKeys?.join(',')}}`);
    }
  }

  // 检查 l__ 函数（$_ts 上唯一的属性）
  if (tsKeys.includes('l__')) {
    const lSrc = vm.runInContext('$_ts.l__.toString()', env.proxied);
    console.log(`\n$_ts.l__ source (${lSrc?.length} chars): ${lSrc?.substring(0, 200)}`);
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
