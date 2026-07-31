/**
 * 33_extract_opcode_semantics.js
 *
 * 从 VM dispatcher (_$hE, 8852字符) 源码提取精确操作码语义
 * 然后反汇编 206 元素字节码（构造 plain24 并调用 [165] 的子程序）
 */
const fs = require('fs');
const path = require('path');

const f = fs.readdirSync(path.join(__dirname, 'captures')).filter(x => x.startsWith('plain24_script_')).sort().pop();
const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures', f), 'utf8'));
const dyn = d.sources[0].source;

// 提取 _$hE 函数（VM dispatcher，偏移 42001..50853）
const vmSrc = dyn.substring(42001, 50853);
console.log('VM dispatcher 源码长度:', vmSrc.length);

// 从 vmfull 获取 206 字节码
const vf = fs.readdirSync(path.join(__dirname, 'captures')).filter(x => x.startsWith('vmfull_hit3_')).sort().pop();
const vd = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures', vf), 'utf8'));
const f1 = vd.frames[1];
let bytecode = null;
for (const [k, v] of Object.entries(f1.vars)) {
  if (v && v.t === 'arr' && v.d.length === 206) bytecode = v.d;
}
console.log('206 字节码:', bytecode ? bytecode.join(',') : '未找到');

// 手动解析 _$hE 的二叉 if 树 → 操作码语义表
// 结构: if(_$_6<=N) ... else if(_$_6<=M) ...
// 我们用正则按 _$_6<=数字 切分
const opCodes = {}; // op -> handler code
function parseTree(code) {
  // 递归解析 "cond?A:B" 结构太复杂，改用扫描法
  // 模式: _$_6<=数字?分支:分支 嵌套
  // 简化：提取每个 op 边界位置
  const marks = [];
  const re = /_\$_6<=(\d+)\?/g;
  let m;
  while ((m = re.exec(code))) marks.push({ op: +m[1], idx: m.index });
  return marks;
}

// 打印 dispatcher 的结构概览（前 100 操作码）
const marks = parseTree(vmSrc);
console.log('\n=== 操作码边界（前 30）===');
marks.slice(0, 30).forEach((mk, i) => {
  const next = marks[i + 1] ? marks[i + 1].idx : vmSrc.length;
  console.log(`op<=${mk.op}: ${vmSrc.substring(mk.idx, Math.min(mk.idx + 60, next)).replace(/\s+/g, ' ').substring(0, 55)}`);
});

// 保存完整语义表
fs.writeFileSync(path.join(__dirname, 'opcode_semantics_v2.json'), JSON.stringify({
  marks: marks.map(mk => ({ op: mk.op, idx: mk.idx })), vmSrc,
}, null, 2));
console.log('\n语义表已保存（共 ' + marks.length + ' 个操作码边界）');
process.exit(0);
