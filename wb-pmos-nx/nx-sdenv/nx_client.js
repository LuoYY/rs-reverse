/**
 * nx_client.js — nx 站点纯算法客户端（无浏览器）
 *
 * ★★★★★ 完整链路：sdenv 生成 cookie（纯 Node）+ 纯算法 query ★★★★★
 *
 * 核心思路：
 * 1. sdenv（JSVMP 补环境框架：sdenv-jsdom + browser(chrome) 补丁 + 固定随机数）
 *    在纯 Node 中执行瑞数外层 JS，生成与浏览器等价的合法 O+P cookie（已证 200）
 * 2. jsdom_keys_child 提取 keys（f(nsd,cd) 纯计算）
 * 3. 纯算法生成 MurR7rxG query（100% 已攻克）
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
const { fork } = require('child_process');
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
const SDENV_PROXY = process.env.NX_SDENV_PROXY || 'http://ericshi:583315@120.220.64.185:2018';

let _gv = null;
function initModules() {
  if (_gv) return;
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  _gv = require('@src/handler/globalVarible');
  _gv._setAttr('basestr', BASESTR_QUERY);
  require('@src/handler/parser/constData').init();
}

function crc32b(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; }

function forkKeys(nsd, cd) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'jsdom_keys_child.js'), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 20000);
    child.on('message', (msg) => { clearTimeout(timer); resolve(msg); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.send({ nsd, cd, outerJsPath: OUTER_JS });
  });
}

/** keys 提取（20s 超时 + 最多 3 次重试） */
async function forkKeysWithRetry(nsd, cd) {
  for (let i = 0; i < 3; i++) {
    const m = await forkKeys(nsd, cd);
    if (m && m.keys17 && m.keys2) return m;
  }
  return null;
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
 * 一次性初始化：sdenv 生成 O+P cookie + 提取 keys
 * @returns {Promise<{cookie: string, cookieO: string, cookieP: string, keys2: number[], keys17: number[], nsd: number}>}
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
  if (window.$_ts) {
    nsd = window.$_ts.nsd;
    cd = typeof window.$_ts.cd === 'string' ? window.$_ts.cd : String(window.$_ts.cd || '');
  } else {
    throw new Error('$_ts 不可用（sdenv 未正确加载挑战页）');
  }
  log(`[nx.init] nsd=${nsd} cd_len=${cd.length}`);
  const cookies = await new Promise((resolve) => {
    const timer = setTimeout(() => { resolve(cookieJar.getCookieStringSync(TARGET)); }, timeoutMs);
    window.addEventListener('sdenv:exit', () => { clearTimeout(timer); resolve(cookieJar.getCookieStringSync(TARGET)); });
  });
  const parts = cookies.split(';').map(s => s.trim());
  const oC = parts.find(p => /O=/.test(p));
  const pC = parts.find(p => /P=/.test(p));
  if (!oC || !pC) throw new Error('无 O/P cookie: ' + cookies.substring(0, 100));
  const m = await forkKeysWithRetry(nsd, cd);
  if (!m || !m.keys17 || !m.keys2) throw new Error('keys 提取失败');
  return {
    cookie: oC + '; ' + pC,
    cookieO: oC, cookieP: pC,
    keys2: m.keys2, keys17: m.keys17, nsd,
  };
}

/**
 * GET 请求（复用 init 的 cookie，生成新 query）
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
    const q = genQuery(urlPath, ctx.keys2, ctx.keys17);
    const r = await httpGet(TARGET + urlPath.replace(/^\//, ''), {
      userAgent: UA,
      timeout,
      headers: { Cookie: ctx.cookie, Accept: '*/*', [QUERY_PARAM]: q, ...opts.headers },
    });
    if (r.status === 200 || (r.status !== 412 && r.status !== 'ERR')) return r;
    last = r;
    log(`[nx.get] 第${i + 1}次 status=${r.status} error=${r.error || ''} → 重试`);
  }
  return last;
}

/**
 * POST 请求（复用 init 的 cookie，生成新 query）
 *
 * ⚠️ 已知限制（重要）：POST 成功率约 10%（200 偶发），
 * 这是 WAF 对 POST 的 TLS 指纹检测（GET 校验宽松、POST 校验严格），
 * 与 query 生成无关（已排除 plain24 结构/前缀/counter 因素）。
 * 建议：业务写操作优先走 GET 或降低 POST 频次；后续可尝试 TLS 指纹优化。
 *
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
    const q = genQuery(urlPath, ctx.keys2, ctx.keys17);
    const r = await httpPost(TARGET + urlPath.replace(/^\//, ''), payload, {
      userAgent: UA,
      timeout,
      headers: { Cookie: ctx.cookie, Accept: '*/*', [QUERY_PARAM]: q, ...opts.headers },
    });
    if (r.status === 200 || (r.status !== 412 && r.status !== 'ERR')) return r;
    last = r;
    log(`[nx.post] 第${i + 1}次 status=${r.status} error=${r.error || ''} → 重试`);
  }
  return last;
}

module.exports = { init, get, post, genQuery, UA, TARGET, QUERY_PARAM };
