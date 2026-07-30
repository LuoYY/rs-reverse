//go:build ignore
// +build ignore

package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"crypto/tls"
)

func main() {
	rootDir, _ := os.Getwd()
	helperPath := filepath.Join(rootDir, "go-impl", "keygen_helper.js")
	
	tr := &http.Transport{ TLSClientConfig: &tls.Config{InsecureSkipVerify: true} }
	client := &http.Client{Transport: tr, Timeout: 15 * time.Second}
	
	ok := 0
	bad := 0
	for i := 0; i < 15; i++ {
		// Fetch challenge
		resp, _ := client.Get("https://pmos.xj.sgcc.com.cn:20080/")
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		bodyStr := string(body)
		
		nsdIdx := strings.Index(bodyStr, "$_ts.nsd=") + 9
		nsdEnd := strings.Index(bodyStr[nsdIdx:], ";")
		nsd := bodyStr[nsdIdx : nsdIdx+nsdEnd]
		
		cdStart := strings.Index(bodyStr, `$_ts.cd="`) + 9
		cdEnd := strings.Index(bodyStr[cdStart:], `"`)
		cd := bodyStr[cdStart : cdStart+cdEnd]
		
		// Get O cookie
		oCookie := ""
		for _, c := range resp.Header["Set-Cookie"] {
			parts := strings.SplitN(c, ";", 2)
			if strings.Contains(parts[0], "=O") {
				oCookie = parts[0]
				break
			}
		}
		if oCookie == "" && len(resp.Header["Set-Cookie"]) > 0 {
			oCookie = strings.Split(resp.Header["Set-Cookie"][0], ";")[0]
		}
		
		// Call helper
		tsPath := "/tmp/go-impl-ts.json"
		tsData := fmt.Sprintf(`{"nsd":%s,"cd":%q,"from":"https://pmos.xj.sgcc.com.cn:20080/"}`, nsd, cd)
		os.WriteFile(tsPath, []byte(tsData), 0644)
		
		cmd := exec.Command("node", helperPath, tsPath)
		cmd.Dir = rootDir
		cmd.Env = append(os.Environ(), "NODE_TLS_REJECT_UNAUTHORIZED=0", "NODE_OPTIONS=--dns-result-order=ipv4first")
		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
		cmd.Run()
		
		// Parse just codeUid from stdout JSON
		stdoutStr := stdout.String()
		codeUidIdx := strings.Index(stdoutStr, `"codeUid":`)
		codeUidEnd := strings.Index(stdoutStr[codeUidIdx+10:], ",")
		codeUid := stdoutStr[codeUidIdx+10 : codeUidIdx+10+codeUidEnd]
		
		_ = codeUid // just checking it works
		
		// Also get cookie from helper
		cookieIdx := strings.Index(stdoutStr, `"refCookie":"`)
		cookieStart := cookieIdx + 14
		cookieEnd := strings.Index(stdoutStr[cookieStart:], `"`)
		refCookie := stdoutStr[cookieStart : cookieStart+cookieEnd]
		
		// Replay with reference cookie
		req, _ := http.NewRequest("GET", "https://pmos.xj.sgcc.com.cn:20080/", nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
		req.Header.Set("Cookie", fmt.Sprintf("%s; %s", oCookie, refCookie))
		
		resp2, err := client.Do(req)
		if err != nil {
			fmt.Printf("#%d error: %v\n", i+1, err)
			continue
		}
		io.ReadAll(resp2.Body)
		resp2.Body.Close()
		
		status := resp2.StatusCode
		if status == 200 { ok++ } else { bad++ }
		fmt.Printf("#%d nsd=%s -> %d\n", i+1, nsd, status)
	}
	fmt.Printf("\n=== Result: 200=%d 412=%d (%.0f%%) ===\n", ok, bad, float64(ok)/float64(ok+bad)*100)
}
