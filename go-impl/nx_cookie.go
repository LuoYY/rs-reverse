// nx_cookie.go — nx 站点纯 Go cookie/query 生成 + GET 支持
//
// 完整链路（纯 Go，无 Node/浏览器）：
//   nxFetchChallenge() → nsd/cd/O cookie
//   deriveKeysNx(cd) → keys2/keys16/keys17
//   buildBasearrNx() → base（固定模板段 + 自由段，保持 huffman bits=1217）
//   generateCookieNx() → 'a'+P cookie 值（buildCookie 移植，test_bits_random.js:32）
//   genQueryNx() → 双 query（URL query + MurR7rxG header）
//   nxGET() → 完整 headers 发请求（nx_pure_client.js 验证 200）
//
// 参考（已验证 200）：
//   - buildCookie: wb-pmos-nx/nx-sdenv/test_bits_random.js:32
//   - query: wb-pmos-nx/BREAKTHROUGH.md + nx_pure_client.js（双 query）
//   - keys: nx_main.go deriveOffsetNx + genKeysNx
package main

import (
	"encoding/json"
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

// nx 站点常量
const (
	nxTargetURL     = "https://pmos.nx.sgcc.com.cn:10443/"
	nxAPIBase       = "https://pmos.nx.sgcc.com.cn:10443"
	nxUserAgent     = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
	nxCookieO       = "3RKyaeh47p90O"
	nxCookieP       = "3RKyaeh47p90P"
	nxQueryParam    = "MurR7rxG"
	nxProxy         = "http://ericshi:583315@120.221.249.98:2018"
	nxBasestrAll    = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^" // 86 字符
	nxCdBasestr     = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^"
	nxQueryBasestr  = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^" // query 用 '.' 版本
	nxCookieCharset = 64 // P cookie 用 NX_BS 前 64 字符
)

// nx K16（固定，见 collect_final_working.js）
var nxK16 = []int{215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173}

// nx prefix mask（query 用，见 query_gen_module.js）
var nxQueryPrefixMask = []byte{0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01}

// nxBasearrTemplateDir 基线 base 模板样本（anchor_analysis_files/nx_many_samples.json）
// 模板段 [0:22]+[25]+[28:71]+[73]+[108] 跨会话恒定（同环境批次），自由段保持 huffman bits=1217
var nxBasearrTemplate = []int{}

func init() {
	if err := loadNxBasearrTemplate(); err != nil {
		fmt.Fprintf(os.Stderr, "[nx] warn: load basearr template: %v\n", err)
	}
}

// loadNxBasearrTemplate 从工作区样本文件加载一套 base 模板
func loadNxBasearrTemplate() error {
	candidates := []string{
		"wb-pmos-nx/anchor_analysis_files/nx_many_samples.json",
		"anchor_analysis_files/nx_many_samples.json",
	}
	for _, rel := range candidates {
		root, _ := os.Getwd()
		p := filepath.Join(root, rel)
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var samples []struct {
			Base []int `json:"base"`
		}
		if err := json.Unmarshal(b, &samples); err != nil || len(samples) == 0 {
			continue
		}
		nxBasearrTemplate = samples[0].Base
		return nil
	}
	return fmt.Errorf("未找到 nx_many_samples.json")
}

// nxTransport 创建带代理的 HTTP transport
func nxTransport() *http.Transport {
	tr := &http.Transport{
		TLSClientConfig:   tlsConfigSkipVerify(),
		ForceAttemptHTTP2: true,
	}
	if pu, err := url.Parse(nxProxy); err == nil {
		tr.Proxy = http.ProxyURL(pu)
	}
	return tr
}

// nxFetchChallenge 拉 412 挑战页，解析 nsd/cd + O cookie
func nxFetchChallenge() (nsd int, cd, oCookie string, err error) {
	client := &http.Client{Transport: nxTransport(), Timeout: 30 * time.Second}
	resp, err := client.Get(nxTargetURL)
	if err != nil {
		return 0, "", "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)

	nsdStr := extractBetween(bodyStr, `$_ts.nsd=`, `;`)
	if nsdStr == "" {
		return 0, "", "", fmt.Errorf("nsd not found (status=%d)", resp.StatusCode)
	}
	fmt.Sscanf(nsdStr, "%d", &nsd)
	cd = extractBetween(bodyStr, `$_ts.cd="`, `"`)
	if cd == "" {
		return 0, "", "", fmt.Errorf("cd not found")
	}
	// O cookie（最后一条 Set-Cookie）
	for _, c := range resp.Header["Set-Cookie"] {
		parts := strings.SplitN(c, ";", 2)
		name := strings.SplitN(parts[0], "=", 2)[0]
		if strings.HasSuffix(name, "O") {
			oCookie = parts[0]
		}
	}
	return nsd, cd, oCookie, nil
}

// ---- deriveKeysNx: cd → keys（K16 锚扫描，移植自 collect_final_working.js）----

func decryptCdNx(str string) []int {
	idxmap := make(map[rune]int)
	for i, k := range nxCdBasestr {
		idxmap[k] = i
	}
	runes := []rune(str)
	var ans []int
	for i := 0; i < len(runes); i += 4 {
		one, two, three, four := runes[i], rune(0), rune(0), rune(0)
		if i+1 < len(runes) {
			two = runes[i+1]
		}
		if i+2 < len(runes) {
			three = runes[i+2]
		}
		if i+3 < len(runes) {
			four = runes[i+3]
		}
		if two != 0 {
			ans = append(ans, idxmap[one]<<2|idxmap[two]>>4)
		}
		if three != 0 {
			ans = append(ans, (idxmap[two]&15)<<4|idxmap[three]>>2)
		}
		if four != 0 {
			ans = append(ans, (idxmap[three]&3)<<6|idxmap[four])
		}
	}
	return ans
}

func genKeysSimNx(ans []int) [][]int {
	var keys [][]int
	op := 1
	for i := 0; i < ans[0]; i++ {
		gap, newOp := getLensGoNx(ans, op)
		if gap < 0 || newOp+gap > len(ans) {
			return nil
		}
		keys = append(keys, ans[newOp:newOp+gap])
		op = newOp + gap
	}
	return keys
}

func deriveOffsetNxGo(tail []int) []int {
	if len(tail) < 40 {
		return nil
	}
	off0 := tail[0] ^ 51
	off1 := tail[1] ^ 2
	off4 := tail[4] ^ 2
	off7 := tail[7] ^ 48
	for k0 := 0; k0 <= 127; k0++ {
		off2 := tail[2] ^ k0
		off5 := tail[5] ^ k0
		for k1 := 0; k1 <= 127; k1++ {
			off3 := tail[3] ^ k1
			off6 := tail[6] ^ k1
			offset := []int{off0, off1, off2, off3, off4, off5, off6, off7}
			ans := make([]int, len(tail))
			for i := range tail {
				ans[i] = tail[i] ^ offset[i%8]
			}
			if ans[0] != 51 || ans[1] != 2 || ans[4] != 2 || ans[7] != 48 {
				continue
			}
			keys := genKeysSimNx(ans)
			if keys != nil && len(keys) > 2 && len(keys[2]) == 48 && len(keys) > 32 &&
				len(keys[29]) == 4 && len(keys[30]) == 4 && len(keys[31]) == 4 && len(keys[32]) == 4 {
				return offset
			}
		}
	}
	return nil
}

// deriveKeysNx 返回 keys 数组（keys[2]/keys[16]/keys[17]）
func deriveKeysNx(cd string) [][]int {
	cdArr := decryptCdNx(cd)
	end := (cdArr[0]<<8 | cdArr[1]) + 2
	tail := cdArr[end:]
	offset := deriveOffsetNxGo(tail)
	if offset == nil {
		return nil
	}
	ans := make([]int, len(tail))
	for i := range tail {
		ans[i] = tail[i] ^ offset[i%8]
	}
	return genKeysSimNx(ans)
}

// ---- buildBasearrNx: base = 模板段 + 自由段（保持 huffman bits）----

// totalHuffBits 计算 base 的 huffman 总 bits（应为 1217）
func totalHuffBits(base []int) int {
	total := 0
	for _, b := range base {
		if c, ok := huffCodeOf(int(b)); ok {
			total += c.val
		}
	}
	return total
}

// huffCodeOf 查 huffman 码表（与 numarrEncrypt 相同码树）
func huffCodeOf(b int) (huffConfig, bool) {
	if b >= 0 && b < len(huffConfigs) && (b != 0 || huffConfigs[b].val > 0) {
		return huffConfigs[b], true
	}
	return huffConfig{}, false
}

// buildBasearrNx 从模板构造 base（模板段固定，自由段随机但保持总 bits）
// 自由段：模板中 [22:27]+[68]+[72]+[74:107]+[109:160] 可变，但总 bits 保持 1217
// 简化策略：直接使用模板 base（已跨会话验证），自由段微调保持 bits 一致
func buildBasearrNx() []int {
	if len(nxBasearrTemplate) == 0 {
		return nil
	}
	base := make([]int, len(nxBasearrTemplate))
	copy(base, nxBasearrTemplate)
	// 自由段字节用随机值替换，但需保持 huffman bits 总量一致
	// 为稳妥，本次交付直接用模板 base（其 bits=1217 已验证），
	// 自由段随机化留待模板化验证通过后再启用。
	return base
}

// ---- generateCookieNx: buildCookie 移植（test_bits_random.js:32）----

func nxRandom() float64 { return rand.Float64() }

func nxNumToNumarr4(v uint32) []byte {
	return []byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}
}

// generateCookieNx 生成 P cookie 值（不含 'a' 前缀时的完整结构）
// base: basearr（模板+自由段），keys2/keys17: deriveKeysNx 输出，r2mka/startT: 会话时间戳
func generateCookieNx(base, keys2, keys17 []int, r2mka, startT uint32) string {
	random := nxRandom()

	// 1. basearrEncrypt = encryptMode1(xor(numarrEncrypt(base), keys2, 16), numarrAddTime(keys17,r2mka,random)[0], 0)
	numenc := numarrEncrypt(toBytes(base))
	xored := xorBytes(numenc, toBytes(keys2))
	k17time := numarrAddTime(toBytes(keys17), int(r2mka), random)
	basearrEncrypt := encryptMode1(xored, k17time, false)

	// 2. nextarr = [4, 8, r2mka4, startT4, 48, ...keys2, beLen_hi|128, beLen_lo, ...basearrEncrypt]
	nextarr := []byte{4, 8}
	nextarr = append(nextarr, nxNumToNumarr4(r2mka)...)
	nextarr = append(nextarr, nxNumToNumarr4(startT)...)
	nextarr = append(nextarr, 48)
	nextarr = append(nextarr, toBytes(keys2)...)
	nextarr = append(nextarr, byte(len(basearrEncrypt)>>8&255)|128, byte(len(basearrEncrypt)&255))
	nextarr = append(nextarr, basearrEncrypt...)

	// 3. 外层：'a' + numarr2string(encryptMode1([uuid, ...nextarr], numarrAddTime(K16,r2mka,random)[0], 1), NX_BS[:64])
	uuidBytes := nxNumToNumarr4(uuid(nextarr))
	plain := append(uuidBytes, nextarr...)
	k16time := numarrAddTime(toBytes(nxK16), int(r2mka), random)
	enc16 := encryptMode1(plain, k16time, true)
	cookieCharset := nxBasestrAll[:nxCookieCharset]
	return "a" + numarr2string(enc16, cookieCharset)
}

// ---- genQueryNx: 双 query 生成（BREAKTHROUGH.md）----

func nxCrc32(data []byte) uint32 { return uuid(data) }

// genQueryNx 生成 nx query 参数值
func genQueryNx(urlPath string, keys2, keys17 []int) string {
	now := time.Now().Unix()
	random := rand.Float64()
	k17time := numarrAddTime(toBytes(keys17), int(now), random)
	randByte := func() byte { return byte(rand.Intn(256)) }
	crcUrl := nxCrc32([]byte(strings.ToUpper(urlPath)))
	plain24 := make([]byte, 24)
	m := nxQueryPrefixMask
	plain24[0] = byte(keys2[0]) ^ m[0]
	plain24[1] = byte(keys2[1]) ^ m[1]
	plain24[2] = byte(keys2[2]) ^ m[2]
	plain24[3] = byte(keys2[3]) ^ m[3]
	plain24[4] = byte(keys2[4]) ^ m[4]
	plain24[5] = byte(keys2[5]) ^ m[5]
	plain24[6] = byte(keys2[6]) ^ m[6]
	plain24[7] = byte(keys2[7]) ^ m[7]
	for i := 8; i < 16; i++ {
		plain24[i] = randByte()
	}
	plain24[16] = 0xb7
	plain24[17] = randByte()
	plain24[18] = randByte()
	plain24[19] = randByte()
	plain24[20] = byte(crcUrl >> 24)
	plain24[21] = byte(crcUrl >> 16)
	plain24[22] = byte(crcUrl >> 8)
	plain24[23] = byte(crcUrl)
	requestData := encryptMode1(plain24, k17time, false)
	body := make([]byte, 0, 84)
	body = append(body, 4, 0, 48)
	body = append(body, toBytes(keys2)...)
	body = append(body, 32)
	body = append(body, requestData...)
	crc := nxCrc32(body)
	b88 := make([]byte, 0, 88)
	b88 = append(b88, byte(crc>>24), byte(crc>>16), byte(crc>>8), byte(crc))
	b88 = append(b88, body...)
	queryBasestr := nxQueryBasestr
	if len(queryBasestr) == 0 {
		queryBasestr = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^"
	}
	return "a" + numarr2string(b88, queryBasestr)
}

// ---- nxGET: 完整 headers GET 请求（nx_pure_client.js 验证 200）----

// nxBizHeaders 返回 nx 前端实际发送的业务 headers
func nxBizHeaders() http.Header {
	h := http.Header{}
	h.Set("Accept", "application/json, text/plain, */*")
	h.Set("ClientTag", "OUTNET_BROWSE")
	h.Set("CurrentRoute", "/outNet")
	h.Set("Origin", "https://pmos.nx.sgcc.com.cn:10443")
	h.Set("Referer", "https://pmos.nx.sgcc.com.cn:10443/")
	h.Set("X-Ticket", "undefined")
	h.Set("X-Token", "null")
	return h
}

// nxGet 带双 query + 完整 headers 发 GET
// 返回 status + body
func nxGet(urlPath, oCookie, pCookie string, keys2, keys17 []int, timeoutSec int) (int, string, error) {
	client := &http.Client{Transport: nxTransport(), Timeout: time.Duration(timeoutSec) * time.Second}
	urlQ := genQueryNx(urlPath, keys2, keys17)
	hdrQ := genQueryNx(urlPath, keys2, keys17)
	fullURL := nxAPIBase + urlPath + "?" + urlQ
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return 0, "", err
	}
	h := nxBizHeaders()
	for k, vs := range h {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	req.Header.Set("User-Agent", nxUserAgent)
	req.Header.Set("Cookie", fmt.Sprintf("%s; %s=%s", oCookie, nxCookieP, pCookie))
	req.Header.Set(nxQueryParam, hdrQ)
	resp, err := client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body), nil
}
