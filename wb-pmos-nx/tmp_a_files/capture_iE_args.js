// 捕获 _$iE 调用时的完整参数（7 个），用于离线重现 JSVMP 编码器
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
        console.log('[IE] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 找 _$iE("r2mKa 调用点，包装记录参数
        // 形式：_$iE("r2mKa0\x00..."  （opcode 109）
        // 更通用：找 function _$iE 的定义，包装它
        const fnStart = c.indexOf('function _$iE(');
        if (fnStart >= 0) {
          // 在其内部开头注入参数捕获（_$aq/_$k6/_$hZ/_$nD/_$oA/_$jM/_$hP）
          const headPat = 'function _$iE(_$aq,_$k6,_$hZ,_$nD,_$oA,_$jM,_$hP){var _$_T,_$pE,_$dt;';
          if (c.indexOf(headPat) >= 0) {
            const inj = headPat + `try{window.__ieArgs=window.__ieArgs||[];var __sum=function(a){if(typeof a==="string")return "str:"+a.length+":"+a.slice(0,40);if(a&&a.length!==undefined)return "arr:"+a.length;if(a===null)return "null";return String(a).slice(0,40);};window.__ieArgs.push({aq:__sum(_$aq),k6:__sum(_$k6),hZ:__sum(_$hZ),nD:__sum(_$nD),oA:__sum(_$oA),jM:__sum(_$jM),hP:__sum(_$hP)});if(window.__ieArgs.length>100)window.__ieArgs.shift();}catch(__e){window.__ieE=String(__e);}`;
            c = c.split(headPat).join(inj);
            console.log('[IE] _$iE 参数捕获 OK');
          } else console.log('[IE] ✗ 头部模式未找到');
        }
        // 捕获 gS 字符串本身（_$iE("r2mKa...）
        const gsPat = '_$iE("r2mKa';
        if (c.indexOf(gsPat) >= 0) {
          // 提取字符串
          const idx = c.indexOf(gsPat);
          let end = idx + 7;
          while (end < c.length && c[end] !== '"') end++;
          const gsStr = c.slice(idx + 5, end);
          fs.writeFileSync(path.join(__dirname, 'nx_gS_raw_string.txt'), gsStr);
          console.log('[IE] gS 字符串捕获 len=' + gsStr.length + ' head=' + gsStr.slice(0, 30));
        } else console.log('[IE] ✗ _\$iE("r2mKa 未找到');
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_iE_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[IE] hook err:', e.message); }
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
  const n = ev('typeof __ieArgs!=="undefined"?__ieArgs.length:0');
  console.log('[IE] _$iE 调用数:', n, 'err:', ev('typeof __ieE!=="undefined"?__ieE:null'));
  const full = ev('typeof __ieArgs!=="undefined"?JSON.stringify(__ieArgs):null');
  if (full) fs.writeFileSync(path.join(__dirname, 'nx_iE_args.json'), full);
  console.log('[IE] saved nx_iE_args.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[IE] FATAL:', e && e.stack); process.exit(1); });
