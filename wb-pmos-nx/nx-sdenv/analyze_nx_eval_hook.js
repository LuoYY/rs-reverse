// 反编译 _$$p[103] 核心：hook window.eval，在 dynCode（内层 VM）执行前插桩。
// dynCode 经 window.eval($_ts.scj 拼接) 执行。_$pg(){_$pu=_$$p[_$bA[103]]()} 是 basearr 生成。
// 插桩策略：
//   1. hook eval 拿到 dynCode 文本
//   2. 在 dynCode 里给 _$pg 注入追踪（记录 _$$p 栈顶函数 + 其返回值）
//   3. dump _$bA 字符串池（确认 [18]/[103] 方法名）+ base 生成函数源码
// 本地固定 challenge（nsd=67402 恒定）→ 可反复调试。
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[EVAL] pid=%d start', process.pid);
  let dynCode = null;
  const trace = { bA: null, pgCalls: [], baseGen: [] };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      // hook eval：拿到 dynCode（含 _$$p[_$bA[103]]），插桩后执行
      const oeval = w.eval;
      w.eval = function (code) {
        try {
          if (typeof code === 'string' && code.indexOf('_$$p[_$bA[103]]') >= 0 && code.indexOf('_$pg') >= 0) {
            console.log('[EVAL] ★ 截获 dynCode len=' + code.length);
            dynCode = code;
            // 插桩 1: 在 _$pg 里记录 _$$p 栈顶 + 返回值
            // 原始: function _$pg(){_$pu=_$$p[_$bA[103]]();}
            // 改为: 记录栈顶函数源码 + 返回值
            let patched = code.replace(
              /function _\$pg\(\)\{(_\$pu)=(_\$\$p\[_\$bA\[103\]\]\(\));\}/,
              'function _$pg(){var __top=_$$p[_$$p.length-1];try{window.__baseGenFn=__top;window.__baseGenFnSrc=(typeof __top==="function"?Function.prototype.toString.call(__top):"notfn")}catch(e){}_$pu=_$$p[_$bA[103]]();try{if(_$pu&&_$pu.length>100){window.__baseRet=Array.from(_$pu)}}catch(e){}}'
            );
            // 插桩 2: dump _$bA 字符串池（在 dynCode 末尾 IIFE 调用前）
            // 找 dynCode 末尾 ")($_ts.scj,$_ts.aebi);" → 在其前注入 dump
            patched = patched.replace(
              /\}\)\((_\$ts\.scj),(_\$ts\.aebi)\);?\s*$/,
              'try{window.__bA=_$bA;window.__bA18=_$bA[18];window.__bA103=_$bA[103]}catch(e){}})($_ts.scj,$_ts.aebi);'
            );
            console.log('[EVAL] 插桩完成, patched=' + (patched !== code));
            return oeval.call(this, patched);
          }
        } catch (e) { console.log('[EVAL] 插桩异常:', e.message); }
        return oeval.call(this, code);
      };
    },
  });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  // 提取插桩结果（w.eval 同步返回，非 Promise）
  const getV = (expr) => { try { return w.eval(expr); } catch (e) { return null; } };
  const bA18 = getV('window.__bA18');
  const bA103 = getV('window.__bA103');
  const baseGenFnSrc = getV('window.__baseGenFnSrc');
  const baseRet = getV('window.__baseRet ? JSON.stringify(window.__baseRet) : null');
  console.log('[EVAL] _$bA[18]=' + bA18 + ' _$bA[103]=' + bA103);
  console.log('[EVAL] base 生成函数源码:', baseGenFnSrc ? String(baseGenFnSrc).slice(0, 300) : 'null');
  console.log('[EVAL] base 返回值:', baseRet ? String(baseRet).slice(0, 100) : 'null');
  fs.writeFileSync('/tmp/nx_dyn_decompile.json', JSON.stringify({
    bA18, bA103, baseGenFnSrc, baseRet: baseRet ? JSON.parse(baseRet) : null,
    dynCodeSaved: !!dynCode,
  }, null, 1));
  if (dynCode) fs.writeFileSync('/tmp/nx_dynCode_live.js', dynCode);
  console.log('[EVAL] saved /tmp/nx_dyn_decompile.json + nx_dynCode_live.js done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[EVAL] FATAL:', e && e.message); process.exit(1); });
