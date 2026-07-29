/**
 * Phase A1 — 用 :20080 真实 $_ts(nsd/cd) 跑管线 makecookie 验证下游链路
 *
 * 用 sdenv 抓到的同会话 nsd+cd+真实 cookie，隔离 Coder 变量，
 * 验证 cd解密→keys→basearr→cookie加密 这段是否与真实 cookie 一致。
 *
 * 用法：
 *   export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
 *   NODE_OPTIONS=--dns-result-order=ipv4first node verify_pipeline_20080.js
 */
const path = require('path');
const fs = require('fs');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
require('module-alias')(path.dirname(require('./utils/paths').package));
const { jsdomFromUrl, logger } = require('sdenv');
const gv = require('@src/handler/globalVarible');
const { getCode, initGv } = require('@utils/');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_DIR = path.join(__dirname, 'output', 'capture-20080');

function checksum(code) { let s = 0; for (let i = 0; i < code.length; i += 100) s += code.charCodeAt(i); return s; }

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  logger.level = 'warn';

  // ---- 1. sdenv 抓同会话 nsd/cd + 真实 P cookie ----
  console.log('[1] sdenv 抓 :20080 同会话种子 + cookie...');
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    consoleConfig: { error: new Function, warn: new Function, log: new Function },
  });
  const { window, cookieJar } = dom;
  const sessNsd = window.$_ts && window.$_ts.nsd;
  const sessCd = window.$_ts && window.$_ts.cd;
  await new Promise(r => { let d = false; const f = () => { if (!d) { d = true; r(); } }; window.addEventListener('sdenv:location.replace', f); setTimeout(f, 45000); });
  await new Promise(r => setTimeout(r, 3000));
  const cookies = cookieJar.getCookieStringSync(TARGET);
  const realP = (cookies.match(/[A-Za-z0-9]+P=([^;]+)/) || [])[1];
  console.log('    nsd=', sessNsd, 'cd_len=', sessCd && sessCd.length, 'realP_len=', realP && realP.length);
  window.close();

  if (!sessNsd || !sessCd) { console.error('未抓到 $_ts'); process.exit(1); }

  // ---- 2. 用真实 nsd/cd 跑管线（手动复刻 makecookie 内部，保留 Coder 实例拿 cp[3]/动态代码）----
  console.log('\n[2] 管线生成（真实 nsd/cd）...');
  const ts = { nsd: sessNsd, cd: sessCd, from: TARGET, hasDebug: false, keynameNum: 909 };
  fs.writeFileSync(path.join(OUT_DIR, 'pipeline-ts.json'), JSON.stringify(ts));

  const argv = {
    file: path.join(OUT_DIR, 'pipeline-ts.json'),
    jsurls: ['example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'],
    hasDebug: false, mate: {}, output: OUT_DIR, level: 'info', _: ['makecookie'],
  };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: codeRet.metaContent || [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);

  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: !!gv.config.adapt?.hasDebug, ...ts }, gv.config.immucfg);
  const { code: dynCode, $_ts: fullTs, codemap } = coder.run();
  gv.config.codemap = codemap;  // Cookie/runTask 依赖 codemap
  const pipelineCp3 = fullTs.cp[3];
  fs.writeFileSync(path.join(OUT_DIR, 'pipeline-dyn-code.js'), dynCode);
  console.log('    管线动态代码 len=', dynCode.length, 'cp[3]=', pipelineCp3, '(浏览器应 ~290845, 校验和 ~21xxxx)');

  let genCookie = null, genCookieName = null;
  try {
    const cookie = new Cookie(coder).run();
    genCookie = cookie;
    genCookieName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  } catch (e) { console.error('    Cookie 生成报错:', e.message); }

  console.log('\n[3] === 对比（管线 vs sdenv 真实）===');
  console.log('    cookie 名:', genCookieName, '(真实应为 ...P)');
  console.log('    真实 P cookie  len:', realP && realP.length, '前缀:', realP && realP.substring(0, 12));
  console.log('    管线 cookie    len:', genCookie && genCookie.length, '前缀:', genCookie && genCookie.substring(0, 12));

  // ---- 3b. 反解管线 cookie（encryptMode1 有随机 IV，encryptMode2 用相同 IV 应还原）----
  if (genCookie) {
    try {
      const parser = require('@src/handler/parser/');
      const { numToNumarr4, uuid, ascii2string, encryptMode1, encryptMode2, numarrAddTime } = parser;
      const basestr = gv.config.adapt?.basestr || gv.basestr;
      const keys64 = basestr.split(''); const idxmap = {}; keys64.forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
      const s2n = (str) => { const n = []; let i = 0; const full = Math.floor(str.length / 4);
        for (let g = 0; g < full; g++) { const a = idxmap[str[i]], b = idxmap[str[i+1]], c = idxmap[str[i+2]], d = idxmap[str[i+3]]; i += 4; n.push((a<<2)|(b>>4), ((b&15)<<4)|(c>>2), ((c&3)<<6)|d); }
        const rem = str.length - i; if (rem === 2) { const a = idxmap[str[i]], b = idxmap[str[i+1]]; n.push((a<<2)|(b>>4)); } else if (rem === 3) { const a = idxmap[str[i]], b = idxmap[str[i+1]], c = idxmap[str[i+2]]; n.push((a<<2)|(b>>4), ((b&15)<<4)|(c>>2)); } return n; };
      const payload = /^[0a]/.test(genCookie) ? genCookie.slice(1) : genCookie;
      const bytes = s2n(payload);
      const key16t = numarrAddTime(gv.keys[16], undefined, undefined)[0];
      const decrypted = encryptMode2(bytes, key16t, 1);
      const uuidCheck = decrypted.slice(0, 4), nextarr = decrypted.slice(4);
      const uuidCalc = numToNumarr4(uuid(nextarr));
      const uuidMatch = JSON.stringify(uuidCheck) === JSON.stringify(uuidCalc);
      console.log('\n[3b] 管线 cookie 反解: bytes=', bytes.length, 'decrypted=', decrypted.length, 'uuid match=', uuidMatch, uuidMatch ? '✓ 外层 keys[16]+basestr 自洽' : '✗ 外层解密失败');
      console.log('    uuidCheck=', uuidCheck, 'calc=', uuidCalc);
      if (decrypted.length > 14) {
        const keys2len = nextarr[10]; const keys2 = nextarr.slice(11, 11 + keys2len);
        console.log('    nextarr[0,1]=', nextarr[0], nextarr[1], 'keys2len=', keys2len, 'keys2==gv.keys[2]:', JSON.stringify(keys2) === JSON.stringify(gv.keys[2]));
        console.log('    keys[2][0..6]=', gv.keys[2].slice(0, 6), 'keys[16][0..6]=', gv.keys[16].slice(0, 6), 'keys[17][0..6]=', gv.keys[17].slice(0, 6));
      }
    } catch (e) { console.log('    反解报错:', e.message, e.stack && e.stack.split('\n')[1]); }
  }

  // ---- 4. 真实服务器重放验证（O + 管线 P）----
  if (genCookie && genCookieName) {
    const oCookie = (cookies.match(/[A-Za-z0-9]+O=([^;]+)/) || [])[0];
    const cookieHeader = `${oCookie}; ${genCookieName}=${genCookie}`;
    console.log('\n[4] 重放 :20080 (O + 管线P)...');
    const https = require('https');
    const status = await new Promise((resolve) => {
      const req = https.request(TARGET, { method: 'GET', rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Cookie': cookieHeader } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', () => resolve('ERR'));
      req.end();
    });
    console.log('    重放状态:', status, status === 200 ? '✓✓✓ 管线 cookie 被服务器接受！' : '✗ 被拒');
    fs.writeFileSync(path.join(OUT_DIR, 'pipeline-replay.json'), JSON.stringify({ status, cookieHeader }, null, 2));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'pipeline-verify.json'), JSON.stringify({
    nsd: sessNsd, cd_len: sessCd.length,
    pipelineDynCodeLen: dynCode.length, pipelineCp3,
    cookieName: genCookieName,
    realP_len: realP && realP.length, genCookie_len: genCookie && genCookie.length,
    realP_head: realP && realP.substring(0, 40), genCookie_head: genCookie && genCookie.substring(0, 40),
  }, null, 2));
  console.log('\n输出:', OUT_DIR);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
