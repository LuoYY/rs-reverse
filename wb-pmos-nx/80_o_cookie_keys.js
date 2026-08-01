/**
 * 80_o_cookie_keys.js
 *
 * O cookie 解密（纯算法 keys 方向）：
 * O 是服务器签发（挑战页 set-cookie）→ 可能含 keys2/会话种子
 * 用 keys16 解密 O → 分析结构 → 找 keys2
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function httpGet(url) {
  return new Promise(r => {
    const req = https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', (e) => r({ status: 'ERR', body: '', headers: {} }));
    req.setTimeout(60000, () => { req.destroy(); r({ status: 'TIMEOUT', body: '', headers: {} }); });
  });
}
function decodeStr(s) {
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(s.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]], c3 = idxmap[s[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < s.length) { const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  else if (qi + 1 < s.length) bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4));
  return bytes;
}

(async () => {
  // 初始化管线
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

  // 多会话拉 O（分析结构一致性）
  const oSamples = [];
  for (let i = 0; i < 3; i++) {
    const ch = await httpGet(TARGET);
    const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
    oSamples.push({ oCookie, bytes: decodeStr(oCookie.split('=')[1]) });
    console.log(`O${i} 解码 ${oSamples[i].bytes.length}B 头8: ${oSamples[i].bytes.slice(0, 8).join(',')}`);
  }
  // O 结构对比（找恒定段）
  if (oSamples.length >= 2) {
    const samePos = [];
    for (let i = 0; i < Math.min(...oSamples.map(s => s.bytes.length)); i++) {
      if (oSamples.every(s => s.bytes[i] === oSamples[0].bytes[i])) samePos.push(i);
    }
    console.log('O 跨会话恒定段:', samePos.length ? samePos.join(',') : '无（O 全会话变化）');
  }

  // keys16 解密 O（flag=1 带 IV 遍历）
  console.log('\n=== keys16 解密 O ===');
  const ob = oSamples[0].bytes;
  const now = Math.floor(Date.now() / 1000);
  let found = null;
  for (let t = now - 3600; t <= now + 3600 && !found; t++) {
    for (let ele = 1; ele <= 256 && !found; ele++) {
      try {
        const arr = numarrAddTime([...K16], t, ele / 256)[0];
        const dec = encryptMode2([...ob], arr, 1);
        if (dec.length > 20 && dec[0] >= 0 && dec[0] <= 100) {
          // 检查是否像 numarrJoin 结构（[3,...] 或 [2,...]）
          if (dec[0] === 3 || dec[0] === 2 || dec[0] === 10 || dec[0] === 7) { found = { t, ele, dec }; }
        }
      } catch (e) {}
    }
  }
  if (found) {
    console.log('O 解密成功 t=' + found.t + ' ele=' + found.ele + ' len=' + found.dec.length);
    console.log('明文:', found.dec.slice(0, 40).join(','));
    // 找 48 字节 keys2 候选
    for (let i = 0; i + 48 <= found.dec.length; i++) {
      const seg = found.dec.slice(i, i + 48);
      if (seg.every(b => b >= 0 && b <= 255)) {
        console.log('  48B 段 @' + i + ':', seg.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      }
    }
  } else {
    console.log('O 用 keys16 解密无有效结构（O 可能非 keys16 加密或纯随机）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
