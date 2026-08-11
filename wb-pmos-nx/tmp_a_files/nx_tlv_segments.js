// TLV 段精确解析：用 0 分隔符 + 段长度前缀识别 nx base 结构
// 参考 xj: [tag, len, ...data] 序列
const samples = require('./nx_full_samples.json');

// 用 s#0（len=163）详细解析
const b = samples[0].base;
console.log('s#0 len=' + b.length);
console.log('索引:    ' + [...Array(b.length).keys()].map(i => String(i).padStart(3, ' ')).join(''));
console.log('值:      ' + b.map(v => String(v).padStart(3, ' ')).join(''));

// 0 分隔符位置
const zeros = [];
b.forEach((v, i) => { if (v === 0) zeros.push(i); });
console.log('\n0 分隔符:', zeros.join(', '));

// TLV 假设：base = [tag0, len0, ...data0, tag1, len1, ...data1, ...]
// 从 index 0 开始：59 是 tag？148 是 len？但 59>0 而 len=148 太多。
// 另一种：base 首段是"加密头"（59,148,7,120 可能是 huffman 码或标志）
// 观察 [5,6,7]=0 → 前 8 字节可能是 numToNumarr8 的值
// 59,148,7,120,19 = 5 字节? 或 59=tag, [148,7,120,19]=4B 值
console.log('\n=== 手动 TLV 尝试 ===');
// 尝试1：59 = seg tag 0？不。观察已知 huffman 码：59 在 nx 是 ";" 
// 重要：base[0]=59=';' 且 [22:67] 环境段有 0 分隔 → 环境段 = 资源串列表！
// 让我看 [22:67] 转 ASCII
const env = b.slice(22, 67);
console.log('[22:67] ASCII:', env.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
console.log('[22:67] raw:', env.join(','));
console.log('\n[67:110] ASCII:', b.slice(67, 110).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
console.log('[110:163] ASCII:', b.slice(110).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
