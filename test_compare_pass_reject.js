/**
 * 同 nsd 下通过 vs 被拒 cookie 明文对比（终极定位）
 *
 * 关键改进：直接 hook numarrEncrypt 捕获管线生成的原始 basearr（不依赖反解），
 * 同 nsd 下连续生成多个 cookie 分别用新鲜 O 重放，标记通过/被拒，
 * 然后对比通过 basearr 与被拒 basearr 的逐字节差异。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_compare_pass_reject.js
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

let _got = null;
async function gotScraping() {
  if (!_got) {
    const { gotScraping } = await import('got-scraping');
    _got = gotScraping.extend({
      headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 131, maxVersion: 131 }], devices: ['desktop'], operatingSystems: ['macos'] },
      https: { rejectUnauthorized: false }, timeout: { request: 15000 }, retry: { limit: 0 }, throwHttpErrors: false,
    });
  }
  return _got;
}
async function httpGet(url, cookie) {
  const g = await gotScraping();
  const headers = { 'User-Agent': UA };
  if (cookie) headers['Cookie'] = cookie;
  const res = await g.get(url, { headers });
  return { status: res.statusCode, headers: res.headers, body: res.body };
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(16); }

const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

// 一次完整尝试：新挑战页（新 nsd/O）→ 管线（hook 捕获 basearr）→ 重放
async function attempt() {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no $_ts');
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  if (!r.cp3) throw new Error('no cp3');

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  // hook numarrEncrypt 捕获原始 basearr
  let captured = null;
  const ciPath = require.resolve('@src/handler/parser/common/index.js');
  const oc = require(ciPath);
  const one = oc.numarrEncrypt;
  require.cache[ciPath].exports = new Proxy(oc, {
    get(t, p) { if (p === 'numarrEncrypt') return (n) => { captured = [...n]; return one(n); }; return t[p]; }
  });
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
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
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const header = `${oCookie}; ${name}=${cookie}`;
  const replay = await httpGet(TARGET, header);
  return { status: replay.status, basearr: captured, nsd, cp3: r.cp3, codeUid: null };
}

async function main() {
  const results = [];
  // 收集直到有 ≥3 通过 且 ≥3 被拒
  let passN = 0, rejN = 0, tries = 0;
  while ((passN < 3 || rejN < 3) && tries < 40) {
    tries++;
    try {
      const r = await attempt();
      if (r.basearr) {
        results.push(r);
        if (r.status === 200) passN++; else rejN++;
        console.log(`#${tries}: ${r.status} baseLen=${r.basearr.length} (通过${passN}/拒${rejN})`);
      } else {
        console.log(`#${tries}: ${r.status} basearr 未捕获`);
      }
    } catch (e) { console.log(`#${tries}: ERR ${String(e.message).substring(0, 40)}`); }
  }
  const passes = results.filter(r => r.status === 200);
  const rejects = results.filter(r => r.status !== 200);
  console.log(`\n===== 收集: ${passes.length} 通过, ${rejects.length} 被拒 =====`);

  // 对比通过 vs 被拒的 basearr 结构（都是管线生成，结构应一致，差异在随机字段）
  if (passes.length && rejects.length) {
    const p = passes[0].basearr, q = rejects[0].basearr;
    console.log(`\n通过[0] len=${p.length} vs 被拒[0] len=${q.length}`);
    console.log('--- 通过 vs 被拒 basearr 逐字节 diff ---');
    const maxLen = Math.max(p.length, q.length);
    const diffs = [];
    for (let i = 0; i < maxLen; i++) {
      if (p[i] !== q[i]) diffs.push(i);
    }
    console.log(`差异 ${diffs.length} 字节 @ [${diffs.join(',')}]`);
    // 打印每个差异位的通过/被拒值
    for (const i of diffs) {
      console.log(`  @${i}: 通过=${p[i]} 被拒=${q[i]}`);
    }
    // 落盘全部样本
    fs.writeFileSync('/tmp/pass_reject_basearr.json', JSON.stringify({
      passes: passes.map(r => r.basearr),
      rejects: rejects.map(r => r.basearr),
    }, null, 2));
    console.log('\n样本已存 /tmp/pass_reject_basearr.json');
  }
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
