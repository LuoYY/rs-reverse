process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const OUT = path.join(ROOT, 'wb-pmos-nx/captures');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

async function main() {
  // 管线初始化
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));

  // 读 sync（nx 会话）
  const syncFile = process.env.SYNC_FILE || fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  console.log('nx nsd:', nsd, 'cdLen:', cd.length);
  console.log('浏览器 keys17:', sync.browserKeys.keys17.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // runOuterVM 提取 cp3（checksum(dynCode)，不执行 _\$ml）
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  console.log('cp3:', r.cp3, 'dynLen:', r.dynLen, 'evals:', JSON.stringify(r.evals));
  if (!r.cp3) throw new Error('cp3 提取失败');

  // 管线生成 cookie
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: 'https://pmos.nx.sgcc.com.cn:10443/', hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-query-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-query-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  console.log('config.keynameNum:', gv.config.keynameNum);
  console.log('ts.keynameNum:', ts.keynameNum);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  const cf = String(codemap && codemap.commonFunc || '');
  console.log('commonFunc 长度:', cf.length);
  // 找顶层 return（不在函数内）
  let depth = 0, i = 0, returns = [];
  while (i < cf.length) {
    const ch = cf[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === 'r' && depth === 0 && cf.startsWith('return', i)) { returns.push(cf.substring(i, i + 60)); i += 6; continue; }
    i++;
  }
  console.log('顶层 return:', returns.length ? JSON.stringify(returns.slice(0, 3)) : '无');
  console.log('commonFunc 前 200:', cf.substring(0, 200));
  console.log('commonFunc 末尾 200:', cf.substring(cf.length - 200));
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');

  console.log('生成 cookie:', name + '=' + cookie.substring(0, 60) + '...', '(len', cookie.length + ')');
  // 对比浏览器密钥
  const k17 = gv.keys[17];
  console.log('管线 keys17:', k17.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  const same = k17.length === sync.browserKeys.keys17.length && k17.every((v, i) => v === sync.browserKeys.keys17[i]);
  console.log('keys17 与浏览器相同:', same ? '★★★ 密钥一致!' : 'NO');
  if (!same) {
    console.log('浏览器:', sync.browserKeys.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('管线  :', k17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
  // 保存 cookie 待网络恢复验证
  const oc = (sync.cookies || []).find(c => c.name.endsWith('O'));
  const result = { nsd, cd, cookie: name + '=' + cookie, oCookie: oc ? oc.name + '=' + oc.value : '' };
  fs.writeFileSync('/tmp/nx_cookie_result.json', JSON.stringify(result, null, 2));
  console.log('已保存 /tmp/nx_cookie_result.json');
  process.exit(0);
}
main().catch(e => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
