const logger = require('@utils/logger');
const Coder = require('./handler/Coder');
const Cookie = require('./handler/Cookie');
const unescape = require('@utils/unescape');
const paths = require('@utils/paths');
const fs = require('fs');
const gv = require('@src/handler/globalVarible');

function writefile(ts, immucfg, outputResolve) {
  // 如果是url形式的则保存ts和immucfg
  const now = new Date().getTime();
  const files = [
    {
      name: `makecookie_url_ts_${now}`,
      desc: 'url方式提取的ts：',
      text: JSON.stringify(ts),
    },
    {
      name: `makecookie_url_immutext_${now}`,
      desc: 'url方式提取的静态文本：',
      text: JSON.stringify(immucfg),
    },
  ].map(it => ({ ...it, filepath: outputResolve(it.name) + '.json' }))
  if (!fs.existsSync(paths.outputPath)) fs.mkdirSync(paths.outputPath);
  files.forEach(({ filepath, text }) => fs.writeFileSync(filepath, text))
  logger.info('url方式保存文件：\n\n  ' + files.reduce((ans, it, idx) => ([...ans, `${it.desc}${it.filepath}${idx === files.length - 1 ? '\n' : ''}`]), []).join('\n  '));
}

module.exports = function (ts, outputResolve) {
  gv._setAttr('_ts', ts);
  // if (immucfg) writefile(ts, immucfg, outputResolve);
  const startTime = new Date().getTime();
  const coder = new Coder({
    hasCodemap: true,
    hasDebug: !!gv.config.adapt?.hasDebug,
    ...ts,
  }, gv.config.immucfg);
  const { code, $_ts, codemap } = coder.run();
  // 支持从 ts JSON 中覆盖 cp[3]（浏览器真实值），确保 keys 一致；
  // 取值优先级：ts.cp3Override > ts.cp[3]（浏览器完整 $_ts）> 适配器站点常量
  // 部分站点服务端使用固定 cd 解密种子，标准流程无法反解，需浏览器真实 $_ts
  const cp3 = ts.cp3Override !== undefined ? ts.cp3Override
    : (ts.cp && ts.cp[3] !== undefined ? ts.cp[3]
    : gv.config.adapt?.cp3Override);
  if (cp3 !== undefined) {
    $_ts.cp[3] = cp3;
    logger.debug(`cp[3] 已被覆盖为: ${cp3}`);
  }
  gv.config.codemap = codemap;
  const cookie = new Cookie(coder).run();
  gv.metaContent?.forEach(({content, value}) => {
    console.log(`\n存在meta-content值：${content}\n解析结果：${value}`);
  });
  console.log(`\n成功生成cookie（长度：${cookie.length}），用时：${new Date().getTime() - startTime}ms`);
  const cookieStr = [
    gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T') + '=' + cookie,
    ...(gv.argv.url?.cookie ?? []),
  ].join(';')
  console.log(`cookie值: ${cookieStr}`)
  return cookie;
}

