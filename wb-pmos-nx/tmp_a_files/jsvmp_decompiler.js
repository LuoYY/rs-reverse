// JSVMP 反编译器：模拟 _$pC + 处理器，解析 gS 字节码为指令序列
const fs = require('fs');
const states = require('./nx_md_states.json');
const { k0, oU } = require('./nx_k0_ou.json');

// _$c8 操作数集合（Unicode 空白）
const c8 = [160, 6158, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8203, 8239, 8287, 12288];
const _i0 = (v) => c8.includes(v);

// _$f1 函数表（op → 处理器名）
const f1 = {
  33: '_$_T', 37: '_$hr', 38: '_$kx', 39: '_$iR', 40: '_$_8', 41: '_$lZ',
  42: '_$hi', 43: '_$ms', 44: '_$kc', 45: '_$fZ', 46: '_$gx', 47: '_$_R',
  58: '_$_q', 59: '_$fU', 60: '_$p2', 61: '_$$6', 62: '_$kp', 63: '_$op',
  91: '_$aa', 93: '_$_E', 94: '_$mX', 96: '_$_c', 123: '_$_m', 124: '_$oH',
  125: '_$hk', 126: '_$$u',
};

// 处理器语义（简化）：每个处理器用 _$dt 读操作数 + 返回 _$$m(类型, 值)
// 这里只解析指令序列（不实际执行）
function decompile(gS, name) {
  const ops = [];
  let hZ = 0;
  const read = () => gS[hZ++];
  const peek = () => gS[hZ];
  const dt = () => { const v = gS[hZ++]; return v; };
  const steps = [];
  let guard = 0;
  while (hZ < gS.length && guard++ < 500) {
    // _$pC: 读 opcode + 跳过操作数
    let v = gS[hZ];
    const startH = hZ;
    hZ++;  // 读第一个
    // 跳过操作数（_$pC 的 while）
    while (v === 32 || (9 <= v && v <= 13) || (v > 128 && _i0(v))) {
      v = gS[hZ++];
    }
    const op = v;
    const handler = f1[op];
    if (handler) {
      // 处理器执行（简化：记录 opcode + 处理器）
      steps.push({ pc: startH, op, handler });
    } else if (op > 170) {
      steps.push({ pc: startH, op, nested: true });
    } else if (op === 0) {
      steps.push({ pc: startH, op: 0, ret: true });
      break;
    } else {
      steps.push({ pc: startH, op, unknown: true });
      break;
    }
  }
  return steps;
}

// 解析 3 种 gS
const gs92 = states.find(s => s.gS && s.gS.length === 92);
const gs36 = states.find(s => s.gS && s.gS.length === 36);
const gs13 = states.find(s => s.gS && s.gS.length === 13);

for (const [name, s] of [['gS92', gs92], ['gS36', gs36], ['gS13', gs13]]) {
  console.log('\n=== ' + name + ' (len=' + s.gS.length + ') ===');
  const steps = decompile(s.gS, name);
  steps.forEach((st, i) => {
    console.log('#' + i + ' pc=' + st.pc + ' op=' + st.op + (st.handler ? ' → ' + st.handler : st.nested ? ' → 嵌套' : st.ret ? ' → 返回' : ' → ???'));
  });
}
