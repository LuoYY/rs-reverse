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
  // 兼容格式化(带空格)的外层虚拟机代码：_$xx = _$xx(0, NUM, _$xx(
  const val = code.match(/_\$[\$_A-Za-z0-9]{2}\s*=\s*_\$[\$_A-Za-z0-9]{2}\(\s*0\s*,\s*([0-9]+)\s*,\s*_\$[\$_A-Za-z0-9]{2}\(/);
  if (val && val.length === 2) {
    config.keynameNum = parseInt(val[1]);
  } else {
    logger.warn('keyname长度未匹配到，尝试从$_ts.cp[1]长度推导，如失败请检查外层代码!');
    config.keynameNum = gv._ts?.cp?.[1]?.length || 909;
  }
  if (isValidUrl(gv.argv.mate.url)) {
    config.url = new URL(gv.argv.mate.url);
    config.hostname = simpleEncrypt(config.url.hostname.replace(/^www\./, ''));
    if (adapts[config.hostname]) {
      config.adapt = adapts[config.hostname];
    }
  }
  Object.assign(config, {
    hostname: isValidUrl(gv.argv.mate.url)
      ? simpleEncrypt((new URL(gv.argv.mate.url)).hostname.replace(/^www\./, ''))
      : undefined,
    immucfg: getImmucfg(code),
  });
  gv._setAttr('config', config);
}
