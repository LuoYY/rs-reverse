// 提取 nx 外层 JS 的 immucfg（globalText1/2, cp0, cp2）并保存 JSON
const fs = require('fs');
const path = require('path');
const getImmucfg = require('../../utils/getImmucfg');

const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const jscode = fs.readFileSync(OUTER_JS, 'utf8');
console.log('外层 JS 大小:', jscode.length);

const immucfg = getImmucfg(jscode);
console.log('globalText1 len:', immucfg.globalText1.length);
console.log('globalText2 len:', immucfg.globalText2.length);
console.log('cp0 len:', immucfg.cp0.length);
console.log('cp2 len:', immucfg.cp2.length, '类型:', Array.isArray(immucfg.cp2) ? 'array' : typeof immucfg.cp2);

// cp2 需要是数字数组
let cp2 = immucfg.cp2;
if (typeof cp2 === 'string') cp2 = [...cp2].map(c => c.charCodeAt(0));
console.log('cp2 前 20:', cp2.slice(0, 20));

// 保存（Go 用 loadImmucfgFromFiles 读取同名文件）
const outDir = path.join(__dirname, '../../go-impl');
fs.writeFileSync(path.join(outDir, 'nx_globaltext1.json'), JSON.stringify(immucfg.globalText1));
fs.writeFileSync(path.join(outDir, 'nx_globaltext2.json'), JSON.stringify(immucfg.globalText2));
fs.writeFileSync(path.join(outDir, 'nx_cp0.json'), JSON.stringify(immucfg.cp0));
fs.writeFileSync(path.join(outDir, 'nx_cp2.json'), JSON.stringify(cp2));
console.log('\n已保存 go-impl/nx_*.json');
