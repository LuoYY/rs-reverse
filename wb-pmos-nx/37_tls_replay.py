#!/usr/bin/env python3
"""
37_tls_replay.py

用 tls_client（模拟 Chrome JA3 指纹）重放浏览器原始 cookie
验证：cookie 是否绑定 TLS 指纹（JA3）
"""
import json
import os
import ssl
import sys

import tls_client

OUT = os.path.join(os.path.dirname(__file__), 'captures')
TARGET = 'https://pmos.nx.sgcc.com.cn:10443/'
PROXY = 'http://74940609:aFmWc5Fs@140.249.234.175:2022'

# 读取最新 multi 捕获的 cookie
files = [f for f in os.listdir(OUT) if f.startswith('multi_')]
if not files:
    print('无 multi 捕获'); sys.exit(1)
f = sorted(files)[-1]
d = json.load(open(os.path.join(OUT, f)))
oc = next(c for c in d['cookies'] if c['name'].endswith('O'))
pc = next(c for c in d['cookies'] if c['name'].endswith('P'))
cookie_str = f"{oc['name']}={oc['value']}; {pc['name']}={pc['value']}"
print(f"cookie: O={len(oc['value'])} P={len(pc['value'])}")

# 测试各种指纹
fingerprints = ['chrome_131', 'chrome_120', 'chrome_110', 'safari_16_0', 'firefox_133', 'firefox_120']
for fp in fingerprints:
    try:
        session = tls_client.Session(
            client_identifier=fp,
            random_tls_extension_order=True,
        )
        session.proxies = {'http': PROXY, 'https': PROXY}
        r = session.get(TARGET, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'})
        print(f"[{fp}] 无 cookie → {r.status_code}")
    except Exception as e:
        print(f"[{fp}] 无 cookie ERR: {str(e)[:80]}")

print()
# 带 cookie 重放
for fp in ['chrome_131', 'chrome_120']:
    try:
        session = tls_client.Session(
            client_identifier=fp,
            random_tls_extension_order=True,
        )
        session.proxies = {'http': PROXY, 'https': PROXY}
        r = session.get(TARGET, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Cookie': cookie_str,
        })
        print(f"[{fp}] O+P 重放 → {r.status_code}")
    except Exception as e:
        print(f"[{fp}] O+P ERR: {str(e)[:80]}")
