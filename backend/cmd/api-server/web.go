package main

import (
	"embed"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

// webFS holds the compiled frontend SPA (built by `make frontend`).
// The frontend dist is copied into ./web/dist at build time via the Makefile,
// so the resulting backend binary is fully self-contained (front+back in one).
//
//go:embed web/dist
var webFS embed.FS

// spaHandler serves the embedded SPA with a history-API fallback:
//   - request paths under /api* are left to the JSON API (404 if unknown).
//   - existing static assets (e.g. /assets/xxx.js) are served directly.
//   - everything else falls back to index.html so client-side routing works.
//
// We read bytes from the embedded FS and write them via c.Data to avoid the
// redirect behaviour of http.FileServer on embed.FS paths.
func spaHandler() gin.HandlerFunc {
	indexHTML, _ := webFS.ReadFile("web/dist/index.html")

	return func(c *gin.Context) {
		// Never hijack API routes.
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			c.Status(http.StatusNotFound)
			return
		}

		clean := path.Clean(c.Request.URL.Path)
		if clean == "/" || clean == "" || clean == "." {
			serveIndex(c, indexHTML)
			return
		}

		// Try to serve a real static file first.
		asset, err := webFS.ReadFile("web/dist" + clean)
		if err == nil && len(asset) > 0 {
			ctype := mime.TypeByExtension(path.Ext(clean))
			if ctype == "" {
				ctype = "application/octet-stream"
			}
			c.Data(http.StatusOK, ctype, asset)
			return
		}

		// SPA fallback.
		serveIndex(c, indexHTML)
	}
}

func serveIndex(c *gin.Context, indexHTML []byte) {
	if len(indexHTML) == 0 {
		c.Status(http.StatusNotFound)
		return
	}
	c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
}
