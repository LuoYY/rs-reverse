/**
 * nx_pure_client.js — pmos.nx.sgcc.com.cn:10443 纯算法客户端（可复用模块）
 *
 * 方案：patchright 采集 keys2（浏览器权威，环境相关）→ Node 纯算法生成 cookie + 双 query → curl 重放
 * 已 2026-08-02 验证：API 200 + 页面 200（Node 生成的 cookie + query 全链路）
 *
 * 用法：
 *   const { NxClient } = require('./nx_pure_client');
 *   const c = await NxClient.create({ proxy: 'http://user:pass@host:port' });
 *   console.log(await c.request('POST', '/px-common-authcenter/auth/v2/captcha/get', { captchaType: 'blockPuzzle' }));
 *   await c.close();
 *
 * 注意：
 *   - keys2 环境相关，需浏览器采集（约 60s）
 *   - 每次 request 自动生成新 query（反重放：相同 request_data 必 400）
 *   - **nx 反重放窗口 ~60-85s**：同一 URL 请求后窗口内重复请求 → 412；窗口过后恢复
 *   - 页面加载已自动调用一批 API（getGatewayConfig/security/captcha 等）→ 手动再调同 URL 需间隔或新会话
 *   - 返回 { status, body }
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
const PARAM = 'MurR7rxG';

// ---- 基础工具（不依赖管线，纯函数）----
function makeDecryptKeys(bs) {
  return bs.split('').reduce((ans, key, idx) => {
    const code = key.charCodeAt();
    ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
    ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
    ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
    return ans;
  }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
}
function decryptCd(cd) {
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;
  const arr = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr.push(d1[one] | d2[two]);
    three !== undefined && arr.push(d3[two] | d4[three]);
    four !== undefined && arr.push(d5[three] | d6[four]);
  }
  return arr;
}
function deriveKeys(cdArr) {
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
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
  for (let k0 = 0; k0 <= 127; k0++) {
    for (let k1 = 0; k1 <= 127; k1++) {
      const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      if (ans.some(v => v > 255)) continue;
      const keys = [];
      let op = 1, gap, ok = true;
      for (let i = 0; i < ans[0]; i++) {
        [gap, op] = getLensGo(ans, op);
        if (gap < 0 || op + gap > ans.length) { ok = false; break; }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if (!ok) continue;
      const k16 = keys[16];
      if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { off, keys };
    }
  }
  return null;
}
function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}
function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

class NxClient {
  constructor(cfg) {
    this.cfg = cfg;
    this.proxyStr = cfg.proxy;
    this.ua = cfg.ua || DEFAULT_UA;
    this.moduleReady = null;
  }

  static async create(cfg) {
    const c = new NxClient(cfg);
    await c._initPipeline();
    await c._collect();
    return c;
  }

  // 初始化管线（encryptMode1/2 + numarrAddTime + numarr2string + parser）
  async _initPipeline() {
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
    require('@src/handler/parser/constData').init();
    this.encryptMode1 = require('@src/handler/parser/common/modeEncrypt').encryptMode1;
    this.encryptMode2 = require('@src/handler/parser/common/modeEncrypt').encryptMode2;
    this.numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    this.numarr2string = require('@src/handler/parser/common/numarr2string');
    this.parser = require('@src/handler/parser');
  }

  // patchright 采集：O/P cookie + 最后 412 的 nsd/cd → keys2/keys17/nextarr
  async _collect() {
    const { chromium } = require('patchright');
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
    this.browser = browser;
    const challenges = [];
    let pCookie = '', pName = '', oCookie = null;
    try {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: this.ua, proxy: this.cfg.proxyObj });
      const page = await ctx.newPage();
      page.on('response', async (resp) => {
        if (resp.status() === 412) {
          try {
            const body = await resp.text();
            const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
            const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
            if (nsdM && cdM) challenges.push({ nsd: +nsdM[1], cd: cdM[1] });
          } catch (e) {}
        }
      });
      try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
      await page.waitForTimeout(8000);
      try { await page.reload({ timeout: 90000 }); } catch (e) {}
      await page.waitForTimeout(20000);
      const cks = await ctx.cookies();
      const pc = cks.find(c => c.name.endsWith('P'));
      if (pc) { pCookie = pc.value; pName = pc.name; }
      const oc = cks.find(c => c.name.endsWith('O'));
      if (oc) oCookie = oc;
      await ctx.close();
    } finally { await browser.close(); this.browser = null; }
    if (!pCookie || challenges.length === 0) throw new Error('采集失败');
    const ch = challenges[challenges.length - 1]; // 必须用最后 412（cd 与 cookie 会话匹配）

    // keys2/keys17
    const cdArr = decryptCd(ch.cd);
    const der = deriveKeys(cdArr);
    if (!der) throw new Error('keys 推导失败');
    this.keys17 = der.keys[17];
    const C = decodeB86(pCookie.slice(1));
    const arr = this.numarrAddTime([...K16], 0, 1 / 256)[0];
    const dec = this.encryptMode2([...C], arr, 1);
    const origNextarr = dec.slice(4);
    this.keys2 = origNextarr.slice(11, 59); // 48B
    this.u4 = this.parser.numToNumarr4(this.parser.uuid(origNextarr));
    this.nextarr = [...this.u4, ...origNextarr];
    this.oStr = oCookie.name + '=' + oCookie.value;
    this.pName = pName;
    // 预生成一个 cookie（随机 IV）
    this.genCookie();
    console.log('[NxClient] keys2:', this.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }

  // 生成新 cookie（Node 纯算法，随机 IV）
  genCookie() {
    const arr16 = this.numarrAddTime([...K16], 0, 1 / 256)[0];
    const encOut = this.encryptMode1([...this.nextarr], arr16, 1);
    this.cookie = 'a' + this.numarr2string([...encOut], B86_64.split(''));
    return this.cookie;
  }

  // 生成 query（每次独立，防反重放）
  genQuery(urlPath) {
    const randByte = () => Math.floor(Math.random() * 256);
    const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
    const k2 = this.keys2;
    const plain24 = [
      k2[0] ^ MASK[0], k2[1] ^ MASK[1], k2[2] ^ MASK[2], k2[3] ^ MASK[3],
      k2[4] ^ MASK[4], k2[5] ^ MASK[5], k2[6] ^ MASK[6], k2[7] ^ MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
    ];
    const [key21] = this.numarrAddTime([...this.keys17], Math.floor(Date.now() / 1000), Math.random());
    const requestData = this.encryptMode1(plain24, key21, 0);
    const body = [4, 0, 48, ...k2, 32, ...requestData];
    const crc = crc32b(Buffer.from(body));
    return 'a' + this.numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64.split(''));
  }

  // 发请求（curl + 代理 + 完整 header）
  request(method, urlPath, data, extraHeaders = {}) {
    const urlQ = this.genQuery(urlPath);
    const hdrQ = this.genQuery(urlPath);
    const url = 'https://pmos.nx.sgcc.com.cn:10443' + urlPath + '?' + urlQ;
    const cookieStr = this.oStr + '; ' + this.pName + '=' + this.cookie;
    const bodyStr = data !== undefined ? JSON.stringify(data) : '';
    const hdrs = {
      'Accept': 'application/json, text/plain, */*',
      'ClientTag': 'OUTNET_BROWSE',
      'Content-Type': 'application/json;charset=UTF-8',
      'CurrentRoute': '/outNet',
      'MurR7rxG': hdrQ,
      'Origin': 'https://pmos.nx.sgcc.com.cn:10443',
      'Referer': TARGET,
      'X-Ticket': 'undefined',
      'X-Token': 'null',
      ...extraHeaders,
    };
    let cmd = `curl -s -o /tmp/nx_client_resp.html -w "%{http_code}" -x "${this.proxyStr}" --max-time 20`;
    if (method === 'POST' || bodyStr) {
      cmd += ` -X POST -d '${bodyStr}'`;
    }
    cmd += ` '${url}'`;
    for (const [k, v] of Object.entries(hdrs)) cmd += ` -H '${k}: ${v}'`;
    cmd += ` -H 'User-Agent: ${this.ua}' -b '${cookieStr}'`;
    try {
      const status = execSync(cmd, { timeout: 30000 }).toString().trim();
      const body = require('fs').readFileSync('/tmp/nx_client_resp.html', 'utf8');
      return { status: parseInt(status), body };
    } catch (e) {
      return { status: e.stdout ? parseInt(e.stdout.toString().trim()) : 0, body: e.message.substring(0, 100) };
    }
  }

  async close() {
    if (this.browser) await this.browser.close().catch(() => {});
  }
}

// 便捷函数：解析代理字符串 → proxyObj
function parseProxy(proxyStr) {
  const m = proxyStr.match(/^https?:\/\/([^:]+):([^@]+)@([^/]+)$/);
  return m ? { server: 'http://' + m[3], username: m[1], password: m[2] } : null;
}

module.exports = { NxClient, parseProxy, crc32b, decodeB86, B86_64, NX_BS };
