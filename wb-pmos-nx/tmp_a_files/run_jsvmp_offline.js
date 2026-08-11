// 纯 Node 离线运行 JSVMP 编码器（_$iE 闭包 + 捕获的参数）
// 目标：验证能否独立执行 gS 字节码 → 输出编码结果
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// 1. 加载闭包和依赖
const iE = fs.readFileSync(path.join(__dirname, 'jsvmp_iE_closure.js'), 'utf8');
const iz = fs.readFileSync(path.join(__dirname, 'jsvmp_aux.js'), 'utf8');

// 2. 捕获的参数
const args = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_iE_args.json'), 'utf8'))[0];

// 3. 构建 sandbox（_$iE 需要的外部符号）
const sandbox = {
  // 原生对象
  Array, Date, RegExp, String, Math, JSON, console,
  // JSVMP 依赖
  _$a8: Array,
  _$fF: Date,
  _$cD: RegExp,
  _$a2: {},  // window 简化（编码器可能用不到）
  _$av: { fromCharCode: String.fromCharCode },
  // 捕获的 gS 字符串（大参数，用 eval 传入）
  // 辅助函数已包含在 iE 闭包内
};
const ctx = vm.createContext(sandbox);

// 4. 加载 _$iE 定义 + _$iz
try {
  vm.runInContext(iE, ctx, { filename: 'iE.js' });
  console.log('[OF] _$iE 定义 OK');
} catch (e) { console.log('[OF] _$iE 加载失败:', e.message); console.log(e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); }
try {
  vm.runInContext(iz, ctx, { filename: 'iz.js' });
  console.log('[OF] _$iz 定义 OK');
} catch (e) { console.log('[OF] _$iz 加载失败:', e.message); }

// 5. 调用 _$iE（用捕获的参数）
// 注意：捕获的 aq 是 gS 字符串（62772 字符），k6/hZ/nD/oA/jM/hP 是数组（部分摘要）
// 完整数组无法从 JSON 恢复（只存了摘要），需从 dynCode 运行捕获完整值
// 先测试：用简化参数能否启动（验证闭包完整性）
try {
  const result = vm.runInContext(`(function(){
    try {
      var gs = __gS_STRING__;
      var ret = _$iE(gs, [],[],[],[],[],[]);
      return {ok: true, type: typeof ret, ret: String(ret).slice(0, 100)};
    } catch(e) { return {err: String(e && e.message || e), stack: String(e && e.stack).split(String.fromCharCode(10)).slice(0, 8)}; }
  })()`, ctx);
  console.log('[OF] 调用结果:', JSON.stringify(result).slice(0, 300));
} catch (e) { console.log('[OF] 调用异常:', e.message); }
process.exit(0);
