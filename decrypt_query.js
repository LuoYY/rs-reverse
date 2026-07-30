// 分段 AES-CBC 解密 query 的 session_data 和 request_data
// 遍历所有 keys，尝试 flag=0 和 flag=1
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/query-diff-data.json'), 'utf8'));
  
  // 初始化管线获取 encryptMode2
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(__dirname);
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
  const ts = { nsd: data.nsd, cd: data.cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: 0 };
  // 需要正确的 cp3 - 从数据中重新计算
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const r = runOuterVM({ nsd: data.nsd, cd: data.cd }, outerJsCode);
  ts.cp3Override = r.cp3;
  
  fs.writeFileSync('/tmp/qd-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/qd-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv); require('@src/config/')(gv); gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  coder.run();
  
  const parser = require('@src/handler/parser/');
  const { encryptMode2, numarrAddTime } = parser;
  
  // Query 样本
  const q0 = data.queries[0];
  const sessionData = q0.bytes.slice(7, 55);  // 48 bytes
  const requestData = q0.bytes.slice(56);      // 32 bytes
  const nonce = q0.bytes.slice(0, 4);          // 4 bytes
  
  console.log('=== Session data (48B) decryption ===');
  console.log('Session bytes:', sessionData.slice(0, 16).join(','));
  
  let sessionHits = [];
  const allKeys = gv.keys || [];
  for (let ki = 0; ki < allKeys.length; ki++) {
    const key = allKeys[ki];
    if (!key || key.length < 16) continue;
    
    for (const flag of [0, 1]) {
      try {
        const dec = encryptMode2([...sessionData], [...key], flag);
        if (dec.length >= 10) {
          const ascii = dec.filter(b => b >= 32 && b <= 126).length;
          const ratio = ascii / dec.length;
          // 也检查是否有结构化数据（小数字、长度前缀等）
          const smallNums = dec.filter(b => b < 10).length;
          
          if (ratio > 0.4 || (dec.length === 48 && smallNums < 5)) {
            sessionHits.push({ ki, keyLen: key.length, flag, decLen: dec.length, ascii: (ratio * 100).toFixed(0), head: dec.slice(0, 12) });
          }
        }
      } catch(e) {}
    }
  }
  
  // 也尝试 numarrAddTime 变换后的 keys16/17
  for (const ki of [16, 17]) {
    const key = allKeys[ki];
    if (!key || key.length < 16) continue;
    const now = Math.floor(Date.now() / 1000);
    for (let dt = -5; dt <= 5; dt++) {
      const tt = now + dt;
      for (let ele = 1; ele <= 10; ele++) {
        try {
          const natKey = numarrAddTime([...key], tt, (ele - 1) / 256)[0];
          for (const flag of [0, 1]) {
            const dec = encryptMode2([...sessionData], natKey, flag);
            if (dec.length >= 10) {
              const ascii = dec.filter(b => b >= 32 && b <= 126).length;
              const ratio = ascii / dec.length;
              if (ratio > 0.5) {
                sessionHits.push({ ki: ki + '+nat', keyLen: natKey.length, flag, decLen: dec.length, ascii: (ratio * 100).toFixed(0), head: dec.slice(0, 12), dt, ele });
              }
            }
          }
        } catch(e) {}
      }
    }
  }
  
  console.log('\nSession hits:', sessionHits.length);
  sessionHits.sort((a, b) => parseFloat(b.ascii) - parseFloat(a.ascii));
  sessionHits.slice(0, 10).forEach(h => {
    console.log('  keys[' + h.ki + '] flag=' + h.flag + ': ' + h.decLen + 'B ascii=' + h.ascii + '% head=[' + h.head.join(',') + ']' + (h.dt !== undefined ? ' dt=' + h.dt + ' ele=' + h.ele : ''));
  });
  
  console.log('\n=== Request data (32B) decryption ===');
  console.log('Request bytes:', requestData.join(','));
  
  let requestHits = [];
  for (let ki = 0; ki < allKeys.length; ki++) {
    const key = allKeys[ki];
    if (!key || key.length < 16) continue;
    
    for (const flag of [0, 1]) {
      try {
        const dec = encryptMode2([...requestData], [...key], flag);
        if (dec.length >= 8) {
          const ascii = dec.filter(b => b >= 32 && b <= 126).length;
          const ratio = ascii / dec.length;
          if (ratio > 0.4) {
            requestHits.push({ ki, keyLen: key.length, flag, decLen: dec.length, ascii: (ratio * 100).toFixed(0), head: dec.slice(0, 12) });
          }
        }
      } catch(e) {}
    }
  }
  
  console.log('\nRequest hits:', requestHits.length);
  requestHits.sort((a, b) => parseFloat(b.ascii) - parseFloat(a.ascii));
  requestHits.slice(0, 10).forEach(h => {
    console.log('  keys[' + h.ki + '] flag=' + h.flag + ': ' + h.decLen + 'B ascii=' + h.ascii + '% head=[' + h.head.join(',') + ']');
  });
  
  // 也尝试 nonce 作为 IV 的一部分
  console.log('\n=== Nonce-based IV attempts ===');
  // Maybe: IV = nonce + [0]*12 or nonce repeated
  const ivFromNonce = [...nonce, ...nonce, ...nonce, ...nonce]; // 16 bytes
  
  for (let ki of [16, 17, 2]) {
    const key = allKeys[ki];
    if (!key || key.length < 16) continue;
    
    // Try: prepend nonce as IV, then decrypt rest
    // session+request = 80 bytes, but we need to try different splits
    // Actually, try: the nonce IS the first 4 bytes of a 16-byte IV
    // The remaining 12 bytes might be zeros or from header
    
    // Try: full 88 bytes with custom IV = nonce + zeros
    const customIv = [...nonce, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    // Can't use encryptMode2 with custom IV directly
    // But we can try: decrypt bytes[4..87] (84 bytes) with keys16, flag=0
    const restBytes = q0.bytes.slice(4); // 84 bytes
    try {
      const dec = encryptMode2([...restBytes], [...key], 0);
      const ascii = dec.filter(b => b >= 32 && b <= 126).length;
      console.log('  bytes[4..87] keys[' + ki + '] flag=0: ' + dec.length + 'B ascii=' + (ascii/dec.length*100).toFixed(0) + '%');
    } catch(e) {}
    
    // Try: bytes[7..87] (session+request = 80 bytes = 5 AES blocks)
    const srBytes = q0.bytes.slice(7); // 81 bytes... not aligned
    // bytes[7..54] + bytes[56..87] without the length prefix at 55
    // = 48 + 32 = 80 bytes = 5 blocks
    const srData = [...sessionData, ...requestData]; // 80 bytes
    try {
      const dec = encryptMode2(srData, [...key], 0);
      const ascii = dec.filter(b => b >= 32 && b <= 126).length;
      const ratio = ascii / dec.length;
      if (ratio > 0.3) console.log('  session+request (80B) keys[' + ki + '] flag=0: ' + dec.length + 'B ascii=' + (ratio*100).toFixed(0) + '% head=[' + dec.slice(0, 10).join(',') + ']');
    } catch(e) {}
    
    try {
      const dec = encryptMode2(srData, [...key], 1);
      const ascii = dec.filter(b => b >= 32 && b <= 126).length;
      const ratio = ascii / dec.length;
      if (ratio > 0.3) console.log('  session+request (80B) keys[' + ki + '] flag=1: ' + dec.length + 'B ascii=' + (ratio*100).toFixed(0) + '% head=[' + dec.slice(0, 10).join(',') + ']');
    } catch(e) {}
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
