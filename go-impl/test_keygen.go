package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
)

func testCdDecryption() {
	fmt.Println("=== Pure Go cd decryption test ===")

	nsd, cd, _, err := fetchChallenge()
	if err != nil {
		fmt.Println("Failed to fetch challenge:", err)
		os.Exit(1)
	}
	fmt.Printf("nsd=%d cd_len=%d\n", nsd, len(cd))

	// Get cp3 via goja
	rootDir, _ := os.Getwd()
	outerJs, _ := os.ReadFile(rootDir + "/example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js")
	cp3, err := runOuterVMGoja(nsd, cd, string(outerJs))
	if err != nil {
		fmt.Printf("goja cp3 error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("cp3=%d\n", cp3)

	// Parse cd in pure Go
	basestr := "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^"
	initConstData(basestr)
	goKeys := parseCdToKeys(cd, cp3)

	fmt.Printf("Go keys count: %d\n", len(goKeys))
	if len(goKeys) > 16 {
		fmt.Printf("Go keys16: %v\n", goKeys[16])
	}
	if len(goKeys) > 17 {
		fmt.Printf("Go keys17: %v\n", goKeys[17])
	}

	// Get Node.js reference
	tsJSON := fmt.Sprintf(`{"nsd":%d,"cd":%q,"from":"https://pmos.xj.sgcc.com.cn:20080/"}`, nsd, cd)
	os.WriteFile("/tmp/go-test-ts.json", []byte(tsJSON), 0644)
	cmd := exec.Command("node", rootDir+"/go-impl/keygen_helper.js", "/tmp/go-test-ts.json")
	cmd.Env = append(os.Environ(), "NODE_TLS_REJECT_UNAUTHORIZED=0", "NODE_OPTIONS=--dns-result-order=ipv4first")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err = cmd.Run()
	if err != nil {
		fmt.Printf("Node.js helper error: %v\nstderr: %s\n", err, stderr.String())
		os.Exit(1)
	}

	var ref KeygenData
	json.Unmarshal(stdout.Bytes(), &ref)
	fmt.Printf("\nNode keys16: %v\n", ref.Keys16)
	fmt.Printf("Node keys17: %v\n", ref.Keys17)

	// Compare
	k16Match := intSliceEqual(goKeys[16], ref.Keys16)
	k17Match := intSliceEqual(goKeys[17], ref.Keys17)
	k2Match := intSliceEqual(goKeys[2], ref.Keys2)
	fmt.Printf("\n=== keys16 match: %v, keys17 match: %v, keys2 match: %v ===\n", k16Match, k17Match, k2Match)
}

func intSliceEqual(a, b []int) bool {
	if len(a) != len(b) { return false }
	for i := range a { if a[i] != b[i] { return false } }
	return true
}
