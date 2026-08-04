// POST 诊断 v9：标准 plain24（session_id 13B + nonce + 183 + const + counter + crc）
const nx = require('./nx_client');
const { httpPost } = require('./proxy_http');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';

// 固定 session_id（13B）+ counter
let counter = 1;
const sessionId = Array.from({ length: 13 }, () => Math.floor(Math.random() * 256));
function genQueryStd(urlPath, k2, k17) {
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  const [queryKey] = numarrAddTime([...k17], Math.floor(Date.now() / 1000), Math.random());
  const nonce = Array.from({ length: 3 }, () => Math.floor(Math.random() * 256));
  const crcUrl = nx.crc32b ? nx.crc32b(Buffer.from(urlPath.toUpperCase())) : 0;
  const plain24 = [
    ...sessionId,
    ...nonce,
    183, 0,
    (counter >> 8) & 255, counter & 255,
    (crcUrl >>> 24) & 255, (crcUrl >>> 16) & 255, (crcUrl >>> 8) & 255, crcUrl & 255,
  ];
  counter += 2;
  const requestData = encryptMode1(plain24, queryKey, 0);
  const body = [4, 0, 48, ...k2, 32, ...requestData];
  let c = 0xffffffff;
  for (const b of body) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  const crc = (c ^ 0xffffffff) >>> 0;
  return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^".split(''));
}

(async () => {
  console.log('=== POST v9（标准 plain24）===');
  const ctx = await nx.init({ log: () => {} });
  const url = '/px-gateway/GatewayConfig/getGatewayConfig';
  const path2 = TARGET + url.replace(/^\//, '');
  let ok = 0;
  for (let i = 0; i < 8; i++) {
    const q = genQueryStd(url, ctx.keys2, ctx.keys17);
    const r = await httpPost(path2, '{}', { userAgent: nx.UA, timeout: 12000, headers: { Cookie: ctx.cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
    if (r.status === 200) ok++;
    process.stdout.write(r.status + ' ');
  }
  console.log(`\nPOST v9 成功率: ${ok}/8`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
