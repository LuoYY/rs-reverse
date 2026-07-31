/**
 * 11_hook_pipeline_encrypt.js
 *
 * hook 管线 encryptMode1，记录实际加密密钥，并立即用同密钥逆解验证
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

async function main() {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));

  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const capFile = fs.readdirSync(OUT).filter(f => f.startsWith('enc_')).sort().pop();
  const cap = JSON.parse(fs.readFileSync(path.join(OUT, capFile)));
  const nsd = cap.challenge.nsd, cd = cap.challenge.cd;
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));

  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;

  // hook parser 导出（必须在 require Cookie 之前！Cookie 加载时解构 encryptMode1/2）
  const parser = require('@src/handler/parser');
  const modeEncrypt = require('@src/handler/parser/common/modeEncrypt');
  const calls = [];
  const origEnc1 = modeEncrypt.encryptMode1;
  const origEnc2 = modeEncrypt.encryptMode2;
  parser.encryptMode1 = function(valarr, keyarr, flag, random) {
    const entry = { op: 'enc1', flag, keyLen: keyarr && keyarr.length, valLen: valarr && valarr.length, key: keyarr ? keyarr.slice(0, 32) : null };
    const result = origEnc1.apply(this, arguments);
    entry.resultLen = result && result.length;
    calls.push(entry);
    return result;
  };
  parser.encryptMode2 = function(valarr, keyarr, flag) {
    const entry = { op: 'dec2', flag, keyLen: keyarr && keyarr.length, valLen: valarr && valarr.length, key: keyarr ? keyarr.slice(0, 32) : null };
    const result = origEnc2.apply(this, arguments);
    entry.resultLen = result && result.length;
    calls.push(entry);
    return result;
  };

  const Cookie = require('@src/handler/Cookie');
  const cookie = new Cookie(coder).run();
  console.log('管线 cookie len:', cookie.length);
  console.log('\n=== 加密调用记录 ===');
  calls.forEach((c, i) => console.log('[' + i + ']', c.op, 'flag=' + c.flag, 'valLen=' + c.valLen, 'keyLen=' + c.keyLen, '→ ' + c.resultLen, 'key=' + (c.key ? c.key.map(b => b.toString(16).padStart(2, '0')).join(' ') : '')));

  // 用记录到的密钥逆解
  console.log('\n=== 逆解验证 ===');
  const enc1Calls = calls.filter(c => c.op === 'enc1');
  const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  function decodeStr(s) {
    const payload = s.startsWith('0') ? s.slice(1) : s;
    const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
    const bytes = []; let qi = 0;
    const groups = Math.floor(payload.length / 4);
    for (let g = 0; g < groups; g++) {
      const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi+1]], c2 = idxmap[payload[qi+2]], c3 = idxmap[payload[qi+3]]; qi += 4;
      bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
    }
    if (qi + 2 < payload.length) { bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi+1]] >> 4), ((idxmap[payload[qi+1]] & 15) << 4) | (idxmap[payload[qi+2]] >> 2)); }
    else if (qi + 1 < payload.length) bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi+1]] >> 4));
    return bytes;
  }
  const cBytes = decodeStr(cookie);
  console.log('cookie 解码:', cBytes.length);
  // 用外层调用（flag=1，key 是 numarrAddTime(keys16) 的 21B）直接解密
  const outerCall = enc1Calls.find(c => c.flag === 1);
  if (outerCall && outerCall.key) {
    try {
      const dec = origEnc2([...cBytes], [...outerCall.key], 1);
      console.log('逆解成功! decLen=' + dec.length + ' 头10:', dec.slice(0, 10).join(','));
      console.log('  nextarr 特征: dec[4]=' + dec[4] + ' dec[13]=' + dec[13]);
    } catch (e) { console.log('逆解失败:', e.message); }
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
