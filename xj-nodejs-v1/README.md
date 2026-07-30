# xj-nodejs-v1 — pmos.xj.sgcc.com.cn:20080 瑞数 VMP 纯协议客户端

独立可移植的 Node.js 包，无外部项目依赖，拷贝到任何有 Node.js 18+ 的机器即可运行。

## 快速开始

```bash
# 1. 安装依赖
cd xj-nodejs-v1
npm install

# 2. 运行
NODE_OPTIONS=--dns-result-order=ipv4first node pmos_xj_client.js
```

输出示例：
```
[PmosXj] 初始化，获取有效 cookie（最多重试 3 次）...
[PmosXj] ✓ 第 1 次尝试成功，cookie 有效（aoU85Lxl9xxNP, 428 chars）

[demo] 访问 / ...
  / → 200 len= 8994

[demo] 访问 API /px-gateway/GatewayConfig/getGatewayConfig ...
  API → 200 body 前 150: {"status":0,"message":"Success","data":{...}}
```

## 编程调用

```javascript
const { PmosXjClient } = require('./pmos_xj_client');

async function main() {
  const client = new PmosXjClient();

  // 自动获取有效 cookie（100% 成功，通常第 1 次即通过）
  await client.init();

  // GET 请求
  const page = await client.get('/');
  console.log(page.status, page.body.length);

  // API 请求
  const api = await client.get('/px-gateway/GatewayConfig/getGatewayConfig');
  console.log(api.status, JSON.parse(api.body));

  // POST 请求
  const result = await client.post('/px-gateway/someApi', { key: 'value' });
  console.log(result.status, result.body);
}

main();
```

## 构造函数选项

```javascript
const client = new PmosXjClient({
  baseUrl: 'https://pmos.xj.sgcc.com.cn:20080/',
  ua: 'Mozilla/5.0 ...',
  maxRetries: 3,
});
```

## 环境要求

- **Node.js** >= 18
- **网络**：`NODE_OPTIONS=--dns-result-order=ipv4first`（强制 IPv4）
- **TLS**：代码已内置 `rejectUnauthorized: false`（目标站点自签名证书）

## 目录结构

```
xj-nodejs-v1/
├── package.json              # 依赖 + module-alias 配置
├── pmos_xj_client.js         # 生产客户端（PmosXjClient 类）
├── extract_dyncode_20080.js  # 外层 VM 沙箱（提取 cp3）
├── example/                  # 外层 VM 源码（271KB）
│   └── pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js
├── utils/                    # 工具模块（15 个文件）
│   ├── index.js              #   getCode 等入口
│   ├── paths.js              #   路径解析
│   ├── logger.js             #   日志
│   ├── getCode.js            #   外层 JS 读取
│   ├── getImmucfg.js         #   immucfg 提取
│   ├── getCodemap.js         #   codemap 生成（AST 变换）
│   ├── simpleCrypt.js        #   简单加解密
│   └── ...
├── src/
│   ├── config/               # 站点配置（2 个文件）
│   │   ├── index.js          #   hostname → adapter 匹配
│   │   └── makecookieRuntimeConfig.js  # 浏览器环境配置
│   └── handler/              # 核心处理器
│       ├── globalVarible.js  #   全局变量缓存
│       ├── Coder.js          #   代码生成器
│       ├── Cookie.js         #   cookie 生成主逻辑
│       ├── basearr/          #   basearr 适配器（9 个站点）
│       │   ├── index.js      #     选择器
│       │   └── len243.js     #     pmos.xj 适配器
│       └── parser/           #   cd 解密 + 加密
│           ├── tscd.js       #     cd → keys
│           ├── constData.js  #     AES S-box + bignum
│           ├── r2mka.js      #     任务树解析
│           └── common/       #     加密原语（28 个文件）
│               ├── modeEncrypt.js    # AES-CBC
│               ├── numarrEncrypt.js  # Huffman
│               ├── numarr2string.js  # Base64-like 编码
│               ├── uuid.js           # CRC32
│               └── ...
```

## 注意事项

1. **O + P cookie 必须配对**：重放时必须同时携带 O 和 P cookie
2. **cookie 有效期**：非一次性，可多次重放，建议定期刷新
3. **脚本须从项目根目录运行**：外层 JS 使用相对路径
