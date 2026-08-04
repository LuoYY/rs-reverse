/**
 * 836_fix_mD.js
 * 精确构建 _$mD 全局表（每个函数用真实实现）
 * 关键：VM 通过 _\$mD[xx] 环境判断，函数必须真实行为
 * 从签名提取函数名，映射到 Node 原生
 */
const fs = require('fs');

const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const mD_val = tables['_$mD'].val;

// 函数名 → Node 实现映射
const FN_MAP = {
  floor: Math.floor, substring: String.prototype.substring, join: Array.prototype.join,
  split: String.prototype.split, indexOf: String.prototype.indexOf, round: Math.round,
  ceil: Math.ceil, toLowerCase: String.prototype.toLowerCase, abs: Math.abs,
  concat: Array.prototype.concat, min: Math.min, parse: JSON.parse, toString: String.prototype.toString,
  toUpperCase: String.prototype.toUpperCase, slice: Array.prototype.slice,
  clearInterval: clearInterval, setIdleTimeout: setTimeout, match: String.prototype.match,
  lastIndexOf: String.prototype.lastIndexOf, pow: Math.pow, charAt: String.prototype.charAt,
  replace: String.prototype.replace, log: Math.log, max: Math.max,
  appendChild: () => ({}), removeChild: () => ({}), createElement: () => ({}),
  createElementNS: () => ({}), getElementById: () => null,
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
  setAttribute: () => {}, getAttribute: () => null, querySelector: () => null,
  open: () => {}, send: () => {}, setRequestHeader: () => {},
  getComputedStyle: () => ({}), getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
  setTimeout: setTimeout, setInterval: setInterval, clearTimeout: clearTimeout,
  push: Array.prototype.push, splice: Array.prototype.splice, pop: Array.prototype.pop,
  shift: Array.prototype.shift, unshift: Array.prototype.unshift,
  reverse: Array.prototype.reverse, sort: Array.prototype.sort,
  forEach: Array.prototype.forEach, map: Array.prototype.map, filter: Array.prototype.filter,
  reduce: Array.prototype.reduce, some: Array.prototype.some, every: Array.prototype.every,
  find: Array.prototype.find, includes: Array.prototype.includes,
  charCodeAt: String.prototype.charCodeAt, fromCharCode: String.fromCharCode,
  trim: String.prototype.trim, startsWith: String.prototype.startsWith, endsWith: String.prototype.endsWith,
  test: null, exec: null, compile: null, getPrototypeOf: Object.getPrototypeOf,
  defineProperty: Object.defineProperty, getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
  keys: Object.keys, values: Object.values, entries: Object.entries,
  stringify: JSON.stringify, parse2: JSON.parse,
  decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
  parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN, isFinite: isFinite,
  now: Date.now, getTime: Date.prototype.getTime, getFullYear: Date.prototype.getFullYear,
  getMonth: Date.prototype.getMonth, getDate: Date.prototype.getDate,
  getDay: Date.prototype.getDay, getHours: Date.prototype.getHours,
  getMinutes: Date.prototype.getMinutes, getSeconds: Date.prototype.getSeconds,
  getMilliseconds: Date.prototype.getMilliseconds,
  getTimezoneOffset: Date.prototype.getTimezoneOffset,
  toISOString: Date.prototype.toISOString, toJSON: Date.prototype.toJSON,
  random: Math.random, sqrt: Math.sqrt, pow2: Math.pow,
  createElementObject: () => ({}),
};

// 解析 _$mD
const mD = new Array(626).fill(null);
mD_val.forEach((v, i) => {
  if (typeof v === 'string') {
    if (v === 'undefined' || v === 'null') return;
    if (v.startsWith('fn:')) {
      const name = v.substring(3);
      const impl = FN_MAP[name];
      if (impl) mD[i] = impl;
      else mD[i] = function () { return undefined; };
    } else if (v.startsWith('obj:')) {
      mD[i] = {};
    } else if (v.startsWith('n:')) mD[i] = +v.substring(2);
    else if (v.startsWith('s:')) mD[i] = v.substring(2);
    else if (v.startsWith('b:')) mD[i] = v.substring(2) === 'true';
    else {
      const n = parseFloat(v);
      mD[i] = isNaN(n) ? v : n;
    }
  } else {
    mD[i] = v;
  }
});

// 特殊：_$mD[12] = Array（用 [] 或 Array 构造函数）
// _$mD[18] = $_ts
// 这些在运行前设置

// 输出 mD 到文件供执行器使用
fs.writeFileSync('/tmp/nx_mD_exact.json', JSON.stringify(mD));
console.log('已生成精确 _$mD:', mD.length, '项');
// 统计非 null
console.log('非 null:', mD.filter(x => x !== null).length);

// 列出所有 fn 映射
mD.forEach((v, i) => {
  if (typeof v === 'function') {
    console.log('[' + i + '] fn ' + (v.name || 'anon') + ' (mapped from ' + (mD_val[i] || '').substring(0, 30) + ')');
  }
});