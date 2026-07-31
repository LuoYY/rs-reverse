/**
 * query_pipeline_decrypt.js — 用管线 encryptMode2 解密同会话 query
 *
 * 同会话 nsd/cd 确认后，用管线 RS 自定义 AES（encryptMode2）解密
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path');

const ROOT = __dirname;

(async () => {
  // 加载同会话数据
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/capture-20080/query-same-session-crack.json'), 'utf8'));
  const nsd = data.nsd, cd = data.cd;
  const query = data.queries[0].query;
  const vmKeys = data.keys;

  console.log(`nsd=${nsd}, cd_len=${cd.length}, query=${query.substring(0, 40)}...`);
  console.log(`VM keys: ${vmKeys.length}`);

  // 解码 query
  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  const idxmap = {};
  basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const payload = query.startsWith('0') ? query.slice(1) : query;
  const queryBytes = [];
  let i = 0;
  const full = Math.floor(payload.length / 4);
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
    i += 4; queryBytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  const rem = payload.length - i;
  if (rem === 2) queryBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
  else if (rem === 3) queryBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4), ((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));

  const sessionData = queryBytes.slice(7, 55);
  const requestData = queryBytes.slice(56, 88);
  const nonce = queryBytes.slice(0, 4);

  console.log(`\nSession (${sessionData.length}B): [${sessionData.slice(0, 8).join(',')}...]`);
  console.log(`Request (${requestData.length}B): [${requestData.slice(0, 8).join(',')}...]`);

  // 初始化管线
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(ROOT);
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const r = runOuterVM({ nsd, cd }, outerJsCode);
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

  const parser = require('@src/handler/parser/');
  const { encryptMode2 } = parser;

  console.log(`\n管线 keys16: [${gv.keys[16].join(',')}]`);
  console.log(`管线 keys17: [${gv.keys[17].join(',')}]`);

  // 收集所有候选 key
  const allKeys = [
    ...vmKeys.map(k => ({ name: `vm[${k.idx}]`, data: k.data })),
    { name: 'pipe16', data: gv.keys[16] },
    { name: 'pipe17', data: gv.keys[17] },
    { name: 'pipe2', data: gv.keys[2] },
  ];

  console.log(`\n=== 管线 encryptMode2 解密 ===`);
  let hits = [];

  for (const keyInfo of allKeys) {
    if (keyInfo.data.length < 16) continue;
    const key = keyInfo.data.slice(0, Math.min(16, keyInfo.data.length));

    // encryptMode2 flag=0
    try {
      const dec0 = encryptMode2([...sessionData], [...key], 0);
      if (dec0 && dec0.length > 5) {
        const ascii = dec0.filter(b => b >= 32 && b <= 126).length;
        const ratio = ascii / dec0.length;
        if (ratio > 0.5) {
          console.log(`\n*** ${keyInfo.name} session f0: ${dec0.length}B ascii=${(ratio*100).toFixed(0)}% ***`);
          console.log(`  key=[${key.join(',')}]`);
          console.log(`  dec=[${dec0.slice(0, 16).join(',')}]`);
          const text = dec0.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
          if (text.length > 3) console.log(`  text: "${text.substring(0, 50)}"`);
          hits.push({ name: keyInfo.name, test: 'session f0', ratio, dec: dec0 });
        }
      }
    } catch (e) {}

    // encryptMode2 flag=1
    try {
      const dec1 = encryptMode2([...sessionData], [...key], 1);
      if (dec1 && dec1.length > 5) {
        const ascii = dec1.filter(b => b >= 32 && b <= 126).length;
        const ratio = ascii / dec1.length;
        if (ratio > 0.5) {
          console.log(`\n*** ${keyInfo.name} session f1: ${dec1.length}B ascii=${(ratio*100).toFixed(0)}% ***`);
          console.log(`  key=[${key.join(',')}]`);
          console.log(`  dec=[${dec1.slice(0, 16).join(',')}]`);
          hits.push({ name: keyInfo.name, test: 'session f1', ratio, dec: dec1 });
        }
      }
    } catch (e) {}

    // request_data flag=0
    try {
      const decR0 = encryptMode2([...requestData], [...key], 0);
      if (decR0 && decR0.length > 5) {
        const ascii = decR0.filter(b => b >= 32 && b <= 126).length;
        const ratio = ascii / decR0.length;
        if (ratio > 0.5) {
          console.log(`\n*** ${keyInfo.name} request f0: ${decR0.length}B ascii=${(ratio*100).toFixed(0)}% ***`);
          console.log(`  key=[${key.join(',')}]`);
          console.log(`  dec=[${decR0.slice(0, 16).join(',')}]`);
          const text = decR0.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
          if (text.length > 3) console.log(`  text: "${text.substring(0, 50)}"`);
          hits.push({ name: keyInfo.name, test: 'request f0', ratio, dec: decR0 });
        }
      }
    } catch (e) {}

    // request_data flag=1
    try {
      const decR1 = encryptMode2([...requestData], [...key], 1);
      if (decR1 && decR1.length > 5) {
        const ascii = decR1.filter(b => b >= 32 && b <= 126).length;
        const ratio = ascii / decR1.length;
        if (ratio > 0.5) {
          console.log(`\n*** ${keyInfo.name} request f1: ${decR1.length}B ascii=${(ratio*100).toFixed(0)}% ***`);
          hits.push({ name: keyInfo.name, test: 'request f1', ratio, dec: decR1 });
        }
      }
    } catch (e) {}

    // 32 字节 key
    if (keyInfo.data.length >= 32) {
      const key32 = keyInfo.data.slice(0, 32);
      try {
        const dec = encryptMode2([...sessionData], [...key32], 0);
        if (dec && dec.length > 5) {
          const ascii = dec.filter(b => b >= 32 && b <= 126).length;
          const ratio = ascii / dec.length;
          if (ratio > 0.5) {
            console.log(`\n*** ${keyInfo.name} session f0 (32B): ${dec.length}B ascii=${(ratio*100).toFixed(0)}% ***`);
            hits.push({ name: keyInfo.name + '(32)', test: 'session f0', ratio, dec });
          }
        }
      } catch (e) {}
    }
  }

  // 也尝试整体 88 字节
  console.log('\n=== 整体 88 字节 ===');
  for (const keyInfo of allKeys) {
    if (keyInfo.data.length < 16) continue;
    const key = keyInfo.data.slice(0, Math.min(16, keyInfo.data.length));
    for (const flag of [0, 1]) {
      try {
        const dec = encryptMode2([...queryBytes], [...key], flag);
        if (dec && dec.length > 10) {
          const ascii = dec.filter(b => b >= 32 && b <= 126).length;
          const ratio = ascii / dec.length;
          if (ratio > 0.5) {
            console.log(`*** ${keyInfo.name} full f${flag}: ${dec.length}B ascii=${(ratio*100).toFixed(0)}% ***`);
            console.log(`  dec=[${dec.slice(0, 16).join(',')}]`);
            // 检查 uuid 自洽
            if (dec.length > 4) {
              const uuidVal = parser.uuid(dec.slice(4));
              const uuidBytes = parser.numToNumarr4(uuidVal);
              const uuidOk = JSON.stringify(dec.slice(0, 4)) === JSON.stringify(uuidBytes);
              if (uuidOk) console.log(`  *** UUID 自洽！***`);
            }
          }
        }
      } catch (e) {}
    }
  }

  if (hits.length === 0) {
    console.log('\n无命中');
    console.log('\n=== 结论 ===');
    console.log('1. 标准 AES-CBC（Node crypto）失败');
    console.log('2. RS 自定义 AES（encryptMode2）也失败');
    console.log('3. 同会话 key 确认正确');
    console.log('4. query 加密算法不是 AES-CBC');
    console.log('5. 可能是 AES-ECB / AES-CTR / 自定义流密码');
    console.log('6. 或：加密前有预处理（huffman/xor）');
  } else {
    console.log(`\n=== ${hits.length} 个命中 ===`);
    hits.sort((a, b) => b.ratio - a.ratio);
    hits.slice(0, 5).forEach(h => {
      console.log(`  ${h.name} ${h.test}: ${(h.ratio*100).toFixed(0)}%`);
      const text = h.dec.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
      if (text.length > 3) console.log(`    text: "${text.substring(0, 50)}"`);
    });
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
