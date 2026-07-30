package main

import "crypto/tls"

func tlsConfigSkipVerify() *tls.Config {
	return &tls.Config{InsecureSkipVerify: true}
}
