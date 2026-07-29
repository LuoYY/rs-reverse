/**
 * 对比【管线 codeUid】vs【沙箱独立计算的 codeUid】，验证管线对部分 nsd 是否算错。
 *
 * codeUid 公式（Cookie.js）：
 *   one = uuid(functionsNameSort[funcIdx].code)   （funcIdx=+keys[33]，回退20）
 *   two = uuid(mainFunctionCode.substr(start, len))（len=mainLen/100, start=len*keys[34]）
 *   codeUid = (one ^ two) & 65535
 *
 * 沙箱有完整动态代码 dynCode。若管线 coder.code === dynCode（已验证一致），
 * 则差异只可能在 functionsNameSort 的函数提取/排序。这里用管线自己的 coder.code
 * 重新按另一种可靠方式提取函数并计算 codeUid，对比管线 getCodeUid。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_codeuid_compare.js [N]
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

function httpGet(url, cookie) {
  return new Promise(r => {
    const headers = { 'User-Agent': UA };
    if (cookie) headers['Cookie'] = cookie;
    https.get(url, { rejectUnauthorized: false, headers }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', () => r({ status: 'ERR', body: '', headers: {} }));
  });
}

(async () => {
  const N = parseInt(process.argv[2] || '12', 10);
  const rows = [];
  for (let i = 0; i < N; i++) {
    try {
      const ch = await httpGet(TARGET);
      const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (!m) { console.log(`#${i + 1}: no ts`); continue; }
      const nsd = +m[1], cd = m[2];
      const setCookies = [].concat(ch.headers['set-cookie'] || []);
      const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
      const { runOuterVM } = require('./extract_dyncode_20080.js');
      const r = runOuterVM({ nsd, cd }, outerJs);

      for (const k of Object.keys(require.cache)) delete require.cache[k];
      require('module-alias')(path.dirname(require('./utils/paths').package));
      const gv = require('@src/handler/globalVarible');
      const { getCode } = require('@utils/');
      const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
      fs.writeFileSync('/tmp/t.json', JSON.stringify(ts));
      const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
      const codeRet = await getCode(argv.jsurls);
      argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
      gv._setAttr('argv', argv);
      require('@src/config/')(gv);
      gv._setAttr('_ts', ts);
      const Coder = require('@src/handler/Coder');
      const Cookie = require('@src/handler/Cookie');
      const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
      const runRet = coder.run();
      runRet.$_ts.cp[3] = r.cp3;
      gv.config.codemap = runRet.codemap;
      const ck = new Cookie(coder);
      const cookie = ck.run();
      const pipeCodeUid = ck.getCodeUid();

      // 检测 functionsSort 是否失败（functionsNameSort 数量不足 56 或有 empty entry）
      const fnsTotal = coder.functionsNameSort.length;
      const emptyEntries = coder.functionsNameSort.filter(e => !e.code).length;

      // 沙箱动态代码 vs 管线 coder.code 是否一致
      const codeSame = r.dynCode === coder.code;
      // functionsNameSort 信息
      const fns = coder.functionsNameSort.length;
      const funcIdx = +gv.utils.ascii2string(gv.keys[33]);
      const validIdx = (!isNaN(funcIdx) && funcIdx < fns) ? funcIdx : 20;
      const hasEntry = !!(coder.functionsNameSort[validIdx] && coder.functionsNameSort[validIdx].code);

      // 重放验证
      const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
      const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);

      rows.push({ nsd, status: replay.status, pipeCodeUid, codeSame, fns, funcIdx, validIdx, hasEntry, fnsTotal, emptyEntries });
      console.log(`#${i + 1}: ${replay.status} nsd=${nsd} codeUid=0x${pipeCodeUid.toString(16)} fnsTotal=${fnsTotal} empty=${emptyEntries} funcIdx=${funcIdx}`);
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 50)}`); }
  }
  // 分析：通过 vs 被拒的 codeSame/fns/validIdx/hasEntry
  const ok = rows.filter(r => r.status === 200), bad = rows.filter(r => r.status !== 200);
  console.log(`\n===== ${ok.length}/${rows.length} 通过 =====`);
  console.log('通过组 codeSame:', ok.map(r => r.codeSame), 'hasEntry:', ok.map(r => r.hasEntry), 'validIdx:', ok.map(r => r.validIdx));
  console.log('被拒组 codeSame:', bad.map(r => r.codeSame), 'hasEntry:', bad.map(r => r.hasEntry), 'validIdx:', bad.map(r => r.validIdx));
  // 关键：hasEntry=false（函数提取失败→用 mainFunctionCode.substring 兜底）是否集中在被拒组？
  console.log('\nhasEntry=false 的样本:', rows.filter(r => !r.hasEntry).map(r => `${r.status}/nsd${r.nsd}`));
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
