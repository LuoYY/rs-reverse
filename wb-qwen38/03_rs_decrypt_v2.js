/**
 * 03_rs_decrypt_v2.js
 * 
 * 正确初始化 gv 后用管线 encryptMode2 解密 query
 * 关键：constData.init() 初始化 cfgnum/bignum/decryptKeys
 */

const path = require('path');
const fs = require('fs');

// 初始化 module-alias
require('module-alias')(path.join(__dirname, '..'));

const gv = require('@src/handler/globalVarible');

// 初始化查找表（不需要完整 config）
const constData = require('@src/handler/parser/constData');
constData.init();

console.log('gv.cfgnum 初始化:', gv.cfgnum ? 'OK' : 'FAIL');
console.log('gv.bignum 初始化:', gv.bignum ? 'OK' : 'FAIL');

const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const uuid = require('@src/handler/parser/common/uuid');

const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

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

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/capture-20080/query-diff-data.json'), 'utf8'));
const keys = data.keys;

// 解码所有 query
const queries = data.queries.map((q, i) => {
  const bytes = string2numarr(q.query.substring(1));
  return {
    idx: i,
    method: q.method,
    path: q.path,
    bytes,
    session: bytes.slice(7, 55),
    request: bytes.slice(56, 88),
  };
});

console.log('\n=== RS encryptMode2 解密（同会话 keys）===\n');

const keys16 = keys['16'];
const keys17 = keys['17'];

// 构造各种 key 候选
const keyCandidates = [
  { name: 'keys16', key: keys16 },
  { name: 'keys17', key: keys17 },
];

// arr_21 = numarrAddTime(keys17)
try {
  const [arr21] = numarrAddTime([...keys17]);
  keyCandidates.push({ name: 'arr_21', key: arr21 });
  console.log(`arr_21 = [${arr21.join(',')}] (${arr21.length}B)`);
} catch(e) {
  console.log(`numarrAddTime error: ${e.message}`);
}

// keys[18] (32B)
if (keys['18'] && keys['18'].length === 32) {
  keyCandidates.push({ name: 'keys18', key: keys['18'] });
  keyCandidates.push({ name: 'keys18[0:16]', key: keys['18'].slice(0, 16) });
  keyCandidates.push({ name: 'keys18[16:32]', key: keys['18'].slice(16, 32) });
}

// keys[2] 的子串
if (keys['2']) {
  for (let off = 0; off <= keys['2'].length - 16; off += 16) {
    keyCandidates.push({ name: `keys2[${off}:${off+16}]`, key: keys['2'].slice(off, off + 16) });
  }
}

console.log(`\n${keyCandidates.length} 个 key 候选\n`);

// 对每个 query 的每个段尝试解密
for (const q of queries.slice(0, 2)) { // 只测前 2 个
  console.log(`--- Query[${q.idx}] ${q.method} ${q.path} ---`);
  
  for (const kc of keyCandidates) {
    for (const [segName, seg] of [['session', q.session], ['request', q.request]]) {
      for (const flag of [0, 1]) {
        try {
          const pt = encryptMode2([...seg], [...kc.key], flag);
          if (!pt || pt.length === 0) continue;
          
          const ascii = pt.filter(b => b >= 32 && b < 127).length;
          const ratio = pt.length > 0 ? (ascii / pt.length * 100) : 0;
          
          // 检查是否有结构化数据（非随机）
          const hasStructure = (
            ratio > 60 ||
            (pt.length >= 4 && pt[0] === 0 && pt[1] === 0) || // 可能的长度前缀
            pt.every(b => b < 128) // 全部 ASCII 范围
          );
          
          if (ratio > 50 || hasStructure) {
            const hex = pt.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const asciiStr = pt.filter(b => b >= 32 && b < 127).map(b => String.fromCharCode(b)).join('');
            console.log(`  ${kc.name} ${segName} f=${flag}: ${pt.length}B ASCII=${ratio.toFixed(0)}% hex=[${hex}] ${asciiStr.length > 3 ? '"' + asciiStr.substring(0, 30) + '"' : ''}`);
          }
        } catch(e) {
          // 某些 key 长度不兼容
        }
      }
    }
  }
}

// 额外：验证 encryptMode1(encryptMode2(x)) == x（确认函数正确）
console.log('\n--- 验证 encryptMode1/2 正确性 ---');
const testPlain = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const testKey = keys16;
try {
  const encrypted = encryptMode1([...testPlain], [...testKey], 0);
  const decrypted = encryptMode2([...encrypted], [...testKey], 0);
  const match = JSON.stringify(testPlain) === JSON.stringify(decrypted);
  console.log(`  flag=0: encrypt(${testPlain.length}B) → ${encrypted.length}B → decrypt → ${decrypted.length}B ${match ? '✅' : '❌'}`);
  
  const encrypted1 = encryptMode1([...testPlain], [...testKey], 1);
  const decrypted1 = encryptMode2([...encrypted1], [...testKey], 1);
  const match1 = JSON.stringify(testPlain) === JSON.stringify(decrypted1);
  console.log(`  flag=1: encrypt(${testPlain.length}B) → ${encrypted1.length}B → decrypt → ${decrypted1.length}B ${match1 ? '✅' : '❌'}`);
} catch(e) {
  console.log(`  验证失败: ${e.message}`);
}

// 额外：用 encryptMode2 解密 cookie（验证 keys 正确性）
console.log('\n--- 用 keys16 解密 P cookie ---');
if (data.cookie) {
  const cookieBytes = string2numarr(data.cookie.substring(1));
  console.log(`  P cookie: ${cookieBytes.length}B`);
  
  try {
    // P cookie 外层用 keys16 flag=1 加密
    const pt = encryptMode2([...cookieBytes], [...keys16], 1);
    console.log(`  encryptMode2(keys16, flag=1): ${pt.length}B`);
    console.log(`  前 20B: [${pt.slice(0, 20).join(',')}]`);
    
    // 检查 nextarr 头 [2, 8]
    if (pt.length > 2) {
      console.log(`  nextarr 头: [${pt[0]}, ${pt[1]}] ${pt[0] === 2 && pt[1] === 8 ? '✅ 正确' : '❌ 不匹配'}`);
    }
    
    // CRC32 校验
    if (pt.length > 4) {
      const storedCrc = ((pt[0] << 24) | (pt[1] << 16) | (pt[2] << 8) | pt[3]) >>> 0;
      const computedCrc = uuid(pt.slice(4));
      console.log(`  CRC32: stored=0x${storedCrc.toString(16)} computed=0x${computedCrc.toString(16)} ${storedCrc === computedCrc ? '✅' : '❌'}`);
    }
  } catch(e) {
    console.log(`  解密失败: ${e.message}`);
  }
}

// 关键测试：用 keys17 解密 session_data（文章说 arr_21 = keys17 相关）
console.log('\n--- 关键测试：各种 key 组合解密 session_data ---');
const sessionData = queries[0].session;
const requestData = queries[0].request;

// 测试所有 keys 的所有 16B 子串
for (const [k, v] of Object.entries(keys)) {
  if (v.length < 16) continue;
  for (let off = 0; off <= v.length - 16; off++) {
    const subkey = v.slice(off, off + 16);
    for (const flag of [0, 1]) {
      try {
        const pt = encryptMode2([...sessionData], [...subkey], flag);
        if (!pt || pt.length === 0) continue;
        const ascii = pt.filter(b => b >= 32 && b < 127).length;
        const ratio = pt.length > 0 ? (ascii / pt.length * 100) : 0;
        if (ratio > 65) {
          console.log(`  ★ keys[${k}][${off}:${off+16}] session f=${flag}: ${pt.length}B ASCII=${ratio.toFixed(0)}% [${pt.slice(0,15).join(',')}]`);
        }
      } catch(e) {}
      
      try {
        const pt = encryptMode2([...requestData], [...subkey], flag);
        if (!pt || pt.length === 0) continue;
        const ascii = pt.filter(b => b >= 32 && b < 127).length;
        const ratio = pt.length > 0 ? (ascii / pt.length * 100) : 0;
        if (ratio > 65) {
          console.log(`  ★ keys[${k}][${off}:${off+16}] request f=${flag}: ${pt.length}B ASCII=${ratio.toFixed(0)}% [${pt.slice(0,15).join(',')}]`);
        }
      } catch(e) {}
    }
  }
}

console.log('\n=== 完成 ===');
