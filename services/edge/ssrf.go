package main

import (
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
)

var (
	errTooManyRedirects = errors.New("too many redirects")
	errBlockedRedirect  = errors.New("redirect to blocked host")
)

// isBlockedIP reports whether an IP literal must never be fetched (SSRF guard).
// Mirrors the TS route's isBlockedIp: blocks loopback, private, link-local
// (incl. the 169.254.169.254 cloud-metadata IP), CGNAT, ULA, multicast.
func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsInterfaceLocalMulticast() {
		return true
	}
	if v4 := ip.To4(); v4 != nil {
		switch {
		case v4[0] == 0 || v4[0] == 10 || v4[0] == 127:
			return true
		case v4[0] == 169 && v4[1] == 254: // link-local + metadata
			return true
		case v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31:
			return true
		case v4[0] == 192 && v4[1] == 168:
			return true
		case v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127: // CGNAT
			return true
		case v4[0] >= 224:
			return true
		}
		return false
	}
	// IPv6: ULA fc00::/7 (fc/fd prefix) — Go has no stdlib helper.
	if len(ip) == net.IPv6len && (ip[0] == 0xfc || ip[0] == 0xfd) {
		return true
	}
	return false
}

// hostIsPublic resolves a hostname and requires EVERY resolved address to be
// public. A bare-IP host is validated directly.
func hostIsPublic(host string) bool {
	if ip := net.ParseIP(host); ip != nil {
		return !isBlockedIP(ip)
	}
	addrs, err := net.LookupIP(host)
	if err != nil || len(addrs) == 0 {
		return false
	}
	for _, a := range addrs {
		if isBlockedIP(a) {
			return false
		}
	}
	return true
}

// validateTarget parses + validates a candidate URL for fetching: http(s) only,
// standard ports only, no embedded creds, public host. Returns nil when unsafe.
func validateTarget(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		return nil
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil
	}
	if p := u.Port(); p != "" && p != "80" && p != "443" && p != "8080" && p != "8443" {
		return nil
	}
	if u.User != nil {
		return nil
	}
	host := u.Hostname()
	if host == "" || !hostIsPublic(host) {
		return nil
	}
	return u
}

// safeRedirectHost is a http.Client CheckRedirect helper: it re-validates every
// hop so a redirect to an internal address can't slip past the initial guard.
func redirectGuard(maxHops int) func(req *http.Request, via []*http.Request) error {
	return func(req *http.Request, via []*http.Request) error {
		if len(via) >= maxHops {
			return errTooManyRedirects
		}
		if validateTarget(req.URL.String()) == nil {
			return errBlockedRedirect
		}
		return nil
	}
}

func stripTrailingSlash(s string) string { return strings.TrimRight(s, "/") }
