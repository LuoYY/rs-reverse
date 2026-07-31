/**
 * query_rs_aes_decrypt.js — 用 RS 自定义 AES (encryptMode2) 解密 query
 *
 * 关键突破：
 * 1. 浏览器中成功捕获了 4 个 16 字节 key（通过 Array.prototype.slice hook）
 * 2. 标准 AES-CBC 解密失败 → RS 用自定义 AES（encryptMode2）
 * 3. encryptMode2 的代码在 src/handler/parser/common/modeEncrypt.js
 * 4. RS AES 与标准 AES 的区别：
 *    - 使用自定义 S-Box（gv.cfgnum）
 *    - encryptMode1 = 加密（flag=1 时带 IV）
 *    - encryptMode2 = 解密（flag=1 时剥离 IV）
 *
 * 策略：
 * 1. 加载管线的 encryptMode2
 * 2. 用捕获的 key 解密 query 的 session_data 和 request_data
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');

// RS basestr
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

// numarr2string 解码
function decode(query, basestr) {
  const payload = query.startsWith('0') ? query.slice(1) : query;
  const idxmap = {};
  for (let i = 0; i < basestr.length; i++) { if (!(basestr[i] in idxmap)) idxmap[basestr[i]] = i; }
  const bytes = [];
  let i = 0;
  const full = Math.floor(payload.length / 4);
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
    i += 4;
    bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  const rem = payload.length - i;
  if (rem === 2) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
  else if (rem === 3) { bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4)); bytes.push(((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2)); }
  return bytes;
}

// 加载管线
const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');

(async () => {
  console.log('=== RS 自定义 AES 解密 query ===\n');

  // 初始化管线（获取 gv.cfgnum）
  const client = new PmosXjClientProxy();
  await client.init();
  
  // 获取 gv 模块
  const gv = require('@src/handler/globalVarible');
  console.log('gv.cfgnum 类型:', typeof gv.cfgnum);
  if (gv.cfgnum) {
    console.log('cfgnum 层数:', gv.cfgnum.length);
    console.log('cfgnum[0] 层数:', gv.cfgnum[0].length);
    console.log('cfgnum[0][0] 长度:', gv.cfgnum[0][0].length);
    console.log('cfgnum[0][4] 长度:', gv.cfgnum[0][4].length);
  }

  // 加载 encryptMode2
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  console.log('encryptMode2 loaded:', typeof encryptMode2);

  // 加载捕获的 key 和 query
  const keygenData = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'output/capture-20080/keygen-v4-results.json'), 'utf8'
  ));
  
  const queryBytes = keygenData.queryBytes;
  const keys16captured = keygenData.keys16;
  
  console.log('\nQuery bytes:', queryBytes.length);
  console.log('Captured keys:', keys16captured.length);

  // 拆分 query 结构
  const sessionData = queryBytes.slice(7, 55); // 48 bytes
  const requestData = queryBytes.slice(56, 88); // 32 bytes
  const nonce = queryBytes.slice(0, 4);
  
  console.log('session_data (48B):', sessionData.length);
  console.log('request_data (32B):', requestData.length);

  // 用 encryptMode2 解密
  // encryptMode2(valarr, keyarr, flag)
  // flag=1: 剥离前 16 字节 IV
  // flag=0: 不剥离
  
  console.log('\n=== encryptMode2 解密 ===\n');

  keys16captured.forEach((key, ki) => {
    console.log(`\nKey [${ki}]: ${key.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' ')}`);
    
    [0, 1].forEach(flag => {
      try {
        // session_data
        const sDec = encryptMode2([...sessionData], key, flag);
        if (sDec && sDec.length > 0) {
          const ascii = sDec.filter(b => b >= 32 && b <= 126).length / sDec.length;
          console.log(`  session flag=${flag}: ${sDec.length}B, ${(ascii*100).toFixed(0)}% ASCII`);
          if (ascii > 0.5 || sDec.length < 20) {
            console.log(`    hex: ${sDec.slice(0,40).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' ')}`);
            console.log(`    str: "${Buffer.from(sDec.map(b=>b&0xFF)).toString('utf8').substring(0,40)}"`);
          }
        }
      } catch(e) {
        console.log(`  session flag=${flag}: ERROR ${e.message.substring(0, 60)}`);
      }
      
      try {
        // request_data
        const rDec = encryptMode2([...requestData], key, flag);
        if (rDec && rDec.length > 0) {
          const ascii = rDec.filter(b => b >= 32 && b <= 126).length / rDec.length;
          console.log(`  request flag=${flag}: ${rDec.length}B, ${(ascii*100).toFixed(0)}% ASCII`);
          if (ascii > 0.5 || rDec.length < 20) {
            console.log(`    hex: ${rDec.slice(0,40).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' ')}`);
            console.log(`    str: "${Buffer.from(rDec.map(b=>b&0xFF)).toString('utf8').substring(0,40)}"`);
          }
        }
      } catch(e) {
        console.log(`  request flag=${flag}: ERROR ${e.message.substring(0, 60)}`);
      }
    });
  });

  // 也尝试用管线的 keys16 和 keys17
  console.log('\n=== 管线 keys 解密 ===\n');
  
  // 获取当前会话的 keys
  const { httpGet } = require('./proxy_http');
  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  
  const cp3 = client._extractCp3(nsd, cd);
  const ts2 = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const gen2 = await client._genCookie(ts2, cp3);
  
  // 获取管线 keys
  // 需要从 client 内部获取 gv.keys
  console.log('gv.keys 类型:', typeof gv.keys);
  if (gv.keys) {
    console.log('keys 数量:', gv.keys.length);
    const pipeKeys16 = gv.keys[16];
    const pipeKeys17 = gv.keys[17];
    console.log('pipe keys16:', pipeKeys16 ? pipeKeys16.slice(0, 16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' ') : 'none');
    console.log('pipe keys17:', pipeKeys17 ? pipeKeys17.slice(0, 16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' ') : 'none');
    
    if (pipeKeys16) {
      [0, 1].forEach(flag => {
        try {
          const sDec = encryptMode2([...sessionData], pipeKeys16.slice(0, 16), flag);
          if (sDec && sDec.length > 0) {
            const ascii = sDec.filter(b => b >= 32 && b <= 126).length / sDec.length;
            console.log(`  pipe16 session flag=${flag}: ${sDec.length}B, ${(ascii*100).toFixed(0)}% ASCII`);
            if (ascii > 0.5) {
              console.log(`    str: "${Buffer.from(sDec.map(b=>b&0xFF)).toString('utf8').substring(0,48)}"`);
            }
          }
        } catch(e) { console.log(`  pipe16 session flag=${flag}: ERROR`); }
        
        try {
          const rDec = encryptMode2([...requestData], pipeKeys16.slice(0, 16), flag);
          if (rDec && rDec.length > 0) {
            const ascii = rDec.filter(b => b >= 32 && b <= 126).length / rDec.length;
            console.log(`  pipe16 request flag=${flag}: ${rDec.length}B, ${(ascii*100).toFixed(0)}% ASCII`);
            if (ascii > 0.5) {
              console.log(`    str: "${Buffer.from(rDec.map(b=>b&0xFF)).toString('utf8').substring(0,32)}"`);
            }
          }
        } catch(e) { console.log(`  pipe16 request flag=${flag}: ERROR`); }
      });
    }
  }

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
