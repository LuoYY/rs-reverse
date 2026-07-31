/**
 * proxy_http.js — 通过 HTTP 代理的 HTTPS 请求 helper
 * 
 * 用法：
 *   const { httpGet } = require('./proxy_http');
 *   const res = await httpGet('https://pmos.xj.sgcc.com.cn:20080/');
 */
const http = require('http');
const https = require('https');

const PROXY_HOST = '140.249.234.175';
const PROXY_PORT = 2022;
const PROXY_AUTH = 'Basic ' + Buffer.from('74940609:aFmWc5Fs').toString('base64');

function createTunnel(targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    const proxyReq = http.request({
      host: PROXY_HOST,
      port: PROXY_PORT,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH },
    });
    proxyReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`)); return; }
      resolve(socket);
    });
    proxyReq.on('error', reject);
    proxyReq.end();
  });
}

async function httpGet(url, options = {}) {
  const u = new URL(url);
  const socket = await createTunnel(u.hostname, u.port || 443);
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
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    req.end();
  });
}

async function httpPost(url, body, options = {}) {
  const u = new URL(url);
  const socket = await createTunnel(u.hostname, u.port || 443);
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
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    req.write(body);
    req.end();
  });
}

module.exports = { httpGet, httpPost, createTunnel };
