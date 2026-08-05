// 用管线的 numarrEncrypt 逆实现正确解密 basearr（处理 getKey padding）
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const crypto = require('crypto');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const parser = require('@src/handler/parser/');

// 看 numarrEncrypt 源码（理解 padding）
const ne = parser.numarrEncrypt.toString();
console.log('numarrEncrypt 源码:', ne.substring(0, 500));

(async () => {
  // 用 317B 样本验证: numarrEncrypt(317B) 应该 = cookie 的 basearrEncrypt
  const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
  const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const sample = m[1].split(',').map(x => parseInt(x.trim()));
  // 设置 getKey
  const gv = require('@src/handler/globalVarible');
  gv._setAttr('config', { keynameNum: 1151, adapt: { getKey: 0x68 } });
  const enc = parser.numarrEncrypt(sample);
  console.log('\nnumarrEncrypt(317B) len:', enc.length, '前10:', enc.slice(0, 10).join(','));
  // 逆解码验证
  // numarrEncrypt 输出是 bit 流，逆实现：
  // 看完整源码后写逆
  console.log('\n完整 numarrEncrypt:', ne);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
