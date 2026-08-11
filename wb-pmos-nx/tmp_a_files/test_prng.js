// 测试 128B 输出是否 = PRNG(seed=时间戳) 的确定性扩展
const calls = require('./nx_mD_calls.json');
const c128 = calls.filter(c => c.after && c.after.length === 128);

// 多种 PRNG
function mulberry32(a) { return function() { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function xorshift32(a) { let x = a || 1; return function() { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
function sfc32(a, b, c, d) { return function() { a |= 0; b |= 0; c |= 0; d |= 0; let t = (a + b | 0) + d | 0; d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = c << 21 | c >>> 11; c = c + t | 0; return (t >>> 0) / 4294967296; }; }
function lcg(seed) { let s = seed || 1; return function() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// 测试：用 pl 作为 seed，生成 128B，对比输出
const target = c128[0]; // pl=521019866
const pl = target.pl;
console.log('目标 pl=' + pl);
console.log('目标输出 head:', target.after.slice(0, 16).join(','));

function genBytes(rand, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(rand() * 256));
  return out;
}
const prngs = {
  mulberry32: mulberry32(pl),
  xorshift32: xorshift32(pl),
  lcg: lcg(pl),
  sfc32: sfc32(pl, pl >> 16, pl << 16, 0x9e3779b9),
};
for (const [name, rand] of Object.entries(prngs)) {
  const out = genBytes(rand, 128);
  let same = 0;
  for (let i = 0; i < 128; i++) if (out[i] === target.after[i]) same++;
  console.log(name + ': 匹配 ' + same + '/128  head=' + out.slice(0, 8).join(','));
}

// 也测试 128B #1（pl=521019873）
const t1 = c128[1];
console.log('\n目标2 pl=' + t1.pl + ' head:', t1.after.slice(0, 8).join(','));
for (const [name, mk] of Object.entries({ mulberry32, xorshift32, lcg })) {
  const out = genBytes(mk(t1.pl), 128);
  let same = 0;
  for (let i = 0; i < 128; i++) if (out[i] === t1.after[i]) same++;
  console.log(name + ': 匹配 ' + same + '/128');
}

// 测试：输出是否 = 时间戳的 4 字节重复或简单变换
console.log('\n时间戳 4 字节:', [(pl >>> 24) & 255, (pl >>> 16) & 255, (pl >>> 8) & 255, pl & 255].join(','));
console.log('输出前 4 字节:', target.after.slice(0, 4).join(','));
