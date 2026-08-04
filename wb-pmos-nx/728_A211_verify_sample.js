/**
 * 728_A211_verify_sample.js
 * 验证 NX_BASEARR_SAMPLE（317B）的性质与浏览器 base 关系
 */
const fs = require('fs');
const path = require('path');

(async () => {
  require('module-alias')(path.dirname(require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_glm', 'utils/paths.js')).package));
  require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_glm', 'src/handler/parser/constData')).init();
  const numarrEncrypt = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/parser/common/numarrEncrypt');

  const sample = JSON.parse(fs.readFileSync('/tmp/nx_basearr_sample_317.json', 'utf8'));
  console.log('NX_BASEARR_SAMPLE len:', sample.length);
  console.log('前 32:', sample.slice(0, 32).join(','));

  const enc = numarrEncrypt(sample);
  console.log('numarrEncrypt len:', enc.length);

  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  console.log('浏览器 base len:', baseD.base.length);
  console.log('enc[0:16]:', enc.slice(0, 16).join(','));
  console.log('base[0:16]:', baseD.base.slice(0, 16).join(','));

  // sample 是明文 basearr 吗？值域分析
  console.log('\nsample 值域: 0-', Math.max(...sample), ' 含 0 数:', sample.filter(v => v === 0).length);
  // 明文 basearr（134B）值域 0-113
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;
  console.log('明文 basearr 值域: 0-', Math.max(...plain), ' 含 0 数:', plain.filter(v => v === 0).length);
  console.log('明文 basearr len:', plain.length);
  console.log('明文头:', plain.slice(0, 8).join(','));

  // sample 317 vs 明文 134 vs base 159/256
  // 317B sample 可能是 numarrEncrypt 后的 basearrEncrypt（非明文）
  // Cookie 类: basearr → numarrEncrypt → XOR keys[2] → encryptMode1(keys17) → basearrEncrypt
  // 317B 是 numarrEncrypt(basearr) 的输入还是输出？
  console.log('\n结论分析:');
  console.log('若 sample(317) 是明文 basearr → numarrEncrypt → enc(?)');
  console.log('明文 basearr 应 113 开头（浏览器实测），但 sample 176 开头');
  console.log('→ sample 不是浏览器明文 basearr，是另一会话的 basearr（176 开头 = 该会话明文）');
  console.log('→ 不同会话明文 basearr 头不同（113/176）？或 sample 是中间形态');
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
