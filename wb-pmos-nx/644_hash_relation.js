/**
 * 644_hash_relation.js
 * 系统测试 [25-28] = hash([0-23] 环境指纹 + keys 组合) 截断
 * 多会话数据：633 + 535（S1/S2/S3）
 */
const fs = require('fs');
const crypto = require('crypto');

const d633 = JSON.parse(fs.readFileSync('/tmp/nx_633_data.json', 'utf8'));
const d535 = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

// 组装数据集
const sessions = [
  { name: '633', base: d633.bB, keys: d633.keys },
  { name: 'S1', base: d535[0].basearr, keys: d535[0].keys },
  { name: 'S2', base: d535[1].basearr, keys: d535[1].keys },
  { name: 'S3', base: d535[2].basearr, keys: d535[2].keys },
].filter(s => s.base && s.base.length > 29 && s.keys);

console.log('会话:', sessions.map(s => `${s.name}(${s.base.length}B)`).join(' '));

function BE4(arr) { return arr.reduce((a, x) => a * 256 + x, 0); }
function crc32b(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return ~c >>> 0;
}

// 输入构造：per-session
function buildInputs(s) {
  const k = s.keys;
  const b = s.base;
  const fp = Buffer.from(b.slice(0, 24));
  const k19 = +k[19].map(c => String.fromCharCode(c)).join('');
  const k21 = +k[21].map(c => String.fromCharCode(c)).join('');
  const k22str = k[22] ? k[22].map(c => String.fromCharCode(c)).join('') : '';
  const inputs = {
    'fp': fp,
    'k2': Buffer.from(k[2]),
    'k2前8': Buffer.from(k[2].slice(0, 8)),
    'k2前16': Buffer.from(k[2].slice(0, 16)),
    'k17': Buffer.from(k[17]),
    'k19str': Buffer.from(String(k19)),
    'k21str': Buffer.from(String(k21)),
    'fp+k2前8': Buffer.from([...fp, ...k[2].slice(0, 8)]),
    'fp+k2前16': Buffer.from([...fp, ...k[2].slice(0, 16)]),
    'fp+k2全': Buffer.from([...fp, ...k[2]]),
    'fp+k17': Buffer.from([...fp, ...k[17]]),
    'fp+k19+k21': Buffer.from([...fp, ...Buffer.from(String(k19)), ...Buffer.from(String(k21))]),
    'fp+k22str': Buffer.from([...fp, ...Buffer.from(k22str)]),
    'k2前8+k17前8': Buffer.from([...k[2].slice(0, 8), ...k[17].slice(0, 8)]),
    'fp+k2前8+k17前8': Buffer.from([...fp, ...k[2].slice(0, 8), ...k[17].slice(0, 8)]),
  };
  return inputs;
}

// 对所有会话测试：hash(input) 截断 == [25-28] 且跨会话一致
for (const s of sessions) {
  s.target = s.base.slice(25, 29);
  s.targetBE = BE4(s.target);
}
console.log('目标 [25-28]:', sessions.map(s => `${s.name}=${s.target.map(x => x.toString(16).padStart(2, '0')).join('')}`).join(' '));

const hashFns = {
  md5: (b) => crypto.createHash('md5').update(b).digest(),
  sha1: (b) => crypto.createHash('sha1').update(b).digest(),
  sha256: (b) => crypto.createHash('sha256').update(b).digest(),
  crc32: (b) => { const v = crc32b(b); return [v >>> 24, v >>> 16 & 255, v >>> 8 & 255, v & 255]; },
};

const allInputNames = Object.keys(buildInputs(sessions[0]));
for (const inName of allInputNames) {
  for (const [hn, hf] of Object.entries(hashFns)) {
    // 每个会话算 hash
    const results = sessions.map(s => {
      const buf = buildInputs(s)[inName];
      if (!buf) return null;
      const dig = hf(buf);
      return {
        b0: dig.slice(0, 4), b1: dig.slice(1, 5), b2: dig.slice(2, 6), b3: dig.slice(3, 7), b4: dig.slice(4, 8),
        last4: dig.slice(-4),
      };
    });
    // 检查跨会话匹配
    for (const [posName, getter] of [['[0:4]', r => r.b0], ['[1:5]', r => r.b1], ['[2:6]', r => r.b2], ['[3:7]', r => r.b3], ['[4:8]', r => r.b4], ['[-4:]', r => r.last4]]) {
      const g0 = getter(results[0]);
      if (!g0 || g0.length < 4) continue; // 排除空 slice（crc32 只有 4 字节）
      if (results.every((r, i) => r && getter(r).every((v, j) => v === sessions[i].target[j]))) {
        console.log(`★★★ ${inName} + ${hn} 位置${posName} 跨会话全部匹配 [25-28]!`);
      }
      if (results.every((r, i) => r && getter(r).slice(0, 2).every((v, j) => v === sessions[i].target[j]))) {
        console.log(`★★ ${inName} + ${hn} 位置${posName} 跨会话前2字节匹配`);
      }
    }
  }
}
console.log('完成');
