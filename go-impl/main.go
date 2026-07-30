package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type KeygenData struct {
	Basearr         []int    `json:"basearr"`
	Keys2           []int    `json:"keys2"`
	Keys16          []int    `json:"keys16"`
	Keys17          []int    `json:"keys17"`
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
}

const (
	targetURL  = "https://pmos.xj.sgcc.com.cn:20080/"
	userAgent  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
	debugMode  = false
)

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

	// 3. XOR with keys[2]
	keys2 := toBytes(data.Keys2)
	xorResult := xorBytes(numenc, keys2)

	// 4. Inner AES-CBC encrypt with keys17 (flag=0)
	keys17 := toBytes(data.Keys17)
	basearrEncrypt := encryptMode1(xorResult, keys17, false)

	// 5. Assemble nextarr (hasDebug=true at runtime: high byte = 128)
	r2mkaTimeBytes := u32bytes(uint32(data.R2mkaTime))
	startTimeBytes := u32bytes(uint32(data.StartTime))
	timeBytes := append(r2mkaTimeBytes, startTimeBytes...)
	inner := numarrJoin(byte(2), timeBytes, keys2)
	highByte := byte(int(len(basearrEncrypt)>>8&255) | 128)
	nextarr := numarrJoin(inner, highByte, basearrEncrypt)

	// 6. Compute uuid of nextarr
	uuidVal := uuid(nextarr)
	uuidBytes := u32bytes(uuidVal)

	// 7. Outer AES-CBC encrypt with keys16 (flag=1, with IV)
	plaintext := append(uuidBytes, nextarr...)
	keys16 := toBytes(data.Keys16)
	enc16 := encryptMode1(plaintext, keys16, true)

	// 8. Base64-like encode
	cookieStr := numarr2string(enc16, data.Basestr)

	// Debug: print intermediate sizes and compare with pipeline
	if debugMode {
		fmt.Fprintf(os.Stderr, "  sizes: basearr=%d numenc=%d xor=%d basearrEnc=%d inner=%d nextarr=%d plaintext=%d enc16=%d cookie=%d\n",
			len(basearr), len(numenc), len(xorResult), len(basearrEncrypt), len(inner), len(nextarr), len(plaintext), len(enc16), len(cookieStr)+1)

		// Compare intermediate values with pipeline
		pipeNumenc := toBytes(data.PipeNumenc)
		pipeXor := toBytes(data.PipeXor)
		pipeBae := toBytes(data.PipeBasearrEnc)
		pipeNext := toBytes(data.PipeNextarr)

		fmt.Fprintf(os.Stderr, "  numenc match: %v (%d vs %d)\n", bytesEqual(numenc, pipeNumenc), len(numenc), len(pipeNumenc))
		if !bytesEqual(numenc, pipeNumenc) {
			for i := 0; i < min(len(numenc), len(pipeNumenc)); i++ {
				if numenc[i] != pipeNumenc[i] {
					fmt.Fprintf(os.Stderr, "  numenc first diff at %d: go=%d pipe=%d\n", i, numenc[i], pipeNumenc[i])
					// Also show the basearr bytes that produced this
					break
				}
			}
			// Show first 10 bytes of each
			fmt.Fprintf(os.Stderr, "  numenc go:   %v\n", numenc[:min(10, len(numenc))])
			fmt.Fprintf(os.Stderr, "  numenc pipe: %v\n", pipeNumenc[:min(10, len(pipeNumenc))])
		}
		fmt.Fprintf(os.Stderr, "  xor match:    %v (%d vs %d)\n", bytesEqual(xorResult, pipeXor), len(xorResult), len(pipeXor))
		if !bytesEqual(xorResult, pipeXor) {
			for i := 0; i < min(len(xorResult), len(pipeXor)); i++ {
				if xorResult[i] != pipeXor[i] {
					fmt.Fprintf(os.Stderr, "  xor first diff at %d: go=%d pipe=%d (numenc=%d key2=%d)\n", i, xorResult[i], pipeXor[i], numenc[i], keys2[i%16])
					break
				}
			}
		}
		fmt.Fprintf(os.Stderr, "  baseEnc match: %v (%d vs %d)\n", bytesEqual(basearrEncrypt, pipeBae), len(basearrEncrypt), len(pipeBae))
		fmt.Fprintf(os.Stderr, "  nextarr match: %v (%d vs %d)\n", bytesEqual(nextarr, pipeNext), len(nextarr), len(pipeNext))
		fmt.Fprintf(os.Stderr, "  uuid: go=%d pipe=%d match=%v\n", uuidVal, data.PipeUuid, uuidVal == uint32(data.PipeUuid))

		// Find first diff in basearrEncrypt
		if !bytesEqual(basearrEncrypt, pipeBae) {
			for i := 0; i < min(len(basearrEncrypt), len(pipeBae)); i++ {
				if basearrEncrypt[i] != pipeBae[i] {
					fmt.Fprintf(os.Stderr, "  baseEnc first diff at %d: go=%d pipe=%d\n", i, basearrEncrypt[i], pipeBae[i])
					break
				}
			}
		}
	}

	return data.CookiePrefix + cookieStr
}

// fetchChallenge: fetch 412 page, extract nsd/cd/O cookie
func fetchChallenge() (nsd int, cd, oCookie string, err error) {
	tr := &http.Transport{
		TLSClientConfig: tlsConfigSkipVerify(),
	}
	client := &http.Client{Transport: tr, Timeout: 15 * time.Second}

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

// callKeygenHelper: call Node.js helper to get keys + basearr
func callKeygenHelper(nsd int, cd, oCookie string) (*KeygenData, error) {
	rootDir, _ := os.Getwd()
	helperPath := filepath.Join(rootDir, "go-impl", "keygen_helper.js")
	if _, err := os.Stat(helperPath); err != nil {
		helperPath = filepath.Join(filepath.Dir(rootDir), "go-impl", "keygen_helper.js")
	}

	// Write ts.json
	tsPath := "/tmp/go-impl-ts.json"
	tsData := fmt.Sprintf(`{"nsd":%d,"cd":%q,"from":%q}`, nsd, cd, targetURL)
	os.WriteFile(tsPath, []byte(tsData), 0644)

	cmd := exec.Command("node", helperPath, tsPath)
	cmd.Dir = rootDir
	cmd.Env = append(os.Environ(),
		"NODE_TLS_REJECT_UNAUTHORIZED=0",
		"NODE_OPTIONS=--dns-result-order=ipv4first",
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("keygen helper failed: %v\nstderr: %s", err, stderr.String())
	}

	var data KeygenData
	err = json.Unmarshal(stdout.Bytes(), &data)
	if err != nil {
		return nil, fmt.Errorf("JSON parse failed: %v\nstdout: %s", err, stdout.String()[:min(500, len(stdout.String()))])
	}
	return &data, nil
}

// replayCookie: send cookie and check response
func replayCookie(oCookie, cookieName, cookie string) (int, error) {
	tr := &http.Transport{
		TLSClientConfig: tlsConfigSkipVerify(),
	}
	client := &http.Client{Transport: tr, Timeout: 15 * time.Second}

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

	// Mode 1: test cd decryption (./pmos_go test)
	if len(os.Args) > 1 && os.Args[1] == "test" {
		testCdDecryption()
		return
	}

	fmt.Println("=== Go 纯算法 Cookie 生成可行性测试 ===")

	ok, bad := 0, 0
	for i := 0; i < 15; i++ {
		// 1. Fetch challenge
		nsd, cd, oCookie, err := fetchChallenge()
		if err != nil {
			fmt.Printf("#%d fetchChallenge error: %v\n", i+1, err)
			continue
		}

		// 2. Get keys via goja (pure Go, no Node.js dependency)
		data, err := runKeygenGoja(nsd, cd, targetURL)
		if err != nil {
			// Fallback to Node.js helper if goja fails
			fmt.Printf("#%d goja error: %v, falling back to node\n", i+1, err)
			data, err = callKeygenHelper(nsd, cd, oCookie)
			if err != nil {
				fmt.Printf("#%d keygenHelper error: %v\n", i+1, err)
				continue
			}
		}

		// 3. Generate cookie in pure Go
		goCookie := generateCookie(data)

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
