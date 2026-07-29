const fs = require('fs');
const logger = require('@utils/logger');
const paths = require('@utils/paths');
const isValidUrl = require('@utils/isValidUrl');
const getImmucfg = require('@utils/getImmucfg');
const { simpleEncrypt } = require('@utils/simpleCrypt');

module.exports = (gv) => {
  const adapts = require('@src/handler/basearr/index').adapts;
  const config = {offsetConst: {}};
  const code = gv.argv.mate.jscode?.code || fs.readFileSync(paths.exampleResolve('codes', `main.js`), 'utf8');
  const val = code.match(/_\$[\$_A-Za-z0-9]{2}=_\$[\$_A-Za-z0-9]{2}\(0,([0-9]+),_\$[\$_A-Za-z0-9]{2}\(/);
  if (val && val.length === 2) {
    config.keynameNum = parseInt(val[1]);
  } else {
    // 尝试从 -f 指定的 ts JSON 文件中读取 keynameNum
    const JSON5 = require('json5');
    const ts = gv.argv.file ? JSON5.parse(fs.readFileSync(gv.argv.file, 'utf8')) : null;
    if (ts && ts.keynameNum) {
      config.keynameNum = parseInt(ts.keynameNum);
    } else {
      throw new Error('keyname长度未匹配到! 可尝试在 ts JSON 中添加 "keynameNum" 字段');
    }
  }
  // 检查 ts JSON 中是否有 from 字段用于 hostname 识别
  if (!isValidUrl(gv.argv.mate.url)) {
    try {
      const JSON5 = require('json5');
      const ts = gv.argv.file ? JSON5.parse(fs.readFileSync(gv.argv.file, 'utf8')) : null;
      if (ts && ts.from && isValidUrl(ts.from)) {
        const fromUrl = new URL(ts.from);
        config.url = fromUrl;
        config.hostname = simpleEncrypt(fromUrl.hostname.replace(/^www\./, ''));
        if (adapts[config.hostname]) {
          config.adapt = adapts[config.hostname];
        }
        logger.debug(`hostname 从 ts.from 获取: ${fromUrl.hostname} → ${config.hostname}`);
      }
    } catch(e) { /* ignore */ }
  }
  if (isValidUrl(gv.argv.mate.url)) {
    config.url = new URL(gv.argv.mate.url);
    config.hostname = simpleEncrypt(config.url.hostname.replace(/^www\./, ''));
    if (adapts[config.hostname]) {
      config.adapt = adapts[config.hostname];
    }
  }
  Object.assign(config, {
    hostname: config.hostname || (isValidUrl(gv.argv.mate.url)
      ? simpleEncrypt((new URL(gv.argv.mate.url)).hostname.replace(/^www\./, ''))
      : undefined),
    immucfg: getImmucfg(code),
  });
  gv._setAttr('config', config);
}
