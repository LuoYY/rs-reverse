package main

import (
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type KeygenData struct {
	Basearr         []int    `json:"basearr"`
	Keys2           []int    `json:"keys2"`
	Keys16          []int    `json:"keys16"`
	Keys17          []int    `json:"keys17"`
	Keys7           []int    `json:"keys7"`
	R2mkaTime       int      `json:"r2mkaTime"`
	StartTime       int      `json:"startTime"`
	RunTime         int      `json:"runTime"`
	CodeUid         int      `json:"codeUid"`
	Basestr         string   `json:"basestr"`
	CookieName      string   `json:"cookieName"`
	CookiePrefix    string   `json:"cookiePrefix"`
	RefCookie       string   `json:"refCookie"`
	RefCookieLen    int      `json:"refCookieLen"`
	PipeNumenc      []int    `json:"pipeNumenc"`
	PipeXor         []int    `json:"pipeXor"`
	PipeBasearrEnc  []int    `json:"pipeBasearrEncrypt"`
	PipeNextarr     []int    `json:"pipeNextarr"`
	PipeUuid        int      `json:"pipeUuid"`
	HuffConfig      [][]int  `json:"huffConfig"`
	Random          float64  `json:"random"`
}

const (
	targetURL  = "https://pmos.xj.sgcc.com.cn:20080/"
	userAgent  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
	debugMode  = false
	proxyURL   = "http://74940609:aFmWc5Fs@140.249.234.175:2022"
)

func mustParseProxy() *url.URL {
	u, err := url.Parse(proxyURL)
	if err != nil {
		return nil
	}
	return u
}

func toBytes(arr []int) []byte {
	b := make([]byte, len(arr))
	for i, v := range arr {
		b[i] = byte(v)
	}
	return b
}

func toInts(b []byte) []int {
	arr := make([]int, len(b))
	for i, v := range b {
		arr[i] = int(v)
	}
	return arr
}

// generateCookie: pure Go cookie generation
func generateCookie(data *KeygenData) string {
	// 1. basearr (already computed by helper)
	basearr := toBytes(data.Basearr)

	// 2. Huffman encode (pure Go)
	numenc := numarrEncrypt(basearr)

	// 3. XOR with keys[2] (cyclic, 16 bytes)
	keys2 := toBytes(data.Keys2)
	xorResult := xorBytes(numenc, keys2)

	// 4. Apply numarrAddTime to keys17: append time bytes, XOR with ele, append ele
	keys17 := toBytes(data.Keys17)
	keys17time := numarrAddTime(keys17, data.RunTime, data.Random)

	// 5. Inner AES-CBC encrypt with keys17time (flag=0, no IV)
	basearrEncrypt := encryptMode1(xorResult, keys17time, false)

	// 6. Assemble nextarr (hasDebug=true at runtime: high byte = 128)
	r2mkaTimeBytes := u32bytes(uint32(data.R2mkaTime))
	startTimeBytes := u32bytes(uint32(data.StartTime))
	timeBytes := append(r2mkaTimeBytes, startTimeBytes...)
	inner := numarrJoin(byte(2), timeBytes, keys2)
	highByte := byte(int(len(basearrEncrypt)>>8&255) | 128)
	nextarr := numarrJoin(inner, highByte, basearrEncrypt)

	// 7. Compute uuid of nextarr
	uuidVal := uuid(nextarr)
	uuidBytes := u32bytes(uuidVal)

	// 8. Apply numarrAddTime to keys16
	keys16 := toBytes(data.Keys16)
	keys16time := numarrAddTime(keys16, data.RunTime, data.Random)

	// 9. Outer AES-CBC encrypt with keys16time (flag=1, with IV)
	plaintext := append(uuidBytes, nextarr...)
	enc16 := encryptMode1(plaintext, keys16time, true)

	// 10. Base64-like encode
	basestr := data.Basestr
	if basestr == "" {
		basestr = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^"
	}
	cookieStr := numarr2string(enc16, basestr)

	return data.CookiePrefix + cookieStr
}

// fetchChallenge: fetch 412 page, extract nsd/cd/O cookie
func fetchChallenge() (nsd int, cd, oCookie string, err error) {
	tr := &http.Transport{
		TLSClientConfig:   tlsConfigSkipVerify(),
		Proxy:             http.ProxyURL(mustParseProxy()),
		ForceAttemptHTTP2: true,
	}
	client := &http.Client{Transport: tr, Timeout: 30 * time.Second}

	resp, err := client.Get(targetURL)
	if err != nil {
		return 0, "", "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)

	// Parse $_ts.nsd and $_ts.cd
	nsdStr := extractBetween(bodyStr, `$_ts.nsd=`, `;`)
	if nsdStr == "" {
		return 0, "", "", fmt.Errorf("nsd not found")
	}
	fmt.Sscanf(nsdStr, "%d", &nsd)

	cd = extractBetween(bodyStr, `$_ts.cd="`, `"`)
	if cd == "" {
		return 0, "", "", fmt.Errorf("cd not found")
	}

	// Extract O cookie from Set-Cookie
	for _, c := range resp.Header["Set-Cookie"] {
		parts := strings.SplitN(c, ";", 2)
		if strings.Contains(parts[0], "=O") || strings.HasSuffix(strings.Split(parts[0], "=")[0], "O") {
			oCookie = parts[0]
			break
		}
	}
	if oCookie == "" && len(resp.Header["Set-Cookie"]) > 0 {
		oCookie = strings.Split(resp.Header["Set-Cookie"][0], ";")[0]
	}

	return nsd, cd, oCookie, nil
}

// callKeygenHelper: REMOVED - no longer needed, RunCoderFull handles everything in pure Go
// Kept as stub for test_keygen.go reference
func callKeygenHelper(nsd int, cd, oCookie string) (*KeygenData, error) {
	return nil, fmt.Errorf("callKeygenHelper removed - use RunCoderFull instead")
}

// replayCookie: send cookie and check response
func replayCookie(oCookie, cookieName, cookie string) (int, error) {
	tr := &http.Transport{
		TLSClientConfig:   tlsConfigSkipVerify(),
		Proxy:             http.ProxyURL(mustParseProxy()),
		ForceAttemptHTTP2: true,
	}
	client := &http.Client{Transport: tr, Timeout: 30 * time.Second}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Cookie", fmt.Sprintf("%s; %s=%s", oCookie, cookieName, cookie))

	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body)
	return resp.StatusCode, nil
}

func main() {
	rand.Seed(time.Now().UnixNano())

	// Mode: compare coder with fixed session
	if len(os.Args) > 1 && os.Args[1] == "compare" {
		mainCompareCoder()
		return
	}

	// Mode 1: test cd decryption (./pmos_go test)
	if len(os.Args) > 1 && os.Args[1] == "test" {
		testCdDecryption()
		return
	}

	// Mode: test POST (./pmos_go post)
	if len(os.Args) > 1 && os.Args[1] == "post" {
		testGoPost()
		return
	}

	// Mode: test query generation (./pmos_go query [url] [method])
	if len(os.Args) > 1 && os.Args[1] == "query" {
		testGoQuery(os.Args)
		return
	}

	fmt.Println("=== Go 纯算法 Cookie 生成可行性测试 ===")

	ok, bad := 0, 0
	for i := 0; i < 30; i++ {
		// 1. Fetch challenge
		nsd, cd, oCookie, err := fetchChallenge()
		if err != nil {
			fmt.Printf("#%d fetchChallenge error: %v\n", i+1, err)
			continue
		}

		// 2. Get keys + basearr via pure Go Coder (no Node.js dependency)
		rootDir, _ := os.Getwd()
		outerJsPath := filepath.Join(rootDir, "example", "pmos.xj.sgcc.com.cn", "kmOJZ0KVxJ0R", "rGTR1U4jJCVr.303c6e9.js")
		outerJsBytes, err := readFile(outerJsPath)
		if err != nil {
			fmt.Printf("#%d read outer JS error: %v\n", i+1, err)
			continue
		}
		outerJsCode := string(outerJsBytes)

		// RunCoderFull computes everything internally (pure Go, no JS runtime)
		data, err := RunCoderFull(nsd, cd, outerJsCode, 0)
		if err != nil {
			fmt.Printf("#%d RunCoderFull error: %v\n", i+1, err)
			continue
		}

		// 3. Generate cookie in pure Go
		goCookie := generateCookie(data)
		if i == 0 {
			fmt.Printf("  basearr len=%d cookieLen=%d\n", len(data.Basearr), len(goCookie))
		}

		// 4. Verify against Node.js reference cookie
		if i == 0 {
			fmt.Printf("Reference cookie len: %d\n", data.RefCookieLen)
			fmt.Printf("Go cookie len:        %d\n", len(goCookie))
			if goCookie == data.RefCookie {
				fmt.Println("✓ Go cookie == Node.js reference cookie (IDENTICAL)")
			} else {
				fmt.Println("✗ Go cookie != Node.js reference cookie (different)")
				// Find first diff
				for j := 0; j < min(len(goCookie), len(data.RefCookie)); j++ {
					if goCookie[j] != data.RefCookie[j] {
						fmt.Printf("  First diff at pos %d: go='%c' ref='%c'\n", j, goCookie[j], data.RefCookie[j])
						break
					}
				}
			}
		}

		// 5. Replay
		status, err := replayCookie(oCookie, data.CookieName, goCookie)
		if err != nil {
			fmt.Printf("#%d replay error: %v\n", i+1, err)
			continue
		}
		if status == 200 {
			ok++
		} else {
			bad++
		}
		fmt.Printf("#%d nsd=%d -> %d\n", i+1, nsd, status)
	}

	fmt.Printf("\n=== Go Result: 200=%d 412=%d (%.0f%%) ===\n", ok, bad, float64(ok)/float64(ok+bad)*100)
}

func extractBetween(s, start, end string) string {
	i := strings.Index(s, start)
	if i == -1 {
		return ""
	}
	i += len(start)
	j := strings.Index(s[i:], end)
	if j == -1 {
		return ""
	}
	return s[i : i+j]
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
