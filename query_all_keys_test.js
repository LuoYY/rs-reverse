/**
 * query_all_keys_test.js — 用所有可能的 key 格式测试
 * 包括直接16字节、u32转换、以及所有捕获的数组
 * 同时测试 encryptMode2 的所有 flag 组合
 * 还测试 numarrAddTime 处理后的 key
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');

const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeQuery(query) {
  var payload = query.startsWith('0') ? query.slice(1) : query;
  var idxmap = {};
  for (var i = 0; i < BASESTR.length; i++) { if (!(BASESTR[i] in idxmap)) idxmap[BASESTR[i]] = i; }
  var bytes = [], i = 0;
  var full = Math.floor(payload.length / 4);
  for (var g = 0; g < full; g++) {
    var c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
    i += 4;
    bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  return bytes;
}

(async () => {
  console.log('=== 全部 key 格式测试 ===\n');

  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var { httpGet } = require('./proxy_http');
  var ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var client = new PmosXjClientProxy();
  await client.init();
  var cp3 = client._extractCp3(+m[1], m[2]);
  await client._genCookie({ nsd: +m[1], cd: m[2], from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 }, cp3);
  
  var gv = require('@src/handler/globalVarible');
  var { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  var numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  
  // 加载 query
  var queryData = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/key-extract-v2.json'), 'utf8'));
  var qBytes = decodeQuery(queryData.query);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  
  // 加载捕获的所有数组
  var allCaptures = queryData.captures;
  console.log('捕获数组:', allCaptures.length);
  
  // 构建 key 候选列表
  var keyCandidates = [];
  
  // 从每个捕获数组生成多种 key 格式
  allCaptures.forEach(function(c, ci) {
    if (c.rl < 4) return;
    
    // 格式1：直接前 16 字节
    if (c.rl >= 16) {
      keyCandidates.push({ src: 'cap' + ci + '_direct16', key: c.d.slice(0, 16).map(function(x) { return x & 0xFF; }) });
    }
    
    // 格式2：u32 转换（前 4 个元素作为 uint32）
    if (c.rl >= 4 && c.rl <= 21) {
      var keyU32 = [];
      for (var bi = 0; bi < 4; bi++) {
        var v = (c.d[bi] || 0) >>> 0;
        keyU32.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF);
      }
      keyCandidates.push({ src: 'cap' + ci + '_u32', key: keyU32 });
    }
    
    // 格式3：21 字节 key（keys17 格式）
    if (c.rl === 21) {
      keyCandidates.push({ src: 'cap' + ci + '_21b', key: c.d.slice(0, 21) });
    }
    
    // 格式4：numarrAddTime 处理
    if (c.rl === 16 || c.rl === 21) {
      try {
        var timeKey = numarrAddTime(c.d.slice(0, c.rl))[0];
        if (timeKey && timeKey.length >= 16) {
          keyCandidates.push({ src: 'cap' + ci + '_addtime', key: timeKey.slice(0, 16) });
        }
      } catch(e) {}
    }
  });
  
  // 添加管线 keys
  keyCandidates.push({ src: 'pipe_keys16', key: gv.keys[16].slice(0, 16) });
  keyCandidates.push({ src: 'pipe_keys17_16', key: gv.keys[17].slice(0, 16) });
  try {
    var k16t = numarrAddTime(gv.keys[16])[0];
    keyCandidates.push({ src: 'pipe_keys16_time', key: k16t.slice(0, 16) });
  } catch(e) {}
  try {
    var k17t = numarrAddTime(gv.keys[17])[0];
    keyCandidates.push({ src: 'pipe_keys17_time', key: k17t.slice(0, 16) });
  } catch(e) {}
  
  // 添加域名 key
  var domainKey = [];
  for (var i = 0; i < 16; i++) domainKey.push("1:pmos.xj.sgcc.c".charCodeAt(i));
  keyCandidates.push({ src: 'domain_key', key: domainKey });
  
  console.log('Key 候选:', keyCandidates.length);
  
  // 测试每个 key
  var found = false;
  var results = [];
  
  keyCandidates.forEach(function(kc) {
    [0, 1].forEach(function(flag) {
      // session
      try {
        var dec = encryptMode2([...sessionData], kc.key, flag);
        if (dec && dec.length > 0) {
          var ascii = dec.filter(function(b) { return b >= 32 && b <= 126; }).length / dec.length;
          results.push({ src: kc.src, flag: flag, target: 'session', len: dec.length, ascii: ascii, data: dec });
          if (ascii > 0.7 && dec.length > 4) {
            console.log('★ ' + kc.src + ' session f=' + flag + ': ' + dec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
            console.log('  key:', kc.key.slice(0,16).map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            console.log('  str:', Buffer.from(dec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 48));
            found = true;
          }
        }
      } catch(e) {}
      
      // request
      try {
        var dec = encryptMode2([...requestData], kc.key, flag);
        if (dec && dec.length > 0) {
          var ascii = dec.filter(function(b) { return b >= 32 && b <= 126; }).length / dec.length;
          results.push({ src: kc.src, flag: flag, target: 'request', len: dec.length, ascii: ascii, data: dec });
          if (ascii > 0.7 && dec.length > 4) {
            console.log('★ ' + kc.src + ' request f=' + flag + ': ' + dec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
            console.log('  key:', kc.key.slice(0,16).map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            console.log('  str:', Buffer.from(dec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 32));
            found = true;
          }
        }
      } catch(e) {}
    });
  });
  
  // 排序显示前 20 个最佳结果
  results.sort(function(a, b) { return b.ascii - a.ascii; });
  console.log('\n=== Top 20 结果 ===');
  results.slice(0, 20).forEach(function(r, i) {
    console.log('[' + i + '] ' + r.src + ' ' + r.target + ' f=' + r.flag + ': ' + r.len + 'B, ' + (r.ascii*100).toFixed(0) + '%');
    if (r.ascii > 0.3) {
      console.log('    str:', Buffer.from(r.data.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 40));
    }
  });
  
  console.log('\n找到有效密钥:', found ? 'YES ★' : 'NO');
  
  if (!found) {
    console.log('\n所有 key 候选都无法产生高 ASCII 解密结果');
    console.log('可能原因：');
    console.log('1. query 加密不是 encryptMode1/encryptMode2（自定义变体）');
    console.log('2. query 在 AES 之前/之后有额外步骤');
    console.log('3. 密钥不在捕获的数组中');
    console.log('→ 需要方案2：完全模拟 VM 子程序 109');
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
