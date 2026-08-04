// POST 诊断 v7：不同 query 前缀（'a' vs '0'）
const nx = require('./nx_client');
const { httpPost } = require('./proxy_http');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';

function genQueryPrefix(urlPath, k2, k17, prefix) {
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  const [queryKey] = numarrAddTime([...k17], Math.floor(Date.now() / 1000), Math.random());
  const randByte = () => Math.floor(Math.random() * 256);
  const crcUrl = nx.crc32b ? nx.crc32b(Buffer.from(urlPath.toUpperCase())) : 0;
  const plain24 = [
    k2[0] ^ 0x0b, k2[1] ^ 0x16, k2[2] ^ 0x00, k2[3] ^ 0x10,
    k2[4] ^ 0x00, k2[5] ^ 0x31, k2[6] ^ 0x00, k2[7] ^ 0x01,
    randByte(), randByte(), randByte(), randByte(), randByte(),
    randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
    (crcUrl >>> 24) & 255, (crcUrl >>> 16) & 255, (crcUrl >>> 8) & 255, crcUrl & 255,
  ];
  const requestData = encryptMode1(plain24, queryKey, 0);
  const body = [4, 0, 48, ...k2, 32, ...requestData];
  let c = 0xffffffff;
  for (const b of body) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  const crc = (c ^ 0xffffffff) >>> 0;
  return prefix + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^".split(''));
}

(async () => {
  console.log('=== POST v7（前缀测试）===');
  const ctx = await nx.init({ log: () => {} });
  const url = '/px-gateway/GatewayConfig/getGatewayConfig';
  const path2 = TARGET + url.replace(/^\//, '');

  for (const prefix of ['a', '0']) {
    // 每个前缀用新 cookie
    const q = genQueryPrefix(url, ctx.keys2, ctx.keys17, prefix);
    const r = await httpPost(path2, '{}', { userAgent: nx.UA, timeout: 15000, headers: { Cookie: ctx.cookie, Accept: '*/*', [nx.QUERY_PARAM]: q } });
    console.log(`[前缀=${prefix}] ${r.status} ${r.body.substring(0, 40)}`);
    break; // 先测 'a'
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
