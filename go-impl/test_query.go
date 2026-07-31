package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"
)

// testGoQuery: 端到端测试 query 参数生成
// 用法: ./pmos_go query [url] [method]
func testGoQuery(args []string) {
	apiPath := "/px-gateway/GatewayConfig/getGatewayConfig"
	method := "POST"
	if len(args) > 2 {
		apiPath = args[2]
	}
	if len(args) > 3 {
		method = strings.ToUpper(args[3])
	}

	fmt.Println("=== Go 纯算法 query 生成测试 ===")
	fmt.Printf("URL: %s  Method: %s\n", apiPath, method)

	// 1. 拉挑战页
	nsd, cd, oCookie, err := fetchChallenge()
	if err != nil {
		fmt.Println("fetchChallenge error:", err)
		return
	}
	fmt.Printf("nsd=%d cd_len=%d\n", nsd, len(cd))

	// 2. 生成 keys + cookie
	rootDir, _ := getWd()
	outerJsPath := filepath.Join(rootDir, "example", "pmos.xj.sgcc.com.cn", "kmOJZ0KVxJ0R", "rGTR1U4jJCVr.303c6e9.js")
	outerJsBytes, err := readFile(outerJsPath)
	if err != nil {
		fmt.Println("read outer JS error:", err)
		return
	}

	data, err := RunCoderFull(nsd, cd, string(outerJsBytes), 0)
	if err != nil {
		fmt.Println("RunCoderFull error:", err)
		return
	}

	goCookie := generateCookie(data)
	cookieStr := fmt.Sprintf("%s; %s=%s", oCookie, data.CookieName, goCookie)
	fmt.Printf("Cookie ready, length=%d\n", len(goCookie))

	// 3. 生成 query
	query := GenQuery(data, apiPath)
	paramName := GenQueryParamName(data)
	fmt.Printf("Query param: %s\n", paramName)
	fmt.Printf("Query value (%d chars): %s...\n", len(query), query[:min(60, len(query))])

	// 4. 验证 cookie（GET /）
	tr := &http.Transport{
		TLSClientConfig:   tlsConfigSkipVerify(),
		Proxy:             http.ProxyURL(mustParseProxy()),
		ForceAttemptHTTP2: true,
	}
	client := &http.Client{Transport: tr, Timeout: 30 * time.Second}

	verifyReq, _ := http.NewRequest("GET", targetURL, nil)
	verifyReq.Header.Set("User-Agent", userAgent)
	verifyReq.Header.Set("Cookie", cookieStr)
	verifyResp, err := client.Do(verifyReq)
	if err != nil {
		fmt.Println("cookie verify error:", err)
		return
	}
	io.ReadAll(verifyResp.Body)
	verifyResp.Body.Close()
	fmt.Printf("\n[验证] cookie 重放 / → %d %s\n", verifyResp.StatusCode, statusMark(verifyResp.StatusCode))
	if verifyResp.StatusCode != 200 {
		fmt.Println("cookie 无效，无法继续")
		return
	}

	// 5. 带 query 请求
	apiURL := strings.TrimRight(targetURL, "/") + apiPath
	// 完整业务 headers（selectByCondition 等接口需要 ClientTag/CurrentRoute/X-Token）
	body := `{}`
	if strings.Contains(apiPath, "selectByCondition") {
		body = `{"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}}`
	}
	req, _ := http.NewRequest(method, apiURL+"?"+paramName+"="+url.QueryEscape(query), strings.NewReader(body))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36")
	req.Header.Set("Cookie", cookieStr)
	req.Header.Set("Content-Type", "application/json;charset=UTF-8")
	req.Header.Set("Origin", strings.TrimRight(targetURL, "/"))
	req.Header.Set("Referer", targetURL)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9")
	req.Header.Set("ClientTag", "OUTNET_BROWSE")
	req.Header.Set("CurrentRoute", "/outNet")
	req.Header.Set("Intercept-Headers", "SKIP")
	req.Header.Set("X-Ticket", "undefined")
	req.Header.Set("X-Token", "null")
	req.Header.Set("sec-ch-ua", `"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"`)
	req.Header.Set("sec-ch-ua-mobile", "?0")
	req.Header.Set("sec-ch-ua-platform", `"macOS"`)

	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("query request error:", err)
		return
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("\n[结果] %s %s → %d %s\n", method, apiPath, resp.StatusCode, statusMark(resp.StatusCode))
	if resp.StatusCode == 200 {
		bodyStr := string(respBody)
		if len(bodyStr) > 150 {
			bodyStr = bodyStr[:150]
		}
		fmt.Printf("  响应: %s\n", bodyStr)
		fmt.Println("\n★★★ Go 纯算法 query 生成成功！服务器接受！ ★★★")
	} else {
		fmt.Printf("  响应: %s\n", string(respBody[:min(150, len(respBody))]))
		fmt.Println("\n✗ 失败")
	}
}

func statusMark(code int) string {
	if code == 200 {
		return "✓ 成功"
	}
	if code == 412 {
		return "✗ 挑战"
	}
	if code == 400 {
		return "✗ Bad Request"
	}
	return "✗"
}
