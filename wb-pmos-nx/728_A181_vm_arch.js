/**
 * 728_A181_vm_arch.js
 * 分析内层 VM 架构：_\$iD 分发器 + bytecode 解码（分层判断）
 * 从 dynCode 源码中找 _\$iD 和 _\$b1（VM 解释器）
 */
const fs = require('fs');

(async () => {
  const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  // 找 _\$iD 定义
  let idx = code.indexOf('function _$iD');
  console.log('function _$iD @', idx);
  if (idx >= 0) {
    // 打印 _\$iD 完整（操作码分发）
    let depth = 0, started = false, end1 = -1;
    for (let i = idx; i < code.length; i++) {
      const c = code[i];
      if (c === '{') { depth++; started = true; }
      else if (c === '}') { depth--; if (started && depth === 0) { end1 = i; break; } }
    }
    console.log('_\$iD 长度:', end1 - idx);
    console.log(code.substring(idx, idx + 6000));
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
