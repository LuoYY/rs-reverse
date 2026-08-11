// 捕获 _$cS 执行时的 4 张查找表（_$eg/_$oA/_$kP/_$hP）+ _$gB 常量表 + _$pc 函数表
// 用 trace_1464 稳定插桩，在 _$mD[615] 调用点捕获（_$cS 会在内部执行）
// 更直接：patch _$cS 函数开头
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[CS] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // patch _$cS 函数开头（@115906 的字节码解释器）：捕获环境表
        // 特征：function _$cS(_\$aq,_\$_T,_\$hr,_\$kx){var _\$md,...;_\$gx=_\$aq._\$gS
        const cSPat = 'function _$cS(_$aq,_$_T,_$hr,_$kx){var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS';
        if (c.indexOf(cSPat) >= 0) {
          // 在这个函数内部，_$eg/_$oA/_$kP/_$hP 是外部闭包变量（_$iE 的）
          // 捕获它们的引用：但这里访问不到。改用捕获 _$iE 里的表
          // 实际：_$eg/_$oA/_$kP/_$hP 是 _$iE 的局部变量（_$hr 里 _\$hr._$g9 等）
          // 在 _$iE 的 _$kx(_$aq) 调用处捕获（此时表已构建）
          const kxPat = '_$dt=_$pE._$b3,_$kx(_$aq);';
          if (c.indexOf(kxPat) >= 0) {
            // _$iE 里的 _$eg/_$oA/_$kP/_$hP：查 _\$hr 里怎么定义的
            // _\$hr 返回 {_$cG,_$as,_$db,_$_0,_$g9,_$m3,_$fB,_$j5}
            // _\$eg/_\$oA/_\$kP/_\$hP 在 _\$iE 更外层！
            console.log('[CS] kxPat 找到，但 _\$eg 等在外层，跳过');
          }
          // 直接用 _$iE 闭包内 _$kx 函数里访问（_$kx 是 _$iE 的局部）
          // _$iE 的 _$kx：_$$m=new _$a8(_$_T._$iH)... 它用 _\$eg/_\$oA 吗？
          // 查 _\$iE 闭包源码
        }
        // 简化：直接捕获 _$iE 调用时它的所有局部变量（_$eg/_$oA/_$kP/_$hP）
        // 但这些是 _$hr 的局部（_$hr() 返回前）
        const hrReturnPat = '_$hr._$j5=_$p_();return _$hr;';
        if (c.indexOf(hrReturnPat) >= 0) {
          const inj = `_$hr._$j5=_$p_();try{window.__csTab=window.__csTab||[];window.__csTab.push({cG:_$hr._$cG,m3:_$hr._$m3,fB:_$hr._$fB,j5:{iH:_$hr._$j5?._$iH,fL:_$hr._$j5?._$fL,gSL:_$hr._$j5&&_$hr._$j5._$gS?_$hr._$j5._$gS.length:null,myLen:_$hr._$j5&&_$hr._$j5._$my?_$hr._$j5._$my.length:null,jRLen:_$hr._$j5&&_$hr._$j5._$jR?_$hr._$j5._$jR.length:null}});if(window.__csTab.length>10)window.__csTab.shift();}catch(__e){window.__csE=String(__e);}return _$hr;`;
          c = c.split(hrReturnPat).join(inj);
          console.log('[CS] _$hr 返回捕获 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_cs_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[CS] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
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
  const n = ev('typeof __csTab!=="undefined"?__csTab.length:0');
  console.log('[CS] 捕获数:', n, 'err:', ev('typeof __csE!=="undefined"?__csE:null'));
  const full = ev('typeof __csTab!=="undefined"?JSON.stringify(__csTab):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_cs_tables.json'), full);
  console.log('[CS] saved nx_cs_tables.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[CS] FATAL:', e && e.stack); process.exit(1); });
