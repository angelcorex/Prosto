// Command edge is a small, stateless Go/Gin service that offloads Prosto's
// heaviest, purely-computational HTTP routes from the Next.js server:
//
//   GET /gif?q=&pos=          → GIF search/trending proxy (Giphy)
//   GET /link-preview?url=    → OpenGraph/Twitter-card metadata fetch (SSRF-safe)
//
// WHY a separate service: these routes do no SSR and touch no database — they
// just fan out to a third party, parse the response and return JSON. Go handles
// that with lower per-request memory + true parallelism (goroutines), freeing
// the single-process Node VPS for the SSR/render work only it can do. The Next
// routes forward here when EDGE_SERVICE_URL is set, and fall back to their
// in-process implementation otherwise — so this is purely additive.
//
// It is intentionally UNAUTHENTICATED at the app layer (it never reads the DB
// or user data); the Next side keeps the auth-gate + per-IP rate limit in front
// of it, and this service is only reachable on the private network / behind the
// same reverse proxy. It re-applies the SSRF guard itself as defence in depth.
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	if os.Getenv("EDGE_ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())

	// Liveness probe for the reverse proxy / process manager.
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	r.GET("/gif", handleGif)
	r.GET("/link-preview", handleLinkPreview)

	addr := os.Getenv("EDGE_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8090"
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("[edge] listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[edge] server error: %v", err)
	}
}
