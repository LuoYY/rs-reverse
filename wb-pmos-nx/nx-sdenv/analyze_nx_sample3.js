// 查看 numarrJoin 源码 + 分析 317B 样本
const fs = require('fs');
const path = require('path');
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const parser = require('@src/handler/parser/');
console.log('numarrJoin 源码:', parser.numarrJoin.toString().substring(0, 800));
process.exit(0);
