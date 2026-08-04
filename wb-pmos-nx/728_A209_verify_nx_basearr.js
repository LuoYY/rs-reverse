/**
 * 728_A209_verify_nx_basearr.js
 * 验证 len243-nx 的 NX_BASEARR_SAMPLE（317B）与浏览器 base/be 的关系
 */
const fs = require('fs');
const path = require('path');

(async () => {
  require('module-alias')(path.dirname(require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_glm', 'utils/paths.js')).package));
  require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_glm', 'src/handler/parser/constData')).init();
  const numarrEncrypt = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/parser/common/numarrEncrypt');

  // NX_BASEARR_SAMPLE（317B）
  const sample = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/basearr/len243-nx') ? null : null;
  // 直接读源
  const src = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/src/handler/basearr/len243-nx.js', 'utf8');
  const m = src.match(/NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const sampleArr = JSON.parse('[' + m[1].replace(/\n/g, '') + ']');
  console.log('NX_BASEARR_SAMPLE len:', sampleArr.length);
  console.log('前 32:', sampleArr.slice(0, 32).join(','));

  // numarrEncrypt
  const enc = numarrEncrypt(sampleArr);
  console.log('numarrEncrypt len:', enc.length);
  console.log('numarrEncrypt 前 32:', enc.slice(0, 32).join(','));

  // 对比浏览器 base（/tmp/nx_final_base.json，159B）
  const baseD = JSON.parse(fs.readFileSync('/tmp/nx_final_base.json', 'utf8'));
  console.log('\n浏览器 base len:', baseD.base.length);
  console.log('浏览器 base 前 32:', baseD.base.slice(0, 32).join(','));
  console.log('浏览器 base 尾 10:', baseD.base.slice(-10).join(','));

  // enc vs base 对比
  console.log('\nnumarrEncrypt(317B) vs 浏览器 base:');
  console.log('enc[0:32]:', enc.slice(0, 32).join(','));
  console.log('base[0:32]:', baseD.base.slice(0, 32).join(','));

  // 317B 样本是否 = 浏览器 basearr（明文）？明文 basearr 应 113 开头，但 sample 176 开头
  // sample 是加密前 basearr（numarrEncrypt 输入），值域 0-255
  // 浏览器明文 basearr（134B）113 开头 → numarrEncrypt → ?
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;
  const encPlain = numarrEncrypt(plain);
  console.log('\nnumarrEncrypt(明文134B) len:', encPlain.length);
  console.log('encPlain 前 32:', encPlain.slice(0, 32).join(','));
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
