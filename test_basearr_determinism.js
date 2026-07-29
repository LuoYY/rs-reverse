/**
 * 测试：同一 (nsd, cd, cp3) 种子下，管线 basearr 是否跨尝试逐字节一致
 * （判断随机字段是否真正进入了 basearr，还是 basearr 已确定性）
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_basearr_determinism.js
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');

function httpGet(url, cookie) {
  return new Promise((resolve) => {
    const headers = { 'User-Agent': UA, 'Accept': '*/*' };
    if (cookie) headers['Cookie'] = cookie;
    https.get(url, { rejectUnauthorized: false, headers }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', (e) => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
  });
}

const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

// ---- 顶层 hook numarrEncrypt：捕获每次调用的输入 basearr ----
global.__capturedBasearrs = [];
require('module-alias')(path.dirname(require('./utils/paths').package));
const commonIdxPath = require.resolve('@src/handler/parser/common/index.js');
const origCommon = require(commonIdxPath);
const origNe = origCommon.numarrEncrypt;
require.cache[commonIdxPath].exports = new Proxy(origCommon, {
  get(target, prop) {
    if (prop === 'numarrEncrypt') {
      return function(numarr) { global.__capturedBasearrs.push([...numarr]); return origNe(numarr); };
    }
    return target[prop];
  }
});

// 只取一次挑战页 → 固定种子
async function main() {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('no $_ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  console.log('固定种子 nsd=', nsd, 'cp3=', r.cp3);

  const basearrs = [];
  const cookies = [];
  let firstCoder = null;
  let firstCookie = null;
  for (let t = 0; t < 5; t++) {
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require('./utils/paths').package));
    // 清缓存后重新植入 numarrEncrypt hook
    const ciPath = require.resolve('@src/handler/parser/common/index.js');
    const oc = require(ciPath);
    const one = oc.numarrEncrypt;
    require.cache[ciPath].exports = new Proxy(oc, {
      get(target, prop) {
        if (prop === 'numarrEncrypt') {
          return function(numarr) { global.__capturedBasearrs.push([...numarr]); return one(numarr); };
        }
        return target[prop];
      }
    });
    const gv = require('@src/handler/globalVarible');
    const { getCode } = require('@utils/');
    const parser = require('@src/handler/parser/');
    const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
    fs.writeFileSync('/tmp/pmos-xj-ts.json', JSON.stringify(ts));
    const argv = { file: '/tmp/pmos-xj-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
    const codeRet = await getCode(argv.jsurls);
    argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
    gv._setAttr('argv', argv);
    require('@src/config/')(gv);
    gv._setAttr('_ts', ts);
    const Coder = require('@src/handler/Coder');
    const Cookie = require('@src/handler/Cookie');
    const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
    const { $_ts: fullTs, codemap } = coder.run();
    fullTs.cp[3] = r.cp3;
    gv.config.codemap = codemap;
    if (t === 0) firstCoder = coder;
    // 顶层已 hook numarrEncrypt，直接生成 cookie，从捕获数组取最后一次输入
    global.__capturedBasearrs = [];
    const ck = new Cookie(coder);
    const cookie = ck.run();
    if (t === 0) firstCookie = ck;
    const basearr = global.__capturedBasearrs[global.__capturedBasearrs.length - 1] || null;
    basearrs.push(basearr);
    cookies.push(cookie);
    console.log(`#${t+1}: basearr len=${basearr.length} execN=${(basearr[25]<<24|basearr[26]<<16|basearr[27]<<8|basearr[28])>>>0} randAvg=${basearr[31]} randVar=${basearr[32]} [20:25]=${basearr.slice(20,25).join(',')} [85:95]=${basearr.slice(85,95).join(',')}`);
  }
  // 两两对比
  console.log('\n===== basearr 两两 diff（不同字节数） =====');
  for (let i = 0; i < basearrs.length; i++) {
    for (let j = i + 1; j < basearrs.length; j++) {
      const a = basearrs[i], b = basearrs[j];
      let diff = [];
      for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) diff.push(k);
      console.log(`#${i+1} vs #${j+1}: len ${a.length}/${b.length}, 差异 ${diff.length} 字节 @ [${diff.slice(0,12).join(',')}]`);
    }
  }
  console.log('\ncookie 两两相同?', new Set(cookies).size === 1 ? '全同(确定性)' : cookies.length + ' 个全不同(含IV随机)');
  // 与真实 basearr 对比（第一个管线 basearr vs other_base_arr 的 247 真实版）
  try {
    const txt = fs.readFileSync(path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/other_base_arr'), 'utf8');
    const real = [...txt.matchAll(/\[3,73,1,0[\s\S]*?\]/g)].map(m => JSON.parse(m[0]))[1];
    const mine = basearrs[0];
    console.log('\n===== 管线 basearr[0] vs 真实 basearr(247) 逐段对比 =====');
    console.log('真实 len=', real.length, '管线 len=', mine.length);
    // 标注已知随机/会话相关区（跳过）
    const randomRanges = [[21,24],[59,62],[66,74],[84,94]]; // execN/time/random8/encryptMode2块
    const inRandom = (i) => randomRanges.some(([a,b]) => i>=a && i<=b);
    console.log('--- [0:112] 前段静态字段 diff（跳过随机区） ---');
    for (let i = 0; i < 112; i++) {
      if (!inRandom(i) && real[i] !== mine[i]) console.log(`  @${i}: 真实=${real[i]} 管线=${mine[i]}`);
    }
    console.log('--- [0] 段 [112:213] ---');
    let seg0same = true;
    for (let i = 112; i < 213; i++) if (real[i] !== mine[i]) { seg0same = false; console.log(`  @${i}: 真实=${real[i]} 管线=${mine[i]}`); }
    if (seg0same) console.log('  [0] 段 101 字节完全一致 ✓');
    console.log('--- 尾段 diff（跳过 keys16 随机块 @218:222） ---');
    for (let i = 213; i < Math.max(real.length, mine.length); i++) {
      if (i>=218 && i<=222) continue; // keys16 会话相关
      if (real[i] !== mine[i]) console.log(`  @${i}: 真实=${real[i]} 管线=${mine[i]}`);
    }
  } catch (e) { console.log('对比失败:', e.message); }
  // 直接用第 1 次循环的 cookie 实例测 codeUid（其构造时已 parser.init）
  try {
    const codeUid = firstCookie ? firstCookie.getCodeUid() : null;
    console.log(`\n[校验] 沙箱 cp3=${r.cp3} dynLen=${r.dynLen} | 管线 coder code len=${firstCoder && firstCoder.code.length} codeUid=${codeUid} (0x${codeUid && codeUid.toString(16)})`);
    console.log(`[校验] 沙箱动态代码 === 管线 coder.code ? ${r.dynCode === (firstCoder && firstCoder.code)}`);
    console.log(`[校验] 真实 codeUid 期望 0xeebf(61119)，管线=${codeUid} ${codeUid===61119?'✓一致':'✗不一致→codeUid 偏差'}`);
  } catch (e) { console.log('校验失败:', e.message, (e.stack||'').split('\n')[1]); }
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
