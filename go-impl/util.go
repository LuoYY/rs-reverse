package main

import (
	"os"
	"path/filepath"
	"time"
)

func getWd() (string, error) { return os.Getwd() }
func readFile(p string) ([]byte, error) { return os.ReadFile(p) }
var _ = time.Now
var _ = filepath.Join
