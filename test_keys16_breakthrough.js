/**
 * 突破点：hook Cookie.run 外层加密实际用的 keys16 派生 key，与反解 gv.keys16 逐字节对比。
 *
 * 原理：412-cd 外层 uuidOk=false 说明加密 keys16 ≠ 反解 keys16。
 * 通过 Proxy hook parser 的 encryptMode1，捕获 Cookie.run 外层调用的实际 keyarr，
 * 与 gv.keys[16] 对比，并验证该 keyarr 经 getCfg 后是否与原始 keys16 一致。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_keys16_breakthrough.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

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

async function tryOnce() {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no ts');
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');

  // ---- hook parser 的 encryptMode1/encryptMode2（在 Cookie require 前，且替换 common/index 导出）----
  const encCalls = [];
  const ciPath = require.resolve('@src/handler/parser/common/index.js');
  const oc = require(ciPath);
  const origE1 = oc.encryptMode1, origE2 = oc.encryptMode2;
  require.cache[ciPath].exports = new Proxy(oc, {
    get(t, p) {
      if (p === 'encryptMode1') return (valarr, keyarr, flag, random) => {
        encCalls.push({ op: 'enc1', flag, keyLen: keyarr.length, key: [...keyarr], valLen: valarr.length });
        return origE1(valarr, keyarr, flag, random);
      };
      if (p === 'encryptMode2') return (valarr, keyarr, flag) => {
        encCalls.push({ op: 'enc2', flag, keyLen: keyarr.length, key: [...keyarr], valLen: valarr.length });
        return origE2(valarr, keyarr, flag);
      };
      return t[p];
    }
  });
  // 但 Cookie.js 顶层 `const { encryptMode1 } = parser` —— parser 是 parser/index.js，其 ...common 展开。
  // parser/index.js 在 require 时展开 common。需也 hook parser/index.js。
  const piPath = require.resolve('@src/handler/parser/index.js');
  // parser/index.js 已 require（上面 getCode 可能触发）。直接改其导出对象的属性。
  const parserMod = require(piPath);
  const pe1 = parserMod.encryptMode1;
  parserMod.encryptMode1 = function (valarr, keyarr, flag, random) {
    encCalls.push({ op: 'P.enc1', flag, keyLen: keyarr.length, key: [...keyarr], valLen: valarr.length });
    return pe1(valarr, keyarr, flag, random);
  };

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

  encCalls.length = 0;
  const cookie = new Cookie(coder).run();
  const encSnapshot = encCalls.map(c => ({ ...c }));

  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);

  return {
    status: replay.status, nsd,
    k16: [...gv.keys[16]], k17: [...gv.keys[17]], k2len: gv.keys[2].length,
    encSnapshot,
  };
}

(async () => {
  const N = parseInt(process.argv[2] || '8', 10);
  for (let i = 0; i < N; i++) {
    try {
      const r = await tryOnce();
      console.log(`\n#${i + 1}: ${r.status} nsd=${r.nsd}`);
      console.log(`  gv.keys16 = [${r.k16.join(',')}]`);
      console.log(`  gv.keys17 = [${r.k17.join(',')}]`);
      for (const c of r.encSnapshot) {
        console.log(`  ${c.op} flag=${c.flag} keyLen=${c.keyLen} valLen=${c.valLen} key=[${c.key.slice(0, 8).join(',')}...]`);
      }
      // 分析：外层 enc1(flag=1) 的 key 应是 numarrAddTime(keys16)=21 元素
      const outerEnc = r.encSnapshot.find(c => c.op.includes('enc1') && c.flag === 1);
      if (outerEnc) {
        // 还原：numarrAddTime.reverse(outerEnc.key) 应得 keys16
        const derived = outerEnc.key;
        const ele = derived[derived.length - 1];
        const unxored = derived.slice(0, -1).map(x => x ^ ele);
        const recK16 = unxored.slice(0, unxored.length - 4);
        const match = JSON.stringify(recK16) === JSON.stringify(r.k16);
        console.log(`  外层key还原: ele=${ele} recK16==gv.keys16? ${match}${!match ? ' recK16=[' + recK16.slice(0, 8).join(',') + '...]' : ''}`);
      }
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 50)}`); }
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
