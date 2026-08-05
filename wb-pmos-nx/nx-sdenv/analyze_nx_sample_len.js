// 尝试纯 [len, seg] 变体解析 317B（首字节 = 第一个 seg 长度）
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
  const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const s = m[1].split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));

  // 尝试: 首字节可能是 [3, len, seg] 或直接数据
  // 变体1: [3, len1, seg1, 10, len10, seg10, ...] 标准（已试失败）
  // 变体2: 首字节 176 = 3 加密块后的数据？
  // 观察: 317B 有 tag 3@285, 10@110, 9@97, 0@多处
  // 试: 从首字节 176 开始，检查 [176?] 是否某 tag+len
  console.log('首 20:', s.slice(0, 20).join(','));
  // 试: 第一个值 176 作为 tag? 176=0xB0。可能 nx 的 tag 是别的
  // 试: 如果前 2 字节 [3, 176] 是 tag=3, len=176? 那 seg1 = s[2:178]
  // 3 在 @285，所以开头不是 3
  // 试: 前 4 字节 [176,35,250,1] 可能是 uuid 或 flag
  // 直接用 xj 的 len243.js 对照: xj seg1 = numarrJoin(1, maxTouchPoints, evalLen, 128, uuid4, "MacIntel", ...)
  // nx 的开头应该类似（指纹段）
  console.log('前 16 作为 uuid/flag 解读:');
  console.log('  字节:', s.slice(0, 16).join(','));
  console.log('  ascii:', s.slice(0, 16).map(x => (x >= 32 && x < 127) ? String.fromCharCode(x) : '.').join(''));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
