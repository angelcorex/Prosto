package main

import (
	"html"
	"net/url"
	"regexp"
	"strings"
)

// Allow-listed meta extraction — mirrors the TS route's metaContent/parseMeta.
// Two attribute orders are tried (content-before-key and key-before-content).

var titleTagRe = regexp.MustCompile(`(?is)<title[^>]*>([^<]*)</title>`)

func metaContent(htmlStr, key string) string {
	esc := regexp.QuoteMeta(key)
	// (property|name)="key" ... content="..."
	re1 := regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)=["']` + esc + `["'][^>]*\scontent=["']([^"']*)["']`)
	if m := re1.FindStringSubmatch(htmlStr); m != nil {
		return decodeEntities(m[1])
	}
	// content="..." ... (property|name)="key"
	re2 := regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']` + esc + `["']`)
	if m := re2.FindStringSubmatch(htmlStr); m != nil {
		return decodeEntities(m[1])
	}
	return ""
}

func decodeEntities(s string) string {
	return strings.TrimSpace(html.UnescapeString(s))
}

func parseMeta(htmlStr string, final *url.URL) *LinkPreviewData {
	title := firstNonEmpty(metaContent(htmlStr, "og:title"), metaContent(htmlStr, "twitter:title"))
	if title == "" {
		if m := titleTagRe.FindStringSubmatch(htmlStr); m != nil {
			title = decodeEntities(m[1])
		}
	}
	desc := firstNonEmpty(metaContent(htmlStr, "og:description"), metaContent(htmlStr, "twitter:description"), metaContent(htmlStr, "description"))
	rawImg := firstNonEmpty(
		metaContent(htmlStr, "og:image:secure_url"),
		metaContent(htmlStr, "og:image"),
		metaContent(htmlStr, "twitter:image"),
		metaContent(htmlStr, "twitter:image:src"),
	)
	site := metaContent(htmlStr, "og:site_name")
	if site == "" {
		site = strings.TrimPrefix(final.Hostname(), "www.")
	}

	var image string
	if rawImg != "" {
		if abs, err := final.Parse(rawImg); err == nil && (abs.Scheme == "http" || abs.Scheme == "https") {
			image = abs.String()
		}
	}

	return &LinkPreviewData{
		URL:         final.String(),
		Title:       clip(title, 300),
		Description: clip(desc, 500),
		Image:       ptrOrNil(image),
		SiteName:    clip(site, 100),
	}
}

func clip(s string, n int) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if len(s) > n {
		s = s[:n-1] + "…"
	}
	return &s
}

func ptrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func emptyStr(p *string) bool { return p == nil || *p == "" }
