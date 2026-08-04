/**
 * 728_A210_verify_nx_basearr2.js
 * 验证 NX_BASEARR_SAMPLE（317B）与浏览器 base 关系（修复解析）
 */
const fs = require('fs');
const path = require('path');

(async () => {
  require('module-alias')(path.dirname(require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_glm', 'utils/paths.js')).package));
  require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_glm', 'src/handler/parser/constData')).init();
  const numarrEncrypt = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/parser/common/numarrEncrypt');

  const src = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/basearr/len243-nx.js', 'utf8');
  const m = src.match(/NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const cleaned = m[1].replace(/\n/g, '').replace(/,\s*\]/, ']');
  const sampleArr = JSON.parse(cleaned);
  console.log('NX_BASEARR_SAMPLE len:', sampleArr.length);
  console.log('前 32:', sampleArr.slice(0, 32).join(','));

  const enc = numarrEncrypt(sampleArr);
  console.log('numarrEncrypt len:', enc.length);
  console.log('numarrEncrypt 前 32:', enc.slice(0, 32).join(','));

  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  console.log('\n浏览器 base len:', baseD.base.length);
  console.log('浏览器 base 前 32:', baseD.base.slice(0, 32).join(','));
  console.log('浏览器 base 尾 10:', baseD.base.slice(-10).join(','));

  // 对比
  console.log('\n=== 对比 ===');
  console.log('sample(317B) numarrEncrypt →', enc.length, '字节');
  console.log('浏览器 base →', baseD.base.length, '字节');
  console.log('enc[0:32]  :', enc.slice(0, 32).join(','));
  console.log('base[0:32] :', baseD.base.slice(0, 32).join(','));

  // 明文 basearr
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;
  console.log('\n浏览器明文 basearr len:', plain.length, '头:', plain.slice(0, 8).join(','));
  console.log('sample 与明文关系: sample 是明文?', sampleArr.slice(0, 8).join(','));
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
