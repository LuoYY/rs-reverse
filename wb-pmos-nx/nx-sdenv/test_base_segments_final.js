// 最终段自由性测试：修改 base 各段，验证 200/412
// 用 sdenv 采集的 base + buildCookie 重构链路
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const http = require('http');
const tls = require('tls');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

// ...（工具函数同 collect_final_working）

function httpGetProxy(url, cookieH) {
  return new Promise((resolve) => {
    const p = new URL(SDENV_PROXY);
    const auth = 'Basic ' + Buffer.from(p.username + ':' + p.password).toString('base64');
    const u = new URL(url);
    const cr = http.request({ host: p.hostname, port: +p.port, method: 'CONNECT', path: `${u.hostname}:${u.port || 443}`, headers: { 'Proxy-Authorization': auth, Host: `${u.hostname}:${u.port || 443}` }, timeout: 25000 });
    cr.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const ts = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        ts.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\n${cookieH ? `Cookie: ${cookieH}\r\n` : ''}Connection: close\r\n\r\n`);
      });
      let body = '';
      ts.on('data', d => body += d);
      ts.on('end', () => {
        const st = parseInt((body.match(/HTTP\/1\.1 (\d+)/) || [])[1] || '0');
        resolve({ status: st, body: body.substring(0, 300) });
      });
      ts.on('error', () => resolve({ status: 'ERR' }));
    });
    cr.on('error', () => resolve({ status: 'ERR' }));
    cr.end();
  });
}

// 简化：直接用已采集样本测试。加载样本
(async () => {
  console.log('[TS] 段自由性测试（使用已采集样本）');
  // 从 /tmp/nx_k0_base.json 加载
  const samples = JSON.parse(fs.readFileSync('/tmp/nx_k0_base.json', 'utf8'));
  console.log('[TS] 样本数:', samples.length);
  // 验证样本是否含 base
  samples.forEach((s, i) => {
    console.log('[TS] #' + i + ' nsd=' + s.nsd + ' baseHead=' + (s.base ? s.base.slice(0, 8).join(',') : 'N/A'));
  });
  process.exit(0);
})().catch(e => { console.error('[TS] FATAL:', e.message); process.exit(1); });
