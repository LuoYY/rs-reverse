// 插桩 dump _$k6（basearr 生成的动态 JS 代码）—— 关键目标
// 修正尾部正则：}})($_ts.scj,$_ts.aebi);（注意 $_ts 前有 '('）
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[K6D] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let done = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !done) {
        done = true;
        console.log('[K6D] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // ★ 尾部标记：})($_ts.scj,$_ts.aebi);  -- 注意 ( 和 $_
        const tailRe = /\}\)\(_\$ts\.scj,\$_ts\.aebi\);\s*$/;
        const tailRe2 = /\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/;
        const tailRe3 = /\}\)\$\.scj,\$_ts\.aebi\);\s*$/;
        console.log('[K6D] tail re1(})($_ts):', tailRe.test(c), 're2(})$_ts):', tailRe2.test(c));
        c = c.replace(/\}\)\(_\$ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__tailHit=true;}($_ts.scj,$_ts.aebi);');
        // 也尝试去掉 _ 前缀的形式
        if (c.indexOf('__tailHit') < 0) c = c.replace(/\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__tailHit=true;}($_ts.scj,$_ts.aebi);');
        console.log('[K6D] 尾部标记:', c.indexOf('__tailHit') >= 0 ? 'OK' : '✗ 结尾=' + JSON.stringify(c.slice(-50)));
        // ★ 插桩所有 _$k6= 赋值点（dump 值）
        // 模式1：_$k6=_$mD[5][_$oU[17]](  (join 拼接)
        const pat1 = '_$k6=_$mD[5][_$oU[17]](';
        if (c.indexOf(pat1) >= 0) {
          c = c.replace(pat1, 'try{globalThis.__k6A=(globalThis.__k6A||[]);globalThis.__k6A.push(String(_$k6));}catch(e){}' + pat1);
          console.log('[K6D] pat1 join 拼接插桩 OK');
        }
        // 模式2：_$k6= 任意赋值（在逗号表达式里）
        // 兜底：hook String.prototype.slice 无果后，直接 hook _$n3 入口（JS 解析器）
        const n3Pattern = 'function _$n3(_$aq,_$$v';
        if (c.indexOf(n3Pattern) >= 0) {
          c = c.replace(n3Pattern, 'function _$n3(_$aq,_$$v');
          console.log('[K6D] _$n3 入口确认 @' + c.indexOf('function _$n3'));
        }
        // ★ 插桩 _$er（解析器）：dump _$k6
        const erPattern = 'function _$er(){var _$aq,_$_T;_$aq=_$mD[15][_$oU[17]](';
        if (c.indexOf(erPattern) >= 0) {
          c = c.replace(erPattern,
            'function _$er(){try{globalThis.__erLog=globalThis.__erLog||[];globalThis.__erLog.push(typeof _$k6==="string"?"len:"+_$k6.length+":"+_$k6.slice(0,500):"nonstr:"+typeof _$k6);if(globalThis.__erLog.length>15)globalThis.__erLog.shift();}catch(e){}var _$aq,_$_T;_$aq=_$mD[15][_$oU[17]](');
          console.log('[K6D] _$er 插桩 OK');
        } else { console.log('[K6D] ✗ _$er 模式未找到'); }
        // ★ 插桩 _$n3 输出（basearr 组装处：_$aq 数组 push）
        const n3Push = '_$aq[_$oU[18]](';
        // 不插桩 push（太频繁），改为插桩 return{_$fo
        const retPattern = 'return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};';
        if (c.indexOf(retPattern) >= 0) {
          c = c.replace(retPattern,
            'try{globalThis.__retLog={hrLen:(_$hr&&_$hr.length)?_$hr.length:null,hrHead:(_$hr&&_$hr.slice)?Array.from(_$hr.slice(0,20)):null,hrType:typeof _$hr,phKeys:(_$pH&&_$pH._$ky)?Object.keys(_$pH._$ky).slice(0,15):null,foHq:(_$pH&&_$pH._$hq&&_$pH._$hq.length)?_$pH._$hq.length:null};}catch(e){globalThis.__retErr=String(e);}return{_$fo:_$pH,_$dE:_$hr,_$cZ:_$ou,_$jd:_$oF};');
          console.log('[K6D] return 插桩 OK');
        }
        fs.writeFileSync('/tmp/nx_dynCode_k6d_patched.js', c);
        console.log('[K6D] 已保存 patched len=' + c.length);
        code = c;
      }
    } catch (e) { console.log('[K6D] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
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
  for (const k of ['__tailHit', '__k6A', '__erLog', '__retLog', '__retErr']) {
    try {
      const v = w[k];
      if (typeof v === 'string') console.log('[K6D] ' + k + ':', v.substring(0, 1200));
      else if (Array.isArray(v)) { console.log('[K6D] ' + k + ': array len=' + v.length); v.forEach((x, i) => console.log('[K6D]   #' + i + ':', String(x).substring(0, 500))); }
      else console.log('[K6D] ' + k + ':', JSON.stringify(v));
    } catch (e) { console.log('[K6D] ' + k + ' err:', e.message); }
  }
  console.log('[K6D] P cookie len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[K6D] FATAL:', e && e.message); process.exit(1); });
