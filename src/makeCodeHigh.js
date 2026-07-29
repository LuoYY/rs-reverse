const AppCode = require('./handler/AppCode');
const paths = require('@utils/paths');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const logger = require('@utils/logger');
const Coder = require('./handler/Coder');
const Cookie = require('./handler/Cookie');
const unescape = require('@utils/unescape');
const gv = require('@src/handler/globalVarible');
const getCode = require('@utils/getCode');
const { getLength } = require('@src/handler/parser/common');
const getImmucfg = require('@utils/getImmucfg');

function filenameAddDesc(name, desc) {
  const arr = name.split('.');
  if (arr.length < 2) arr.push('js');
  if (arr.length < 2) throw new Error(`文件名不正确: ${name}`);
  arr[arr.length - 2] += desc;
  return arr.join('.');
}

function writeFile(step, ts, immucfg, { jscode, html, appcode = [] }, $_ts, code, codePure, outputResolve) {
  const files = [
    {
      name: 'ts.json',
      desc: '原始$_ts：',
      text: JSON.stringify(ts),
    },
    {
      name: 'immucfg.json',
      desc: '静态文本：',
      text: JSON.stringify(immucfg),
    },
    {
      name: 'ts-full.json',
      desc: '外层虚拟机生成的$_ts：',
      text: JSON.stringify($_ts),
    },
    html && { ...html, desc: 'html代码：' },
    jscode && { ...jscode, desc: '外层虚拟机代码：' },
    {
      name: filenameAddDesc(jscode.name, '-dynamic'),
      desc: `内层虚拟机代码：`,
      text: '// 该行标记来源，非动态代码生成: ' + JSON.stringify(ts) + '\n\n' + code,
    },
    codePure && {
      name: jscode ? filenameAddDesc(jscode.name, '-dynamic-pure') : 'dynamic.js',
      desc: `内层虚拟机代码（纯净）：`,
      text: '// 该行标记来源，非动态代码生成: ' + JSON.stringify(ts) + '\n\n' + codePure,
    },
    ...appcode,
    ...appcode.filter(it => it.decryptCode).map(it => ({
      name: filenameAddDesc(it.name, '-decrypt'),
      desc: `${it.name}生成的解密代码：`,
      text: it.decryptCode,
    }))
  ].filter(Boolean).map(it => ({ ...it, filepath: outputResolve('makecode-high', step, it.name) }))
  if (!fs.existsSync(outputResolve('makecode-high', step))) fse.ensureDirSync(outputResolve('makecode-high', step));
  return files;
}

function firstStep(ts, immucfg, mate, outputResolve) {
  // parseTs 会用代码校验和覆盖 cp[3]，需先保留服务端真实值，运行后再还原，
  // 否则动态代码执行时无法正确构建 keylist（_$iI 等变量 undefined）。
  // 实时抓取（-u）的 ts 不含 cp 数组，这里回退到适配器声明的站点常量。
  if (ts.cp3Override === undefined) {
    // 取值优先级：ts.cp3Override > ts.cp[3]（浏览器完整 $_ts）> 适配器站点常量
    // -u 模式（mate.jscode 存在）使用标准代码校验和，不回退到适配器常量
    if (ts.cp && ts.cp[3] !== undefined) {
      ts.cp3Override = ts.cp[3];
    } else if (!mate.jscode) {
      ts.cp3Override = gv.config.adapt?.cp3Override;
    }
  }
  gv._setAttr('_ts', ts);
  const coder = new Coder({
    hasCodemap: true,
    hasDebug: !!gv.config.adapt?.hasDebug,
    ...ts
  }, immucfg);
  const { code, $_ts, codemap, codePure } = coder.run();
  if (ts.cp3Override !== undefined) {
    $_ts.cp[3] = ts.cp3Override;
  }
  gv.config.codemap = codemap;
  const files = writeFile('first', ts, immucfg, mate, $_ts, code, codePure, outputResolve);
  const cookieVal = new Cookie(coder).run();
  const cookieKey = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  return [files, `${cookieKey}=${cookieVal}`];
}

function secondStep(ts, immucfg, mate, outputResolve) {
  gv._setAttr('_ts', ts);
  const coder = new Coder(ts, immucfg);
  const { code, $_ts, codePure } = coder.run();
  mate.appcode.forEach((appcode, idx) => {
    appcode.decryptCode = new AppCode(AppCode.getParams(appcode.code), idx + 1).run();
  });
  return writeFile('second', ts, immucfg, mate, $_ts, code, codePure, outputResolve);
}

module.exports = async function (ts, outputResolve) {
  const mate = gv.argv.mate;
  if (fs.existsSync(outputResolve('makecode-high'))) {
    fse.moveSync(outputResolve('makecode-high'), outputResolve('makecode-high-old'), { overwrite: true });
  }
  const startTime = new Date().getTime();
  // -u 模式优先使用从目标 URL 抓取的外层 VM js 生成 immucfg，
  // 否则回退到配置（-j 或默认 main.js）
  const immucfg = mate.jscode ? getImmucfg(mate.jscode.code) : gv.config.immucfg;
  const [files, cookieStr] = firstStep(ts, immucfg, mate, outputResolve);
  logger.debug(`生成cookie：${cookieStr}`);
  files.unshift('\n第1次请求保存文件：\n');
  const result = await getCode(mate.url, cookieStr);
  if (result.statusCode !== 200) throw new Error(`第二次请求返回状态码非200（${result.statusCode}）`);
  files.push('\n第2次请求保存文件：\n', ...secondStep(result.$_ts, getImmucfg(result.jscode.code), result, outputResolve));
  files.forEach(({ filepath, text, code }) => filepath && fs.writeFileSync(filepath, text || code));
  console.log([
    `\n代码还原成功！用时：${new Date().getTime() - startTime}ms\n`,
    ...files.reduce((ans, it, idx) => ([...ans, typeof it === 'string' ? it : `${it.desc}${paths.relative(it.filepath)}${idx === files.length - 1 || it.newLine ? '\n' : ''}`]), []),
  ].join('\n  '));
}

