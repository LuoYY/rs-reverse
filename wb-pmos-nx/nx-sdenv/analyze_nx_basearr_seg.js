// 验证 164B basearr 真实性 + 分析 seg 结构
// 1. numarrEncrypt(164B) == cookie 的 basearrEncrypt?
// 2. 对比 317B 样本的结构
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

(async () => {
  // 用已解出的 164B basearr
  const d = JSON.parse(fs.readFileSync('/tmp/nx_basearr_full3.json', 'utf8'));
  const basearr = d.basearr;
  const cookieK2 = d.cookieK2;
  console.log('basearr len:', basearr.length);

  // numarrEncrypt（管线版，含 getKey 配置）
  const gv = require('@src/handler/globalVarible');
  gv._setAttr('config', { keynameNum: 1151, adapt: { getKey: 0x68 } });
  const enc = numarrEncrypt(basearr);
  console.log('numarrEncrypt(basearr) len:', enc.length, '前20:', enc.slice(0, 20).join(','));

  // 对比 cookie 的 basearrEncrypt（从 full3 重新提取）
  // 需要重新跑 sdenv 解密获取 basearrEncrypt
  console.log('\n需要从 cookie 重新提取 basearrEncrypt 对比');

  // 分析 basearr seg 结构（对照 xj numarrJoin）
  console.log('\n=== basearr 结构分析 ===');
  console.log('完整 basearr:', basearr.join(','));
  // 尝试: 首字节 181 可能是 numarrJoin 的 tag 3 前的数据？
  // 或者 nx 的 basearr 首字节是 flag 段
  console.log('\n前 30 字节:', basearr.slice(0, 30).join(','));
  // 找 0 分隔的段
  console.log('\n按 0 分隔的段:');
  let seg = [];
  let segIdx = 0;
  for (let i = 0; i <= basearr.length; i++) {
    if (i === basearr.length || basearr[i] === 0) {
      if (seg.length) {
        console.log(`  seg@${segIdx}: [${seg.join(',')}] (${seg.length}B)`);
        seg = [];
      }
      segIdx = i + 1;
    } else {
      seg.push(basearr[i]);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
