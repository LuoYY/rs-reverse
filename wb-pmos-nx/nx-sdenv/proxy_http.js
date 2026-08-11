/**
 * proxy_http.js — 通过 HTTP 代理的 HTTPS 请求 helper（带超时保护）
 *
 * 代理配置可用环境变量覆盖：
 *   NX_PROXY_HOST / NX_PROXY_PORT / NX_PROXY_USER / NX_PROXY_PASS
 *
 * 用法：
 *   const { httpGet, httpPost } = require('./proxy_http');
 *   const res = await httpGet('https://pmos.nx.sgcc.com.cn:10443/', { userAgent, headers });
 */
const http = require('http');
const https = require('https');

const PROXY_HOST = process.env.NX_PROXY_HOST || '120.221.249.98';
const PROXY_PORT = parseInt(process.env.NX_PROXY_PORT || '2018', 10);
const PROXY_AUTH = 'Basic ' + Buffer.from(
  (process.env.NX_PROXY_USER || 'ericshi') + ':' + (process.env.NX_PROXY_PASS || '583315')
).toString('base64');

const DEFAULT_TIMEOUT = 20000; // 20s 超时，长时间请求不了说明有问题

function createTunnel(targetHost, targetPort, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const proxyReq = http.request({
      host: PROXY_HOST,
      port: PROXY_PORT,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH },
    });
    const timer = setTimeout(() => {
      proxyReq.destroy();
      reject(new Error(`Proxy CONNECT timeout after ${timeout}ms`));
    }, timeout);
    proxyReq.on('connect', (res, socket) => {
      clearTimeout(timer);
      if (res.statusCode !== 200) { reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`)); return; }
      resolve(socket);
    });
    proxyReq.on('error', (e) => { clearTimeout(timer); reject(e); });
    proxyReq.end();
  });
}

async function httpGet(url, options = {}) {
  const u = new URL(url);
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const socket = await createTunnel(u.hostname, u.port || 443, timeout);
  return new Promise((resolve) => {
    const headers = { 'User-Agent': options.userAgent || 'Mozilla/5.0', ...options.headers };
    const req = https.request({
      socket: socket,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      rejectUnauthorized: false,
      headers,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    const timer = setTimeout(() => {
      req.destroy();
      socket.destroy();
      resolve({ status: 'ERR', error: `Request timeout after ${timeout}ms`, body: '', headers: {} });
    }, timeout);
    req.on('error', e => { clearTimeout(timer); resolve({ status: 'ERR', error: e.message, body: '', headers: {} }); });
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
}

async function httpPost(url, body, options = {}) {
  const u = new URL(url);
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const socket = await createTunnel(u.hostname, u.port || 443, timeout);
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': options.userAgent || 'Mozilla/5.0',
      'Content-Type': options.contentType || 'application/json;charset=UTF-8',
      'Content-Length': Buffer.byteLength(body),
      ...options.headers,
    };
    const req = https.request({
      socket: socket,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      rejectUnauthorized: false,
      headers,
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    const timer = setTimeout(() => {
      req.destroy();
      socket.destroy();
      resolve({ status: 'ERR', error: `Request timeout after ${timeout}ms`, body: '', headers: {} });
    }, timeout);
    req.on('error', e => { clearTimeout(timer); resolve({ status: 'ERR', error: e.message, body: '', headers: {} }); });
    req.on('close', () => clearTimeout(timer));
    req.write(body);
    req.end();
  });
}

module.exports = { httpGet, httpPost, createTunnel };
