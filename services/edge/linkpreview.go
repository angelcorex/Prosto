package main

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// LinkPreviewData mirrors the TS type returned to the client.
type LinkPreviewData struct {
	URL         string  `json:"url"`
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Image       *string `json:"image"`
	SiteName    *string `json:"siteName"`
}

const (
	maxPreviewBytes = 512 * 1024
	previewTimeout  = 6 * time.Second
	maxRedirects    = 4
	previewUA       = "ProstoBot/1.0 (+https://prosto.ink; link-preview)"
	cacheTTL        = 15 * time.Minute
)

// previewClient follows redirects manually (CheckRedirect re-validates each hop).
var previewClient = &http.Client{
	Timeout:       previewTimeout,
	CheckRedirect: redirectGuard(maxRedirects),
}

// Small bounded in-process cache (keyed by requested URL).
type cacheEntry struct {
	at   time.Time
	data *LinkPreviewData // nil = negative cache (no preview)
}

var (
	previewCacheMu sync.Mutex
	previewCache   = map[string]cacheEntry{}
)

func cacheGet(key string) (*LinkPreviewData, bool) {
	previewCacheMu.Lock()
	defer previewCacheMu.Unlock()
	e, ok := previewCache[key]
	if !ok {
		return nil, false
	}
	if time.Since(e.at) > cacheTTL {
		delete(previewCache, key)
		return nil, false
	}
	return e.data, true
}

func cacheSet(key string, data *LinkPreviewData) {
	previewCacheMu.Lock()
	defer previewCacheMu.Unlock()
	if len(previewCache) > 500 {
		previewCache = map[string]cacheEntry{}
	}
	previewCache[key] = cacheEntry{at: time.Now(), data: data}
}

func handleLinkPreview(c *gin.Context) {
	raw := strings.TrimSpace(c.Query("url"))
	if raw == "" || len(raw) > 2048 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_url"})
		return
	}

	if data, ok := cacheGet(raw); ok {
		if data == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "no_preview"})
		} else {
			c.Header("cache-control", "private, max-age=900")
			c.JSON(http.StatusOK, data)
		}
		return
	}

	target := validateTarget(raw)
	if target == nil {
		cacheSet(raw, nil)
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_url"})
		return
	}

	data := fetchPreview(target)
	cacheSet(raw, data)
	if data == nil || (emptyStr(data.Title) && emptyStr(data.Description) && emptyStr(data.Image)) {
		c.JSON(http.StatusNotFound, gin.H{"error": "no_preview"})
		return
	}
	c.Header("cache-control", "private, max-age=900")
	c.JSON(http.StatusOK, data)
}

func fetchPreview(target *url.URL) *LinkPreviewData {
	req, err := http.NewRequest(http.MethodGet, target.String(), nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", previewUA)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	res, err := previewClient.Do(req)
	if err != nil {
		return nil
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil
	}
	ct := res.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/html") && !strings.Contains(ct, "application/xhtml+xml") {
		return nil
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, maxPreviewBytes))
	if err != nil {
		return nil
	}
	final := res.Request.URL // post-redirect URL
	return parseMeta(string(body), final)
}
