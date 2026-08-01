/**
 * 149_check_basestr_runtime.js
 *
 * 打印 gv.basestr / adapt.basestr 实际值 + Cookie.run 用的 keys
 * 确认 nx cookie 编码 basestr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const gv = require('@src/handler/globalVarible');

  console.log('gv.basestr:', JSON.stringify(gv.basestr));
  console.log('gv.basestr 长度:', gv.basestr.length);
  // 手动设置 config 模拟 nx
  const simpleEncrypt = require('@utils/simpleCrypt').simpleEncrypt;
  const host = simpleEncrypt('pmos.nx.sgcc.com.cn'.replace(/^www\./, ''));
  console.log('nx hostname:', host);
  const gv2 = require('@src/handler/globalVarible');
  gv2._setAttr('config', { hostname: host, adapt: { lastWord: 'P' } });
  // 重新 require config 设置
  try {
    const adapts = require('@src/handler/basearr/index').adapts;
    const mod = adapts[host] || adapts[simpleEncrypt(host)];
    console.log('nx adapt:', mod ? JSON.stringify({ lastWord: mod.lastWord, hasDebug: mod.hasDebug, flag: mod.flag, getKey: mod.getKey, basestr: mod.basestr, cookiePrefix: mod.cookiePrefix }) : '无');
  } catch (e) { console.log('adapt 错误:', e.message.substring(0, 60)); }

  // 测试 numarr2string 用 86 basestr 编码的字符
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  const testBytes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const enc1 = numarr2string(testBytes, gv.basestr.split(''));
  console.log('numarr2string(86 basestr):', enc1);
  console.log('字符:', [...new Set(enc1.split(''))].sort().join(''));
  // base64url 风格
  const base64url = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const enc2 = numarr2string(testBytes, base64url.split(''));
  console.log('numarr2string(base64url):', enc2);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
