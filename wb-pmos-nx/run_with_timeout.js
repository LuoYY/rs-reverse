#!/usr/bin/env node
/**
 * run_with_timeout.js - 通用超时 wrapper
 * 用法: node run_with_timeout.js <script.js> [timeout_sec]
 * 默认超时 120s，超时后 SIGKILL 强杀子进程并退出 124。
 * 防止 jsdom/VM 死循环（同步 while(1) 或 setInterval 循环）卡死主机。
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const script = process.argv[2];
const timeoutSec = parseInt(process.argv[3] || '120', 10);
const cwd = process.argv[4] || '/Users/luoyy/work/github/GitHub/rs-reverse_glm';

if (!script) {
  console.error('用法: node run_with_timeout.js <script.js> [timeout_sec] [cwd]');
  process.exit(2);
}

// 优先使用 nvm v22（jsdom/ESM 场景需要 --experimental-require-module，Node 18 不支持）
const NVM_NODE = `${process.env.HOME}/.nvm/versions/node/v22.22.0/bin/node`;
let nodeBin = process.execPath;
if (fs.existsSync(NVM_NODE)) nodeBin = NVM_NODE;

const args = [];
const major = parseInt(process.version.replace('v', '').split('.')[0], 10);
if (major >= 22 && !process.env.NO_REQUIRE_MODULE) args.push('--experimental-require-module');
args.push(path.resolve(script));

const child = spawn(nodeBin, args, { stdio: 'inherit', cwd });

const timer = setTimeout(() => {
  console.error(`\n[超时] 运行超过 ${timeoutSec}s (pid=${child.pid})，SIGKILL 强杀`);
  try { child.kill('SIGKILL'); } catch (e) {}
  process.exit(124);
}, timeoutSec * 1000);

child.on('error', (err) => {
  console.error('[spawn 错误]', err.message);
  clearTimeout(timer);
  process.exit(2);
});

child.on('exit', (code, sig) => {
  clearTimeout(timer);
  if (sig) {
    console.error(`[退出] 信号 ${sig}`);
    process.exit(124);
  }
  process.exit(code == null ? 1 : code);
});
