/**
 * 523_test_nxclient.js
 * 验证 nx_pure_client 的 genCookie（重加密）是否真正 200
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');

(async () => {
  const { NxClient, parseProxy } = require(path.join(__dirname, 'nx_pure_client'));
  const proxyStr = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
  const c = await NxClient.create({ proxy: proxyStr, proxyObj: parseProxy(proxyStr) });
  // 生成一个新 cookie（重加密）并打印
  const newCookie = c.genCookie();
  console.log('genCookie len:', newCookie.length);
  console.log('采集时 cookie len:', c.cookie.length);
  const r = await c.request('POST', '/px-common-authcenter/auth/v2/captcha/get', { captchaType: 'blockPuzzle' });
  console.log('request:', r.status, r.body.substring(0, 60).replace(/\n/g, ' '));
  await c.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
