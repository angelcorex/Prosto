package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// GifItem mirrors the TS route's shape so the client picker is unchanged.
type GifItem struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Preview     string `json:"preview"`
	Description string `json:"description"`
}

const giphyBetaKey = "dc6zaTOxFJmzC" // Giphy public beta key (dev/demo fallback)
const giphyBase = "https://api.giphy.com/v1/gifs"

var digitsOnly = regexp.MustCompile(`^\d+$`)

var gifClient = &http.Client{Timeout: 8 * time.Second}

// handleGif proxies Giphy search/trending so the API key never reaches the
// client. Response shape { results: []GifItem, next } is provider-agnostic.
func handleGif(c *gin.Context) {
	q := c.Query("q")
	pos := c.Query("pos")

	key := os.Getenv("GIPHY_API_KEY")
	if key == "" {
		key = giphyBetaKey
	}
	offset := "0"
	if digitsOnly.MatchString(pos) {
		offset = pos
	}

	params := url.Values{}
	params.Set("api_key", key)
	params.Set("limit", "24")
	params.Set("offset", offset)
	params.Set("rating", "pg-13")

	endpoint := giphyBase + "/trending?" + params.Encode()
	if q != "" {
		params.Set("q", q)
		endpoint = giphyBase + "/search?" + params.Encode()
	}

	res, err := gifClient.Get(endpoint)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"results": []GifItem{}, "next": "", "error": "fetch_failed"})
		return
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		c.JSON(http.StatusOK, gin.H{"results": []GifItem{}, "next": "", "error": "giphy_error"})
		return
	}

	var payload struct {
		Data []struct {
			ID     string `json:"id"`
			Title  string `json:"title"`
			Images map[string]struct {
				URL string `json:"url"`
			} `json:"images"`
		} `json:"data"`
		Pagination struct {
			Offset     int `json:"offset"`
			Count      int `json:"count"`
			TotalCount int `json:"total_count"`
		} `json:"pagination"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		c.JSON(http.StatusOK, gin.H{"results": []GifItem{}, "next": "", "error": "fetch_failed"})
		return
	}

	results := make([]GifItem, 0, len(payload.Data))
	for _, r := range payload.Data {
		full := firstNonEmpty(r.Images["downsized"].URL, r.Images["fixed_height"].URL, r.Images["original"].URL)
		preview := firstNonEmpty(r.Images["fixed_width_small"].URL, r.Images["fixed_width_downsampled"].URL, r.Images["fixed_width"].URL, full)
		if full == "" {
			continue
		}
		results = append(results, GifItem{ID: r.ID, URL: full, Preview: firstNonEmpty(preview, full), Description: r.Title})
	}

	nextOffset := payload.Pagination.Offset + payload.Pagination.Count
	next := ""
	if nextOffset < payload.Pagination.TotalCount {
		next = strconv.Itoa(nextOffset)
	}
	c.JSON(http.StatusOK, gin.H{"results": results, "next": next})
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
