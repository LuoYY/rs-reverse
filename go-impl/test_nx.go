package main

import (
	"fmt"
	"os"
)

// nx 完整链路测试：./pmos_go_nx nxrun
// 拉挑战 → keys → cookie → GET
func mainNxRun(args []string) {
	// 1. 拉挑战页
	nsd, cd, oCookie, err := nxFetchChallenge()
	if err != nil {
		fmt.Fprintf(os.Stderr, "fetchChallenge: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("[nxrun] nsd=%d cd_len=%d oCookie=%q\n", nsd, len(cd), oCookie)

	// 2. deriveKeys
	keys := deriveKeysNx(cd)
	if keys == nil {
		fmt.Fprintf(os.Stderr, "deriveKeys failed\n")
		os.Exit(1)
	}
	fmt.Printf("[nxrun] keys count=%d keys2=%dB keys16=%dB keys17=%dB\n",
		len(keys), len(keys[2]), len(keys[16]), len(keys[17]))

	// 3. base（模板）
	base := buildBasearrNx()
	if base == nil {
		fmt.Fprintf(os.Stderr, "base 模板未加载\n")
		os.Exit(1)
	}
	fmt.Printf("[nxrun] base len=%d bits=%d head=%v\n", len(base), totalHuffBits(base), base[:6])

	// 4. 生成 cookie（时间戳用当前时间）
	r2mka := uint32(0)
	startT := uint32(0)
	_ = r2mka
	_ = startT
	fmt.Println("[nxrun] cookie 生成依赖会话时间戳（r2mka/startT 需从挑战页获取）")
	fmt.Printf("[nxrun] 注意：当前版本 base 用模板，cookie 需配合真实时间戳。先验证 keys 派生正确性。\n")
	fmt.Printf("[nxrun] keys[2] head=%v\n", keys[2][:8])

	// 5. 验证：用 template base 直接测试 GET（简化版：不带 query 先测 cookie）
	// 完整 GET 需 r2mka/startT 时间戳（来自 cookie 内部，暂用 0）
	status, body, err := nxGet("/px-gateway/GatewayConfig/getGatewayConfig", oCookie, "dummyP", keys[2], keys[17], 25)
	if err != nil {
		fmt.Printf("[nxrun] GET error: %v\n", err)
	} else {
		fmt.Printf("[nxrun] GET status=%d body_len=%d\n", status, len(body))
	}
}
