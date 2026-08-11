// 符号执行器原型：纯 Node vm 执行 dynCode（无 jsdom），输入 keys 配置，输出 base
// 关键：dynCode = (function(_$$5,_$lP){...})(scj, aebi)，无环境依赖
// 步骤：cd → keys → 组装 $_ts(scj/aebi) → vm 执行 dynCode → 捕获 base
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// 1. 加载 dynCode（本地固定版本，含插桩但无环境依赖）
const dynCode = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cs_patched.js', 'utf8');
console.log('dynCode len:', dynCode.length);

// 2. 构造最小环境：$_ts 只有 scj/aebi（无 window/document）
const sandbox = {
  $_ts: { scj: null, aebi: null },
  console,
  globalThis: {},
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

try {
  // 3. 执行 dynCode（需要 scj/aebi 真实数据）
  // 但 scj/aebi 从哪来？—— 从 cd 派生？还是从真实 challenge 提取？
  // 关键：scj/aebi 是外层 VM 从 cd 生成的
  console.log('需要 scj/aebi 输入（来自 cd 或外层 VM）');
  console.log('验证: 无环境依赖下 dynCode 是否可执行（缺少 scj/aebi 会报错）');
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 10000 });
    console.log('执行成功!');
  } catch (e) {
    console.log('执行失败(预期，缺输入):', e.message.slice(0, 100));
  }
} catch (e) {
  console.log('FATAL:', e.message);
}
