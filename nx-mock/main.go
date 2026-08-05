package main

import (
	"bufio"
	"bytes"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	cookieO = "3RKyaeh47p90O"
	cookieP = "3RKyaeh47p90P"
)

// rawResp 表示一个从 .raw 文件解析出的 HTTP 响应
type rawResp struct {
	status  int
	headers [][2]string
	body    []byte
}

// parseRawFile 读取并解析 .raw 文件（HTTP/1.x 状态行 + 头 + body）
func parseRawFile(path string) (*rawResp, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return parseRaw(data)
}

func parseRaw(data []byte) (*rawResp, error) {
	rr := &rawResp{status: 200}

	// 兼容 \r\n\r\n 与 \n\n 两种分隔
	sep := []byte("\r\n\r\n")
	idx := bytes.Index(data, sep)
	if idx < 0 {
		sep = []byte("\n\n")
		idx = bytes.Index(data, sep)
	}
	if idx < 0 {
		return nil, fmt.Errorf("no header/body separator found in raw data")
	}
	// 原样保留 body 内容（html 末尾空行保留）
	rr.body = data[idx+len(sep):]

	sc := bufio.NewScanner(bytes.NewReader(data[:idx]))
	sc.Buffer(make([]byte, 1024*1024), 4*1024*1024)
	first := true
	for sc.Scan() {
		line := strings.TrimRight(sc.Text(), "\r")
		if first {
			// 状态行: HTTP/1.1 412 Precondition Failed
			parts := strings.SplitN(line, " ", 3)
			if len(parts) >= 2 {
				if code, err := strconv.Atoi(parts[1]); err == nil {
					rr.status = code
				}
			}
			first = false
			continue
		}
		if line == "" {
			continue
		}
		i := strings.IndexByte(line, ':')
		if i < 0 {
			continue
		}
		name := strings.TrimSpace(line[:i])
		value := strings.TrimSpace(line[i+1:])
		rr.headers = append(rr.headers, [2]string{name, value})
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return rr, nil
}

// write 将解析出的响应写回客户端
func (rr *rawResp) write(w http.ResponseWriter) {
	h := w.Header()
	for _, kv := range rr.headers {
		name, value := kv[0], kv[1]
		lower := strings.ToLower(name)
		switch lower {
		case "transfer-encoding", "content-length", "date":
			// 交由 net/http 根据 body 重新计算
			continue
		case "content-encoding":
			// raw 文件 body 可能已被抓包工具解压（明文），仅当真是 gzip 压缩数据时才保留该头
			if len(rr.body) < 2 || rr.body[0] != 0x1f || rr.body[1] != 0x8b {
				continue
			}
			h.Add(name, value)
		default:
			h.Add(name, value)
		}
	}
	w.WriteHeader(rr.status)
	if _, err := w.Write(rr.body); err != nil {
		log.Printf("write body: %v", err)
	}
}

func hasCookie(r *http.Request, name string) bool {
	c, err := r.Cookie(name)
	return err == nil && c.Value != ""
}

func serveRaw(w http.ResponseWriter, path string) {
	rr, err := parseRawFile(path)
	if err != nil {
		log.Printf("parse %s: %v", path, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	rr.write(w)
}

func serveJS(w http.ResponseWriter, path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Printf("read %s: %v", path, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// 原样返回 js 内容，但去掉末尾空行（连续换行）
	data = bytes.TrimRight(data, "\r\n")
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(data)
}

func main() {
	dir := flag.String("dir", ".", "静态文件目录（含 412.raw / 200.raw / c9qYRt1w5yKr/）")
	port := flag.String("port", "8997", "监听端口")
	flag.Parse()

	file412 := filepath.Join(*dir, "412.raw")
	file200 := filepath.Join(*dir, "200.raw")
	jsChallenge := filepath.Join(*dir, "c9qYRt1w5yKr", "83bw0aTvAW7K.2437991.js")
	jsApp := filepath.Join(*dir, "c9qYRt1w5yKr", "Dl5ApMEho6Yq.2437991.js")

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		hasO := hasCookie(r, cookieO)
		hasP := hasCookie(r, cookieP)

		switch r.URL.Path {
		case "/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js":
			// 挑战 js：带 O cookie 才下发（与真实站点一致）
			if hasO {
				serveJS(w, jsChallenge)
			} else {
				serveRaw(w, file412)
			}
		case "/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js":
			if hasO && hasP {
				serveJS(w, jsApp)
			} else {
				serveRaw(w, file412)
			}
		case "/":
			switch {
			case hasO && hasP:
				serveRaw(w, file200)
			default:
				// 无 cookie / 仅带 O（未完成挑战）都返回 412 挑战页 html
				serveRaw(w, file412)
			}
		default:
			serveRaw(w, file412)
		}
	})

	addr := ":" + *port
	log.Printf("nx-mock listening on %s (dir=%s)", addr, *dir)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
