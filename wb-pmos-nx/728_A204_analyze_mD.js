/**
 * 728_A204_analyze_mD.js
 * 分析 VM 环境池 _\$mD（626 元素）——base[68:92] 加密的潜在输入
 */
const fs = require('fs');

(async () => {
  const dump = JSON.parse(fs.readFileSync('/tmp/nx_browser_cS_state_dump.json', 'utf8'));
  // 从 _\$cS 帧的闭包找 _\$mD
  let mD = null, lP = null;
  for (const f of dump.frames) {
    for (const s of f.scopes) {
      if (s.arrs['_$mD']) { mD = JSON.parse(s.arrs['_$mD'].substring(s.arrs['_$mD'].indexOf(':') + 1)); break; }
      if (s.arrs['_$hP']) { mD = JSON.parse(s.arrs['_$hP'].substring(s.arrs['_$hP'].indexOf(':') + 1)); break; }
    }
    if (mD) break;
  }
  if (!mD) { console.log('未找到 _\$mD'); process.exit(1); }
  console.log('_\$mD len:', mD.length);

  // dump 完整内容（分段）
  console.log('_\$mD 完整:');
  for (let i = 0; i < mD.length; i++) {
    const v = mD[i];
    if (Array.isArray(v)) console.log(`  mD[${i}] (arr len ${v.length}): ${JSON.stringify(v).substring(0, 150)}`);
    else if (v !== null && v !== undefined) console.log(`  mD[${i}]: ${String(v).substring(0, 80)}`);
  }

  // base[68:92] 与 mD 中数值的关系
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  const seg = baseD.base.slice(68, 92);
  console.log('\nbase[68:92]:', seg.join(','));
  const nums = mD.filter(v => typeof v === 'number');
  console.log('mD 数值:', nums.join(','));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
