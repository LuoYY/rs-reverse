/**
 * 92_proxy_patch_diag.js
 * Proxy eval + IIFE 局部插桩（console 限流输出，不污染 window）→ 定位死循环 dispatcher
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  const syncFile = process.env.SYNC_FILE || fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;

  const sandboxKeygen = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const env = sandboxKeygen.buildEnv({ nsd, cd }, {
    target: 'https://pmos.nx.sgcc.com.cn:10443/',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    timeout: 20000,
    patchDyn: true,
    savePatched: true,
  });
  console.log('Proxy eval:', env.captured.nativeEval);
  const t0 = Date.now();
  try {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'), env.sandbox, { timeout: 20000 });
    console.log('外层 VM 完成', Date.now() - t0, 'ms');
  } catch (e) {
    console.log('外层 VM:', e.message.substring(0, 60), Date.now() - t0, 'ms');
  }
  await new Promise(r => setTimeout(r, 2000));
  console.log('cookie:', env.captured.cookies.length ? env.captured.cookies[0].substring(0, 60) : 'null');
  console.log('errors:', env.captured.errors.slice(0, 5));
  console.log('V8 eval 捕获 lens:', JSON.stringify(env.captured.evalLens || []));
  console.log('V8 dynCodeLen:', env.captured.dynCode ? env.captured.dynCode.length : 0);
  console.log('er4:', env.sandbox.__er4, '| m:', env.sandbox.__er4m);
  if (env.captured.loopStack) {
    console.log('错误堆栈:', env.captured.loopStack.split('\n').slice(0, 8).join('\n'));
  }
  // dump $_ts.aebi / scj（外层 JS 产物）
  try {
    const ab = vm.runInContext('(function(){try{var s="aebi:"+typeof $_ts.aebi;if(Array.isArray($_ts.aebi)){for(var i=0;i<Math.min($_ts.aebi.length,8);i++){var el=$_ts.aebi[i];s+="|["+i+"]"+(el&&typeof el==="object"?"obj:"+JSON.stringify(el).substring(0,150):typeof el);}}else if($_ts.aebi&&typeof $_ts.aebi==="object"){s+=":keys"+Object.keys($_ts.aebi).slice(0,10).join(",");}s+="|scj:"+typeof $_ts.scj;if($_ts.scj&&typeof $_ts.scj==="object"){s+=":"+JSON.stringify($_ts.scj).substring(0,200);}s+="|jf:"+typeof $_ts.jf;s+="|lcd:"+typeof $_ts.lcd;s+="|cp:"+typeof $_ts.cp;if($_ts.cp&&typeof $_ts.cp==="object"){s+=":keys"+Object.keys($_ts.cp).slice(0,10).join(",");}return s;}catch(e){return "err:"+String(e);}})()', env.sandbox);
    console.log('V8 aebi/scj:', ab);
  } catch (e) { console.log('dump aebi 失败:', e.message.substring(0, 80)); }
  // 读取 _$l5 快照 + 常量池 + _$pb（V8 环境指纹采集标准答案 + 常量池）
  try {
    const l5 = env.sandbox.__l5full;
    const ne = env.sandbox.__neFull;
    const pbArr = env.sandbox.__pbArr;
    const cp = {
      iM: env.sandbox.__iM, bA: env.sandbox.__bA, eB: env.sandbox.__eB,
      bF: env.sandbox.__bF, cg: env.sandbox.__cg, a2: env.sandbox.__a2,
    };
    const jpProps = env.sandbox.__jpProps;
    if (jpProps && jpProps.length) {
      console.log('探测属性名(' + jpProps.length + '):', JSON.stringify(jpProps.slice(0, 50)));
    }
    console.log('探测属性片段:', JSON.stringify(env.sandbox.__jp1), '+', JSON.stringify(env.sandbox.__jp2), '=', String(env.sandbox.__jp1 || '') + String(env.sandbox.__jp2 || ''));
    console.log('_$i_[57]:', JSON.stringify(env.sandbox.__i57), '_$fU 类型:', env.sandbox.__fU === null ? 'null' : (typeof env.sandbox.__fU === 'string' ? env.sandbox.__fU.substring(0, 40) : typeof env.sandbox.__fU), '_$kQ 类型:', env.sandbox.__kQ);
    const vv = {
      r: env.sandbox.__r, aW: env.sandbox.__aW, ou: env.sandbox.__ou, ox: env.sandbox.__ox,
      g7: env.sandbox.__g7, mM: env.sandbox.__mM, ak: env.sandbox.__ak, po: env.sandbox.__po,
      U: env.sandbox.__U, cB: env.sandbox.__cB, gy: env.sandbox.__gy, ln: env.sandbox.__ln,
      eG: env.sandbox.__eG, ng: env.sandbox.__ng, fE: env.sandbox.__fE, ic: env.sandbox.__ic,
      ea: env.sandbox.__ea, bt: env.sandbox.__bt, aQ: env.sandbox.__aQ, oM: env.sandbox.__oM,
      gi: env.sandbox.__gi, gI: env.sandbox.__gI, n: env.sandbox.__n, er4: env.sandbox.__er4,
    };
    if (l5 && Array.isArray(l5)) {
      console.log('_$l5 快照长度:', l5.length, 'pb 长度:', pbArr ? pbArr.length : 0);
      console.log('检测变量:', JSON.stringify(vv).substring(0, 500));
      fs.writeFileSync(path.join(OUT, 'l5_from_v8.json'), JSON.stringify({ l5, ne, pbArr, cp, vv, jpProps }, null, 0));
      console.log('已保存 l5_from_v8.json');
      // 导出 $_ts.aebi / scj / cp（quickjs 注入用，必须在此处——前面写入会覆盖）
      try {
        const aebiJson = vm.runInContext('JSON.stringify($_ts.aebi)', env.sandbox);
        const scjJson = vm.runInContext('JSON.stringify($_ts.scj)', env.sandbox);
        const cpJson = vm.runInContext('(function(){try{return JSON.stringify($_ts.cp);}catch(e){return "ERR:"+e.message;}})()', env.sandbox);
        if (typeof aebiJson === 'string') {
          const v8f = JSON.parse(fs.readFileSync(path.join(OUT, 'l5_from_v8.json'), 'utf8'));
          v8f.aebi = JSON.parse(aebiJson);
          v8f.scj = JSON.parse(scjJson);
          if (typeof cpJson === 'string' && !cpJson.startsWith('ERR:')) {
            v8f.cp = JSON.parse(cpJson);
            console.log('cp 导出:', Array.isArray(v8f.cp) ? '数组 len=' + v8f.cp.length : '对象 keys=' + Object.keys(v8f.cp).join(','));
            // dump cp 元素类型
            if (Array.isArray(v8f.cp)) {
              console.log('cp 元素类型:', v8f.cp.map(function(x) { return typeof x; }).join(','));
            }
          } else {
            console.log('cp 导出失败:', cpJson);
          }
          fs.writeFileSync(path.join(OUT, 'l5_from_v8.json'), JSON.stringify(v8f, null, 0));
          console.log('已导出 aebi（', v8f.aebi.length, '元素）scj cp 到 l5_from_v8.json');
        } else {
          console.log('aebi JSON 无效（V8 里 $_ts.aebi:', typeof vm.runInContext('$_ts.aebi', env.sandbox), '）');
        }
      } catch (e) { console.log('导出 aebi 失败:', e.message.substring(0, 60)); }
    } else {
      console.log('_$l5 快照缺失（typeof:', typeof l5, '）');
    }
  } catch (e) { console.log('读 _$l5 失败:', e.message.substring(0, 60)); }
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
