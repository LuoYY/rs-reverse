/**
 * Node.js helper: 读取 ts.json, 输出 cookie 生成所需数据 (JSON)
 * 用法: node keygen_helper.js <ts.json_path>
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const ROOT = path.resolve(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

(async () => {
  const tsPath = process.argv[2] || '/tmp/go-impl-ts.json';
  const ts = JSON.parse(fs.readFileSync(tsPath, 'utf8'));
  const nsd = ts.nsd, cd = ts.cd, baseUrl = ts.from || 'https://pmos.xj.sgcc.com.cn:20080/';

  // 1. 沙箱执行外层 VM 提取 cp3
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, outerJsCode);
  const cp3 = r.cp3;

  // 2. 清除缓存，重新初始化管线
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(ROOT);

  // 3. 在加载任何管线模块之前，先 hook numarrEncrypt
  let basearr = null;
  const gv = require('@src/handler/globalVarible');
  const ciPath = require.resolve('@src/handler/parser/common/index.js');
  const oc = require(ciPath);
  require.cache[ciPath].exports = new Proxy(oc, {
    get(t, p) {
      if (p === 'numarrEncrypt') return (n) => { basearr = [...n]; return oc.numarrEncrypt(n); };
      return t[p];
    }
  });

  // 4. 现在加载管线模块（hook 已就位）
  const { getCode } = require('@utils/');
  const tsFull = { nsd, cd, from: baseUrl, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  fs.writeFileSync(tsPath, JSON.stringify(tsFull));
  const argv = { file: tsPath, jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', tsFull);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...tsFull }, gv.config.immucfg);
  const runRet = coder.run();
  runRet['$_ts'].cp[3] = cp3;
  gv.config.codemap = runRet.codemap;

  const ck = new Cookie(coder);
  const cookie = ck.run();
  const config = ck.config;

  // 获取管线中间产物用于 Go 对比
  const parser = require('@src/handler/parser/');
  const { numarrEncrypt: realNumarrEncrypt, xor: realXor, encryptMode1: realEnc1, numarrAddTime, numToNumarr4: realN2A, uuid: realUuid, numarr2string: realN2S, numarrJoin: realNJ } = parser;
  const pipeNumenc = realNumarrEncrypt([...basearr]);
  const pipeXor = realXor([...pipeNumenc], gv.keys[2], 16);
  const pipeBasearrEncrypt = realEnc1([...pipeXor], [...gv.keys[17]], 0);
  const pipeNextarr = realNJ(realNJ(2, realN2A([config.r2mkaTime, config.startTime]), gv.keys[2]), 128, pipeBasearrEncrypt);
  const pipeUuid = realUuid(pipeNextarr);

  // 导出 Huffman 配置
  const huffConfigExport = (function() {
    function getTree() {
      let arr = [];
      for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
      arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
      function parse(item) {
        for (let i = 0; i < arr.length; i++) {
          if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
        }
        arr.push(item);
      }
      while (arr.length > 1) {
        const [o, t] = arr.slice(0, 2);
        arr = arr.slice(2);
        parse({ total: o.total + t.total, first: o, second: t });
      }
      return arr[0];
    }
    function getConfig(tree, config, arr) {
      config = config || { key: 0, val: 0 };
      arr = arr || [];
      if (tree.idx === undefined) {
        getConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
        getConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
      } else {
        arr[tree.idx] = config;
      }
      return arr;
    }
    const ec = getConfig(getTree());
    return ec.map(c => c ? [c.key, c.val] : [0, 0]);
  })();

  const output = {
    basearr: basearr || [],
    keys2: gv.keys[2],
    keys16: gv.keys[16],
    keys17: gv.keys[17],
    r2mkaTime: config.r2mkaTime,
    startTime: config.startTime,
    runTime: config.runTime,
    codeUid: config.codeUid,
    basestr: gv.basestr,
    cookieName: gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt ? (gv.config.adapt.lastWord || 'T') : 'T'),
    cookiePrefix: '0',
    refCookie: cookie,
    refCookieLen: cookie.length,
    pipeNumenc: pipeNumenc,
    pipeXor: pipeXor,
    pipeBasearrEncrypt: pipeBasearrEncrypt,
    pipeNextarr: pipeNextarr,
    pipeUuid: pipeUuid,
    huffConfig: huffConfigExport,
  };

  process.stdout.write(JSON.stringify(output));
})().catch(e => { process.stderr.write('HELPER_ERROR: ' + e.message + '\n' + e.stack + '\n'); process.exit(1); });
