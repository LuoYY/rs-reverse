/**
 * 02_rs_aes_decrypt.js
 * 
 * 用管线 RS 自定义 AES（encryptMode2）+ 同会话 keys 解密 query
 * 
 * 关键发现：
 * - bytes[0..3] = CRC32(bytes[4..87]) 大端 ✅ 7/7 验证通过
 * - 结构：[CRC32 4B][1][0][48][session 48B][32][request 32B]
 * - 文章指出 query 和 cookie 共享管线（encryptMode1/2）
 * - arr_21 = cookie 的 arr_20_to_21（keys17 + time/ele）
 */

const path = require('path');
const fs = require('fs');

// 初始化 module-alias
require('module-alias')(path.join(__dirname, '..'));

const gv = require('@src/handler/globalVarible');
const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrJoin = require('@src/handler/parser/common/numarrJoin');
const uuid = require('@src/handler/parser/common/uuid');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

// numarr2string 逆操作
function string2numarr(str) {
  const keys = basestr.split('');
  const lookup = {};
  keys.forEach((ch, idx) => { lookup[ch] = idx; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = i < str.length ? lookup[str[i]] : undefined;
    const c1 = i + 1 < str.length ? lookup[str[i + 1]] : undefined;
    const c2 = i + 2 < str.length ? lookup[str[i + 2]] : undefined;
    const c3 = i + 3 < str.length ? lookup[str[i + 3]] : undefined;
    if (c0 !== undefined && c1 !== undefined) ans.push((c0 << 2) | (c1 >> 4));
    if (c1 !== undefined && c2 !== undefined) ans.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c2 !== undefined && c3 !== undefined) ans.push(((c2 & 3) << 6) | c3);
  }
  return ans;
}

// 加载数据
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/capture-20080/query-diff-data.json'), 'utf8'));
const keys = data.keys;

console.log('=== RS AES 解密尝试 ===\n');

// 解码第一个 query
const q0 = data.queries[0];
const bytes = string2numarr(q0.query.substring(1));
console.log(`Query[0]: ${q0.method} ${q0.path}`);
console.log(`  解码: ${bytes.length} bytes`);

const sessionData = bytes.slice(7, 55);  // 48B
const requestData = bytes.slice(56, 88); // 32B
const header = bytes.slice(4, 7);        // [1, 0, 48]

console.log(`  session_data: ${sessionData.length}B`);
console.log(`  request_data: ${requestData.length}B`);

// 收集所有可能的 key
const keyList = [];
for (const [k, v] of Object.entries(keys)) {
  if (v.length >= 16) {
    keyList.push({ name: `keys[${k}](${v.length}B)`, key: v });
    if (v.length > 16 && v.length !== 32) {
      keyList.push({ name: `keys[${k}][0:16]`, key: v.slice(0, 16) });
    }
  }
}

// 也构造 arr_21 = numarrAddTime(keys17)
const keys16 = keys['16'];
const keys17 = keys['17'];
console.log(`\n  keys[16] = [${keys16.join(',')}] (${keys16.length}B)`);
console.log(`  keys[17] = [${keys17.join(',')}] (${keys17.length}B)`);

// numarrAddTime 变换
try {
  const [arr21, timeEle] = numarrAddTime(keys17);
  console.log(`  arr_21 = numarrAddTime(keys17) = [${arr21.join(',')}] (${arr21.length}B)`);
  keyList.push({ name: 'arr_21(numarrAddTime(keys17))', key: arr21 });
} catch(e) {
  console.log(`  numarrAddTime error: ${e.message}`);
}

// 也试 keys17 直接作为 key（getCfg 会自动 strip）
keyList.push({ name: 'keys17_direct', key: keys17 });
keyList.push({ name: 'keys16_direct', key: keys16 });

// 组合 key
if (keys16 && keys17) {
  keyList.push({ name: 'keys16+keys17[0:16]', key: [...keys16.slice(0, 8), ...keys17.slice(0, 8)] });
  keyList.push({ name: 'keys17+keys16[0:16]', key: [...keys17.slice(0, 8), ...keys16.slice(0, 8)] });
}

console.log(`\n  总共 ${keyList.length} 个 key 候选\n`);

// 初始化 gv（需要 cfgnum 等查找表）
// 先检查 gv 是否已初始化
let gvReady = false;
try {
  const testCfg = gv.cfgnum;
  if (testCfg && testCfg[0]) gvReady = true;
} catch(e) {}

if (!gvReady) {
  console.log('  gv 未初始化，尝试通过 config 初始化...');
  try {
    const config = require('@src/config/');
    config(gv);
    gvReady = true;
    console.log('  gv 初始化成功');
  } catch(e) {
    console.log(`  gv 初始化失败: ${e.message}`);
    console.log('  将使用 Node.js crypto 模块代替');
  }
}

// 用 RS encryptMode2 解密
console.log('\n--- RS encryptMode2 解密 ---');
for (const kc of keyList) {
  for (const [targetName, target] of [['session', sessionData], ['request', requestData]]) {
    for (const flag of [0, 1]) {
      try {
        const pt = encryptMode2([...target], [...kc.key], flag);
        const ascii = pt.filter(b => b >= 32 && b < 127).length;
        const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
        if (ratio > 55 || pt.length > 0) {
          const preview = pt.slice(0, 30).join(',');
          const asciiStr = pt.filter(b => b >= 32 && b < 127).map(b => String.fromCharCode(b)).join('');
          console.log(`  ${kc.name} ${targetName} flag=${flag}: ${pt.length}B, ASCII ${ratio}% [${preview}] ${asciiStr.length > 3 ? '"' + asciiStr.substring(0, 30) + '"' : ''}`);
        }
      } catch(e) {
        // 静默跳过错误
      }
    }
  }
}

// 用 Node.js crypto 标准 AES 解密
console.log('\n--- Node.js crypto AES 解密 ---');
const crypto = require('crypto');

for (const kc of keyList) {
  const keyBuf = Buffer.from(kc.key);
  if (keyBuf.length !== 16 && keyBuf.length !== 24 && keyBuf.length !== 32) continue;
  
  for (const [targetName, target] of [['session', sessionData], ['request', requestData]]) {
    const dataBuf = Buffer.from(target);
    
    // CBC with zero IV
    for (const ivName of ['zero', 'first16']) {
      try {
        const iv = ivName === 'zero' ? Buffer.alloc(16, 0) : dataBuf.slice(0, 16);
        const ct = ivName === 'first16' ? dataBuf.slice(16) : dataBuf;
        if (ct.length === 0 || ct.length % 16 !== 0) continue;
        
        const algo = keyBuf.length === 16 ? 'aes-128-cbc' : keyBuf.length === 24 ? 'aes-192-cbc' : 'aes-256-cbc';
        const decipher = crypto.createDecipheriv(algo, keyBuf, iv);
        decipher.setAutoPadding(true);
        let pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        
        const ascii = [...pt].filter(b => b >= 32 && b < 127).length;
        const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
        if (ratio > 55) {
          console.log(`  ★ ${kc.name} ${targetName} CBC iv=${ivName}: ${pt.length}B, ASCII ${ratio}% "${pt.toString('utf8').substring(0, 40)}"`);
        }
      } catch(e) {}
    }
    
    // ECB
    try {
      const algo = keyBuf.length === 16 ? 'aes-128-ecb' : keyBuf.length === 24 ? 'aes-192-ecb' : 'aes-256-ecb';
      const decipher = crypto.createDecipheriv(algo, keyBuf, null);
      decipher.setAutoPadding(true);
      let pt = Buffer.concat([decipher.update(dataBuf), decipher.final()]);
      
      const ascii = [...pt].filter(b => b >= 32 && b < 127).length;
      const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
      if (ratio > 55) {
        console.log(`  ★ ${kc.name} ${targetName} ECB: ${pt.length}B, ASCII ${ratio}% "${pt.toString('utf8').substring(0, 40)}"`);
      }
    } catch(e) {}
  }
}

// 额外尝试：用 cookie 值派生 key
console.log('\n--- Cookie 派生 key 尝试 ---');
if (data.cookie) {
  const cookieBytes = string2numarr(data.cookie.substring(1));
  console.log(`  Cookie 解码: ${cookieBytes.length}B`);
  
  // MD5(cookie) 作为 key
  const md5 = crypto.createHash('md5').update(Buffer.from(cookieBytes)).digest();
  console.log(`  MD5(cookie): [${[...md5].join(',')}]`);
  
  for (const [targetName, target] of [['session', sessionData], ['request', requestData]]) {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', md5, Buffer.alloc(16, 0));
      decipher.setAutoPadding(true);
      let pt = Buffer.concat([decipher.update(Buffer.from(target)), decipher.final()]);
      const ascii = [...pt].filter(b => b >= 32 && b < 127).length;
      const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
      if (ratio > 55) {
        console.log(`  ★ MD5(cookie) ${targetName}: ${pt.length}B, ASCII ${ratio}%`);
      }
    } catch(e) {}
  }
  
  // SHA1(cookie)[0:16] 作为 key
  const sha1 = crypto.createHash('sha1').update(Buffer.from(cookieBytes)).digest().slice(0, 16);
  for (const [targetName, target] of [['session', sessionData], ['request', requestData]]) {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', sha1, Buffer.alloc(16, 0));
      decipher.setAutoPadding(true);
      let pt = Buffer.concat([decipher.update(Buffer.from(target)), decipher.final()]);
      const ascii = [...pt].filter(b => b >= 32 && b < 127).length;
      const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
      if (ratio > 55) {
        console.log(`  ★ SHA1(cookie)[0:16] ${targetName}: ${pt.length}B, ASCII ${ratio}%`);
      }
    } catch(e) {}
  }
}

// 尝试用 O cookie 派生
if (data.oCookie) {
  const oCookieVal = data.oCookie.split('=').slice(1).join('=');
  const oBytes = string2numarr(oCookieVal);
  console.log(`  O cookie 解码: ${oBytes.length}B`);
  
  const md5o = crypto.createHash('md5').update(Buffer.from(oBytes)).digest();
  for (const [targetName, target] of [['session', sessionData], ['request', requestData]]) {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', md5o, Buffer.alloc(16, 0));
      decipher.setAutoPadding(true);
      let pt = Buffer.concat([decipher.update(Buffer.from(target)), decipher.final()]);
      const ascii = [...pt].filter(b => b >= 32 && b < 127).length;
      const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
      if (ratio > 55) {
        console.log(`  ★ MD5(Ocookie) ${targetName}: ${pt.length}B, ASCII ${ratio}%`);
      }
    } catch(e) {}
  }
}

// 暴力搜索：keys[2] 的滑动窗口
console.log('\n--- keys[2] 滑动窗口 (48B → 16B/32B 子串) ---');
const keys2 = keys['2'];
if (keys2 && keys2.length >= 16) {
  for (let offset = 0; offset <= keys2.length - 16; offset++) {
    const subkey = keys2.slice(offset, offset + 16);
    for (const [targetName, target] of [['session', sessionData], ['request', requestData]]) {
      try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(subkey), Buffer.alloc(16, 0));
        decipher.setAutoPadding(true);
        let pt = Buffer.concat([decipher.update(Buffer.from(target)), decipher.final()]);
        const ascii = [...pt].filter(b => b >= 32 && b < 127).length;
        const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
        if (ratio > 65) {
          console.log(`  ★ keys[2][${offset}:${offset+16}] ${targetName}: ${pt.length}B, ASCII ${ratio}% "${pt.toString('utf8').substring(0, 40)}"`);
        }
      } catch(e) {}
    }
  }
}

console.log('\n=== 完成 ===');
