package main

import (
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

// 测试 Go POST 请求（不带 query）
func testGoPost() {
	fmt.Println("=== Go POST 测试（不带 query）===")

	// 1. 生成 cookie（复用 main 的逻辑）
	nsd, cd, oCookie, err := fetchChallenge()
	if err != nil {
		fmt.Println("fetchChallenge error:", err)
		return
	}
	fmt.Printf("nsd=%d\n", nsd)

	rootDir := "/Users/luoyy/work/github/GitHub/rs-reverse_glm"
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
	fmt.Printf("Cookie ready, length=%d\n", len(cookieStr))

	// 2. GET 验证
	tr := &http.Transport{
		TLSClientConfig:   tlsConfigSkipVerify(),
		Proxy:             http.ProxyURL(mustParseProxy()),
		ForceAttemptHTTP2: true,
	}
	client := &http.Client{Transport: tr, Timeout: 30 * time.Second}

	getReq, _ := http.NewRequest("GET", targetURL+"px-gateway/GatewayConfig/security", nil)
	getReq.Header.Set("User-Agent", userAgent)
	getReq.Header.Set("Cookie", cookieStr)
	getResp, err := client.Do(getReq)
	if err != nil {
		fmt.Println("GET error:", err)
		return
	}
	getBody, _ := io.ReadAll(getResp.Body)
	getResp.Body.Close()
	fmt.Printf("GET: %d (body len=%d)\n", getResp.StatusCode, len(getBody))
	if getResp.StatusCode == 200 {
		fmt.Printf("  body: %s\n", string(getBody[:min(80, len(getBody))]))
	}

	// 3. POST 不带 query
	postBody := `{}`
	postReq, _ := http.NewRequest("POST", targetURL+"px-gateway/GatewayConfig/getGatewayConfig", strings.NewReader(postBody))
	postReq.Header.Set("User-Agent", userAgent)
	postReq.Header.Set("Cookie", cookieStr)
	postReq.Header.Set("Content-Type", "application/json;charset=UTF-8")
	postReq.Header.Set("Origin", strings.TrimRight(targetURL, "/"))
	postReq.Header.Set("Referer", targetURL)
	postReq.Header.Set("Accept", "application/json, text/plain, */*")

	postResp, err := client.Do(postReq)
	if err != nil {
		fmt.Println("POST error:", err)
		return
	}
	postRespBody, _ := io.ReadAll(postResp.Body)
	postResp.Body.Close()
	fmt.Printf("\nPOST getGatewayConfig: %d (body len=%d)\n", postResp.StatusCode, len(postRespBody))
	if postResp.StatusCode == 200 {
		bodyStr := string(postRespBody)
		if len(bodyStr) > 100 {
			bodyStr = bodyStr[:100]
		}
		fmt.Printf("  body: %s\n", bodyStr)
		fmt.Println("\n★★★ Go POST 成功！ ★★★")
	} else {
		fmt.Printf("  body: %s\n", string(postRespBody[:min(100, len(postRespBody))]))
	}

	// 4. POST selectByCondition
	postBody2 := `{"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}}`
	postReq2, _ := http.NewRequest("POST", targetURL+"px-common-authority/marketMapping/selectByCondition", strings.NewReader(postBody2))
	postReq2.Header.Set("User-Agent", userAgent)
	postReq2.Header.Set("Cookie", cookieStr)
	postReq2.Header.Set("Content-Type", "application/json;charset=UTF-8")
	postReq2.Header.Set("Origin", strings.TrimRight(targetURL, "/"))
	postReq2.Header.Set("Referer", targetURL)
	postReq2.Header.Set("Accept", "application/json, text/plain, */*")

	postResp2, err := client.Do(postReq2)
	if err != nil {
		fmt.Println("POST2 error:", err)
		return
	}
	postRespBody2, _ := io.ReadAll(postResp2.Body)
	postResp2.Body.Close()
	fmt.Printf("\nPOST selectByCondition: %d (body len=%d)\n", postResp2.StatusCode, len(postRespBody2))
	if postResp2.StatusCode == 200 {
		bodyStr := string(postRespBody2)
		if len(bodyStr) > 100 {
			bodyStr = bodyStr[:100]
		}
		fmt.Printf("  body: %s\n", bodyStr)
	}

	fmt.Println("\n=== 总结 ===")
	fmt.Printf("GET: %d\n", getResp.StatusCode)
	fmt.Printf("POST getGatewayConfig: %d\n", postResp.StatusCode)
	fmt.Printf("POST selectByCondition: %d\n", postResp2.StatusCode)
}
