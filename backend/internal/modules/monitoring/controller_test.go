package monitoring

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBuildLabelFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("namespace and node are joined and sorted", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest("GET", "/?namespace=default&node=n1", nil)
		c.Request = req

		got, err := buildLabelFilters(c)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// sorted alphabetically by key: namespace < node
		if got != "namespace:default,node:n1" {
			t.Errorf("got %q, want namespace:default,node:n1", got)
		}
	})

	t.Run("invalid label value is rejected", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest("GET", "/?namespace=bad%20value", nil)
		c.Request = req

		if _, err := buildLabelFilters(c); err == nil {
			t.Error("expected error for invalid namespace value")
		}
	})

	t.Run("empty when no filters provided", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest("GET", "/", nil)
		c.Request = req

		got, err := buildLabelFilters(c)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "" {
			t.Errorf("expected empty, got %q", got)
		}
	})
}
