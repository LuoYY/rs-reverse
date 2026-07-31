/**
 * 14_pipeline_validate.js
 *
 * 验证管线从捕获 cd 推导 keys 的正确性（跨 3 个会话）
 * 若 keys 匹配，则进一步生成 basearr，测试前缀派生假设
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'captures');
const OUTER_JS = path.join(__dirname, '../example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

async function genKeysFromCd(nsd, cd) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.join(__dirname, '..'));
  const { runOuterVM } = require('../extract_dyncode_20080.js');
  const outerJs = fs.readFileSync(OUTER_JS, 'utf8');
  const r = runOuterVM({ nsd, cd }, outerJs);
  if (!r.cp3) throw new Error('cp3 failed');
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const tmpTs = '/tmp/pmos-xj-ts3.json';
  fs.writeFileSync(tmpTs, JSON.stringify({ nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 }));
  const argv = { file: tmpTs, jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, '..', 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  const ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { codemap } = coder.run();
  gv.config.codemap = codemap;
  require('@src/handler/parser/').init(coder);
  return { keys: gv.keys, gv, fullTs: coder.$_ts };
}

async function main() {
  const files = fs.readdirSync(OUT).filter(f => ['everything_', 'cd_keys_query_', 'plaintext_'].some(p => f.startsWith(p)) && f.endsWith('.json'));
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
    if (!d.keys30 || !d.keys30[17]) continue;
    const enc24 = (d.encLog || []).filter(c => c.resultType === 'arr[32]' && (c.args || []).join(',').includes('arr[24]'));
    const bkeys17 = d.keys30[17].d;
    const bkeys2 = d.keys30[2].d;
    const bkeys16 = d.keys30[16].d;
    let prefix = null;
    if (enc24.length) prefix = enc24[0].arg0.slice(0, 13);

    console.log(`\n=== ${f} ===`);
    if (!d.challenge || !d.challenge.cd) { console.log('  无 challenge，跳过管线验证'); continue; }
    const { nsd, cd } = d.challenge;
    try {
      const { keys, gv } = await genKeysFromCd(nsd, cd);
      const pkeys17 = keys[17], pkeys2 = keys[2], pkeys16 = keys[16];
      const m17 = pkeys17.length === bkeys17.length && pkeys17.every((b, i) => b === bkeys17[i]);
      const m2 = pkeys2.length === bkeys2.length && pkeys2.every((b, i) => b === bkeys2[i]);
      const m16 = pkeys16.length === bkeys16.length && pkeys16.every((b, i) => b === bkeys16[i]);
      console.log(`  nsd=${nsd} 管线 keys17==浏览器: ${m17 ? '★YES' : 'NO'}  keys2: ${m2 ? '★YES' : 'NO'}  keys16: ${m16 ? '★YES' : 'NO'}`);
      if (!m17) {
        console.log('    浏览器 keys17:', bkeys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('    管线   keys17:', pkeys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
      }
      // 生成 basearr
      try {
        const Cookie = require('@src/handler/Cookie');
        const coder = new (require('@src/handler/Coder'))({ hasCodemap: true, hasDebug: false, nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', keynameNum: 909, cp3Override: d.challenge.cd ? undefined : undefined }, gv.config.immucfg);
        // 简化：直接用 parser.init 后的 gv 生成 basearr
        const getBasearr = require('@src/handler/basearr');
        const config = { ...gv.makecookieRuntimeConfig };
        const basearr = getBasearr(config, gv);
        console.log(`  basearr: ${basearr.length}B`, basearr.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
        if (prefix) {
          const tests = {
            'md5(basearr)[0:13]': [...crypto.createHash('md5').update(Buffer.from(basearr)).digest()].slice(0, 13),
            'sha1(basearr)[0:13]': [...crypto.createHash('sha1').update(Buffer.from(basearr)).digest()].slice(0, 13),
            'basearr[0:13]': basearr.slice(0, 13),
            'basearr[3:16]': basearr.slice(3, 16),
            'basearr[8:21]': basearr.slice(8, 21),
          };
          for (const [tn, tv] of Object.entries(tests)) {
            const m = tv.every((b, i) => b === prefix[i]);
            console.log(`    ${tn}: ${tv.map(b=>b.toString(16).padStart(2,'0')).join(' ')} ${m ? '★★ 前缀匹配!' : ''}`);
          }
        }
      } catch (e) { console.log('  basearr 生成失败:', e.message.substring(0, 60)); }
    } catch (e) {
      console.log('  管线失败:', e.message.substring(0, 80));
      console.log('    ', (e.stack || '').split('\n').slice(0, 6).join('\n    '));
    }
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
