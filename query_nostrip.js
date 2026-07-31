/**
 * query_nostrip.js — encryptMode2 NoStrip 版本，检查完整解密结果
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path');
const ROOT = __dirname;

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(ROOT);
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const combine4 = require('@src/handler/parser/common/combine4');
  const numToNumarr4 = require('@src/handler/parser/common/numToNumarr4');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const _zip = require('lodash/zip');

  const data = JSON.parse(fs.readFileSync('output/capture-20080/query-same-session-crack.json', 'utf8'));
  const nsd = data.nsd, cd = data.cd;

  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/q-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/q-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const runRet = coder.run();
  runRet['$_ts'].cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  new Cookie(coder).run();

  // NoStrip encryptMode2
  function enc2NoStrip(valarr, keyarr, flag) {
    const cfgnum = gv.cfgnum;
    function getCfg(numarr) {
      const ret = combine4(numarr.length % 16 !== 0 ? numarrAddTime.reverse(numarr)[0] : numarr);
      const c04 = cfgnum[0][4]; const len = ret.length; const arr = []; let i, j, temp;
      for (i = len, j = 1; i < 4*len+28; i++) {
        temp = ret[i-1];
        if (i%len===0 || len===8&&i%len===4) {
          temp = c04[temp>>>24]<<24^c04[temp>>16&255]<<16^c04[temp>>8&255]<<8^c04[temp&255];
          if (i%len===0) { temp=temp<<8^temp>>>24^j<<24; j=j<<1^(j>>7)*283; }
        }
        ret[i] = ret[i-len]^temp;
      }
      for (j = 0; i; j++, i--) {
        temp = ret[j&3?i:i-4];
        if (i<=4||j<4) arr[j]=temp;
        else arr[j]=cfgnum[1][0][c04[temp>>>24]]^cfgnum[1][1][c04[temp>>16&255]]^cfgnum[1][2][c04[temp>>8&255]]^cfgnum[1][3][c04[temp&255]];
      }
      return [ret, arr];
    }
    function encode(cfg, val, idx) {
      const list = cfg[idx]; const arr = [0,0,0,0];
      let one=val[0]^list[0], two=val[idx?3:1]^list[1], three=val[2]^list[2], four=val[idx?1:3]^list[3], cursor=4;
      for (let i=0; i<list.length/4-2; i++) {
        const none=cfgnum[0][one>>>24]^cfgnum[1][two>>16&255]^cfgnum[2][three>>8&255]^cfgnum[3][four&255]^list[cursor];
        const ntwo=cfgnum[0][two>>>24]^cfgnum[1][three>>16&255]^cfgnum[2][four>>8&255]^cfgnum[3][one&255]^list[cursor+1];
        const nthree=cfgnum[0][three>>>24]^cfgnum[1][four>>16&255]^cfgnum[2][one>>8&255]^cfgnum[3][two&255]^list[cursor+2];
        four=cfgnum[0][four>>>24]^cfgnum[1][one>>16&255]^cfgnum[2][two>>8&255]^cfgnum[3][three&255]^list[cursor+3];
        cursor+=4; one=none; two=ntwo; three=nthree;
      }
      for (let i=0; i<4; i++) {
        arr[idx?3&-i:i]=cfgnum[4][one>>>24]<<24^cfgnum[4][two>>16&255]<<16^cfgnum[4][three>>8&255]<<8^cfgnum[4][four&255]^list[cursor++];
        one=two; two=three; three=four; four=one;
      }
      return arr;
    }
    const cfg = getCfg(keyarr);
    const arr = []; let arrcom = combine4(valarr); let arrsub = [];
    if (flag) { arrsub = arrcom.slice(0, 4); arrcom = arrcom.slice(4); }
    for (let i = 0; i < arrcom.length/4; ) {
      const next = arrcom.slice(i<<2, ++i<<2);
      let val = encode(cfg, next, 1);
      if (arrsub.length) val = _zip(val, arrsub).map(([a,b])=>a^b);
      for (let j = 0; j < val.length; j++) arr.push(val[j]);
      arrsub = next;
    }
    return arr.reduce((ans, it) => [...ans, ...numToNumarr4(it)], []);
  }

  // 解码 query
  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  const idxmap = {};
  basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const payload = data.queries[0].query.startsWith('0') ? data.queries[0].query.slice(1) : data.queries[0].query;
  const queryBytes = []; let i = 0;
  const full = Math.floor(payload.length / 4);
  for (let g = 0; g < full; g++) {
    const c0=idxmap[payload[i]],c1=idxmap[payload[i+1]],c2=idxmap[payload[i+2]],c3=idxmap[payload[i+3]];
    i+=4; queryBytes.push((c0<<2)|(c1>>4),((c1&15)<<4)|(c2>>2),((c2&3)<<6)|c3);
  }
  const rem = payload.length-i;
  if (rem===2) queryBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
  else if (rem===3) queryBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4),((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));

  const sessionData = queryBytes.slice(7, 55);
  const requestData = queryBytes.slice(56, 88);

  console.log('=== NoStrip decrypt ===');

  // 所有 keys × session/request × flag 0/1
  for (let ki = 0; ki < gv.keys.length; ki++) {
    if (!gv.keys[ki] || gv.keys[ki].length < 16) continue;
    for (const flag of [0, 1]) {
      for (const [name, d] of [['session', sessionData], ['request', requestData]]) {
        try {
          const dec = enc2NoStrip([...d], [...gv.keys[ki]], flag);
          if (dec.length === 0) continue;
          const ascii = dec.filter(b => b >= 32 && b <= 126).length / dec.length;
          if (ascii > 0.5) {
            console.log(`keys[${ki}] ${name} f${flag}: ${dec.length}B ascii=${(ascii*100).toFixed(0)}% last=${dec[dec.length-1]}`);
            const text = dec.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
            if (text.length > 3) console.log(`  text: "${text.substring(0, 50)}"`);
          }
        } catch(e) {}
      }
    }
  }

  // 也用 VM trace keys
  console.log('\n=== VM trace keys NoStrip ===');
  for (const ki of data.keys) {
    if (ki.data.length < 16) continue;
    const key = ki.data.slice(0, 16);
    for (const flag of [0, 1]) {
      for (const [name, d] of [['session', sessionData], ['request', requestData]]) {
        try {
          const dec = enc2NoStrip([...d], [...key], flag);
          if (dec.length === 0) continue;
          const ascii = dec.filter(b => b >= 32 && b <= 126).length / dec.length;
          if (ascii > 0.5) {
            console.log(`vm[${ki.idx}] ${name} f${flag}: ${dec.length}B ascii=${(ascii*100).toFixed(0)}%`);
            const text = dec.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
            if (text.length > 3) console.log(`  text: "${text.substring(0, 50)}"`);
          }
        } catch(e) {}
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
