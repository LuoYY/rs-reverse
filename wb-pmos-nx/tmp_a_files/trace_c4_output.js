// 终极符号执行：hook _$c4 的返回值（base 数组）
// _$c4(_$cg,_$ez,_$pL,_$gc,_$pb,_$nx,_$cQ) 是纯函数，返回 base
// 在 dynCode 中搜索 _$c4 的调用点并捕获返回值
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_c4_output.json');

(async () => {
  console.log('[CO] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[CO] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 找 _$c4 的调用点：_$c4(...) 或 _$c4.apply
        // 主循环里是 var _$eS=[1165]; ... return _$hF.apply(this,_$eS)
        // _$c4 应该在某处被调用。搜索
        const calls = [];
        let idx = 0;
        while ((idx = c.indexOf('_$c4(', idx + 1)) >= 0) {
          calls.push(idx);
        }
        console.log('[CO] _$c4( 调用点:', calls.length, '个');
        // 找调用上下文
        calls.forEach((ci, i) => {
          console.log('[CO] call#' + i + ': ...' + c.slice(Math.max(0, ci - 60), ci + 60).replace(/\n/g, ' ').slice(0, 130) + '...');
        });
        // 策略：包装 _$c4 函数，调用时捕获返回
        const fnIdx = c.indexOf('function _$c4(');
        if (fnIdx >= 0) {
          // 找到函数体结束（匹配大括号）
          let depth = 0, end = -1;
          for (let i = fnIdx; i < c.length; i++) {
            if (c[i] === '{') depth++;
            else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end > 0) {
            // 在函数定义前包装
            const origFn = c.slice(fnIdx, end + 1);
            const wrapper = `globalThis.__c4Outs=[];var __origC4=${origFn};function _$c4(_$cg,_$ez,_$pL,_$gc,_$pb,_$nx,_$cQ){var __r=__origC4(_$cg,_$ez,_$pL,_$gc,_$pb,_$nx,_$cQ);try{globalThis.__c4Outs.push({r:__r,ez:Array.isArray(_$ez)?Array.from(_$ez.slice(0,30)):null});if(globalThis.__c4Outs.length>10)globalThis.__c4Outs.splice(0,5);}catch(__e){globalThis.__c4E=String(__e);}return __r;}`;
            c = c.slice(0, fnIdx) + wrapper + c.slice(end + 1);
            console.log('[CO] _$c4 包装 OK');
          }
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_co_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[CO] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() },
  });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[CO] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[CO] err:', ev('typeof __c4E!=="undefined"?__c4E:null'));
  const outs = ev('typeof __c4Outs!=="undefined"?JSON.stringify(__c4Outs):null');
  console.log('[CO] __c4Outs:', outs ? outs.slice(0, 600) : 'none');
  if (outs) fs.writeFileSync(OUT, outs);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[CO] FATAL:', e && e.message); process.exit(1); });
