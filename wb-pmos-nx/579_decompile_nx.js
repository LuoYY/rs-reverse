/**
 * 579_decompile_nx.js
 * 用 nx 操作码表（560 号提取的 dispatcher 语义）反编译 nx bytecode
 * 完整输出：操作码 + 数据 + 语义
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const bc = JSON.parse(fs.readFileSync('/tmp/nx_bytecode.json', 'utf8'));
const nxTable = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/nx_opcode_table.json'))).handlers;

// nx dispatcher 语义的简明分类
// 从 nx dispatcher（_$$Y）语义判断：
const nxSem = {};
// op18: _$_w[_$gk++]=_$iL[_$_2[++_$hy]] → PUSH 常量池（属性名池）
// op57: _$_w[_$gk++]=_$_2[++_$hy] → PUSH 立即数
// 根据 dispatcher 代码手动标注关键 opcode
// （dispatcher 结构：<=63 二分树，op0=return, op1=call2, op2=call1, op3=set, op4=return2...）

// 从 nx_opcode_table.json 的 handler 推断每个 op 的操作
function classify(op, handler) {
  const h = handler || '';
  if (h.includes('_$k3[4]=1')) return 'RETURN_VAL';
  if (h.includes('_$k3[4]=2')) return 'RETURN';
  if (h.includes('_$gk-=2') && h.includes('_$ow(_$_w')) return 'CALL2';
  if (h.includes('_$gk--') && h.includes('_$ow(_$_w')) return 'CALL1';
  if (h.startsWith('_$ow=_$iK')) return 'SET_GLOBAL';
  if (h.startsWith('_$_w[_$gk++]=_$iL[')) return 'PUSH_POOL';
  if (h.startsWith('_$_w[_$gk++]=_$_2[')) return 'PUSH_IMM';
  if (h.startsWith('_$_w[_$gk++]=_$h9[')) return 'PUSH_CSTR';
  if (h.startsWith('_$_w[_$gk++]=_$pk[')) return 'PUSH_KEYS';
  if (h.startsWith('_$_w[_$gk++]=_$o_[')) return 'PUSH_ARG';
  if (h.includes('_$k3[4]')) return 'VM_RET';
  if (h.includes('_$hy+=_$h0')) return 'JMP';
  if (h.includes('_$ow[_$h0]')) return 'METHOD';
  if (h.includes('_$ow[_$h0]=_$cb')) return 'ASSIGN_PROP';
  if (h.includes('_$oG[_$o9]')) return 'PROP_OP';
  return 'OP' + op;
}

// 打印 dispatcher 的完整 opcode 分类
const ops = Object.keys(nxTable).map(Number).sort((a, b) => a - b);
console.log('=== nx 操作码分类 ===');
for (const op of ops) {
  const cls = classify(op, nxTable[op]);
  if (cls !== 'OP' + op || [0,1,2,3,4,5,6,8,9,10,12,13,14,16,17,18,20,21,22,24,25,26,28,29,30,32,33,34,36,37,38,40,41,42,44,45,46,48,49,50,52,53,54,56,57,58,60,61,62].includes(op)) {
    console.log(`op${op}: ${cls} | ${(nxTable[op]||'').replace(/\s+/g,' ').substring(0,70)}`);
  }
}
