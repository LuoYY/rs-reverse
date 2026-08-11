/**
 * nx_client.js — nx 站点纯算法客户端（无浏览器）
 *
 * ★★★★★ 完整链路：sdenv 生成 cookie（纯 Node）+ deriveKeys 纯计算 + 纯算法 query ★★★★★
 *
 * 核心思路：
 * 1. sdenv（JSVMP 补环境框架：sdenv-jsdom + browser(chrome) 补丁）在纯 Node 中
 *    执行瑞数外层 JS，生成与浏览器等价的合法 O+P cookie（已证 200）
 * 2. cd 纯计算派生 keys（deriveKeys：K16 锚扫描 offset → XOR → genKeysSim）——不依赖浏览器
 * 3. 纯算法生成 query（100% 已攻克）
 *
 * 用法：
 *   const nx = require('./nx_client');
 *   const ctx = await nx.init();                             // 一次性初始化（cookie + keys）
 *   const res = await nx.get('/px-gateway/...', ctx);        // 后续请求复用 cookie
 *   const res = await nx.post('/px-gateway/...', body, ctx); // POST
 *
 * 依赖：Node 22（v22.22.0）+ sdenv（本工作区 node_modules 已装）+ 代理
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const { httpGet, httpPost } = require('./proxy_http');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const QUERY_PARAM = 'MurR7rxG';
const PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
const BASESTR_QUERY = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

// 主工作区根目录（wb-pmos-nx/nx-sdenv → 上两级）
const ROOT = path.join(__dirname, '..', '..');
// 站点外层 JS（挑战 js，含 VM 逻辑）
const OUTER_JS = process.env.NX_OUTER_JS || path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
// sdenv 加载页面时的代理（https-proxy-agent 支持 user:pass@host 格式）
const SDENV_PROXY = process.env.NX_SDENV_PROXY || 'http://ericshi:583315@120.221.249.98:2018';

let _gv = null;
function initModules() {
  if (_gv) return;
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  _gv = require('@src/handler/globalVarible');
  _gv._setAttr('basestr', BASESTR_QUERY);
  require('@src/handler/parser/constData').init();
}

function crc32b(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; }

// ---- deriveKeys 纯计算（cd → keys，K16 锚扫描，移植自 collect_final_working）----
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
function decryptCd(str) {
  const idxmap = {};
  NX_BS.split('').forEach((k, i) => { idxmap[k] = i; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3];
    if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4));
    if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
    if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]);
  }
  return ans;
}
function getLensGo(numarr, idx) {
  const item = numarr[idx]; idx++;
  let lens;
  if ((item & 128) === 0) lens = item;
  else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
  else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
  else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
  else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
  else lens = item;
  return [lens, idx];
}
function genKeysSim(ans) {
  const keys = [];
  let op = 1, gap;
  try {
    for (let i = 0; i < ans[0]; i++) {
      [gap, op] = getLensGo(ans, op);
      if (gap < 0 || op + gap > ans.length) return null;
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
  } catch (e) { return null; }
  return keys;
}
function deriveOffsetNx(tail) {
  if (tail.length < 40) return null;
  const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
  for (let k0 = 0; k0 <= 127; k0++) {
    const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
    for (let k1 = 0; k1 <= 127; k1++) {
      const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
      const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
      const ans = tail.map((b, i) => b ^ offset[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      const keys = genKeysSim(ans);
      if (keys && keys[2] && keys[2].length === 48 && keys.length > 32 &&
        keys[29] && keys[29].length === 4 && keys[30] && keys[30].length === 4 &&
        keys[31] && keys[31].length === 4 && keys[32] && keys[32].length === 4) return offset;
    }
  }
  return null;
}
function deriveKeys(cd) {
  const cdArr = decryptCd(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  const offset = deriveOffsetNx(tail);
  if (!offset) return null;
  const ans = tail.map((b, i) => b ^ offset[i % 8]);
  return genKeysSim(ans);
}

function genQuery(urlPath, k2, k17) {
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  const [queryKey] = numarrAddTime([...k17], Math.floor(Date.now() / 1000), Math.random());
  const randByte = () => Math.floor(Math.random() * 256);
  const crcUrl = crc32b(Buffer.from(urlPath.toUpperCase()));
  const plain24 = [
    k2[0] ^ PREFIX_MASK[0], k2[1] ^ PREFIX_MASK[1], k2[2] ^ PREFIX_MASK[2], k2[3] ^ PREFIX_MASK[3],
    k2[4] ^ PREFIX_MASK[4], k2[5] ^ PREFIX_MASK[5], k2[6] ^ PREFIX_MASK[6], k2[7] ^ PREFIX_MASK[7],
    randByte(), randByte(), randByte(), randByte(), randByte(),
    randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
    (crcUrl >>> 24) & 255, (crcUrl >>> 16) & 255, (crcUrl >>> 8) & 255, crcUrl & 255,
  ];
  const requestData = encryptMode1(plain24, queryKey, 0);
  const body = [4, 0, 48, ...k2, 32, ...requestData];
  const crc = crc32b(Buffer.from(body));
  return 'a' + numarr2string(
    [(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body],
    BASESTR_QUERY.split('')
  );
}

/**
 * 一次性初始化：sdenv 生成 O+P cookie + cd 纯计算派生 keys
 * @returns {Promise<{cookie: string, cookieO: string, cookieP: string, keys2: number[], keys17: number[], nsd: number, cd: string}>}
 */
async function init(opts = {}) {
  initModules();
  const timeoutMs = opts.timeout || 45000;
  const log = opts.log || (() => {});
  let nsd = null, cd = null;
  const dom = await jsdomFromUrl(TARGET, {
    userAgent: UA,
    proxy: SDENV_PROXY,
    consoleConfig: { error: new Function() },
  });
  const { window, cookieJar } = dom;
  // 轮询捕获 $_ts（cookie 生成完成后可能被清空）
  let capTs = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try {
      if (!capTs && window.$_ts && window.$_ts.cd) {
        capTs = { nsd: window.$_ts.nsd, cd: typeof window.$_ts.cd === 'string' ? window.$_ts.cd : String(window.$_ts.cd || '') };
      }
      const c = cookieJar.getCookieStringSync(TARGET);
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (capTs && pLen > 300) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  if (!capTs) throw new Error('$_ts 不可用（sdenv 未正确加载挑战页）');
  nsd = capTs.nsd; cd = capTs.cd;
  log(`[nx.init] nsd=${nsd} cd_len=${cd.length}`);
  const cookies = cookieJar.getCookieStringSync(TARGET);
  const parts = cookies.split(';').map(s => s.trim());
  const oC = parts.find(p => /O=/.test(p));
  const pC = parts.find(p => /P=/.test(p));
  if (!oC || !pC) throw new Error('无 O/P cookie: ' + cookies.substring(0, 100));
  const keys = deriveKeys(cd);
  if (!keys || !keys[17] || !keys[2]) throw new Error('deriveKeys 失败');
  return {
    cookie: oC + '; ' + pC,
    cookieO: oC, cookieP: pC,
    keys2: keys[2], keys17: keys[17], nsd, cd,
  };
}

// 完整业务 headers（nx 前端实际发送，缺一不可）
function bizHeaders() {
  return {
    'Accept': 'application/json, text/plain, */*',
    'ClientTag': 'OUTNET_BROWSE',
    'CurrentRoute': '/outNet',
    'Origin': 'https://pmos.nx.sgcc.com.cn:10443',
    'Referer': 'https://pmos.nx.sgcc.com.cn:10443/',
    'X-Ticket': 'undefined',
    'X-Token': 'null',
  };
}

/**
 * GET 请求（复用 init 的 cookie，生成双 query：URL query + MurR7rxG header）
 * @param {string} urlPath 如 /px-gateway/GatewayConfig/getGatewayConfig
 * @param {object} ctx init() 返回的上下文
 * @param {object} opts { retries=3, timeout=20000, log, headers }
 */
async function get(urlPath, ctx, opts = {}) {
  initModules();
  const retries = opts.retries !== undefined ? opts.retries : 3;
  const timeout = opts.timeout || 20000;
  const log = opts.log || (() => {});
  let last;
  for (let i = 0; i <= retries; i++) {
    const urlQ = genQuery(urlPath, ctx.keys2, ctx.keys17);
    const hdrQ = genQuery(urlPath, ctx.keys2, ctx.keys17);
    const full = TARGET + urlPath.replace(/^\//, '') + '?' + urlQ;
    const r = await httpGet(full, {
      userAgent: UA,
      timeout,
      headers: { Cookie: ctx.cookie, [QUERY_PARAM]: hdrQ, ...bizHeaders(), ...opts.headers },
    });
    if (r.status === 200 || (r.status !== 412 && r.status !== 'ERR')) return r;
    last = r;
    log(`[nx.get] 第${i + 1}次 status=${r.status} error=${r.error || ''} → 重试`);
  }
  return last;
}

/**
 * POST 请求（复用 init 的 cookie，生成双 query）
 * @param {string} urlPath 如 /px-gateway/GatewayConfig/getGatewayConfig
 * @param {string|object} body 请求体（对象自动 JSON 化）
 * @param {object} ctx init() 返回的上下文
 * @param {object} opts { retries=3, timeout=20000, log, headers }
 */
async function post(urlPath, body, ctx, opts = {}) {
  initModules();
  const retries = opts.retries !== undefined ? opts.retries : 3;
  const timeout = opts.timeout || 20000;
  const log = opts.log || (() => {});
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  let last;
  for (let i = 0; i <= retries; i++) {
    const urlQ = genQuery(urlPath, ctx.keys2, ctx.keys17);
    const hdrQ = genQuery(urlPath, ctx.keys2, ctx.keys17);
    const full = TARGET + urlPath.replace(/^\//, '') + '?' + urlQ;
    const r = await httpPost(full, payload, {
      userAgent: UA,
      timeout,
      headers: { Cookie: ctx.cookie, 'Content-Type': 'application/json;charset=UTF-8', [QUERY_PARAM]: hdrQ, ...bizHeaders(), ...opts.headers },
    });
    if (r.status === 200 || (r.status !== 412 && r.status !== 'ERR')) return r;
    last = r;
    log(`[nx.post] 第${i + 1}次 status=${r.status} error=${r.error || ''} → 重试`);
  }
  return last;
}

module.exports = { init, get, post, genQuery, deriveKeys, UA, TARGET, QUERY_PARAM, BASESTR_QUERY, NX_BS, K16 };
