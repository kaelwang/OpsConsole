package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestEnvelopeOK(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	OK(c, gin.H{"k": "v"})

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 got %d", rec.Code)
	}
	var env Envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if env.Code != CodeOK {
		t.Fatalf("code want %d got %d", CodeOK, env.Code)
	}
	if env.Message != "" {
		t.Fatalf("message want empty got %q", env.Message)
	}
	data, ok := env.Data.(map[string]interface{})
	if !ok || data["k"] != "v" {
		t.Fatalf("data mismatch: %+v", env.Data)
	}
}

func TestEnvelopeForbidden(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	Forbidden(c, "nope")

	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403 got %d", rec.Code)
	}
	var env Envelope
	json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Code != CodeForbidden {
		t.Fatalf("code want %d got %d", CodeForbidden, env.Code)
	}
	if env.Message != "nope" {
		t.Fatalf("message want nope got %q", env.Message)
	}
	if env.Data != nil {
		t.Fatalf("data want nil got %v", env.Data)
	}
}

func TestErrorEnvelopeUnauthorized(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	Unauthorized(c, "bad token")

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d", rec.Code)
	}
	var env Envelope
	json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Code != CodeUnauthorized {
		t.Fatalf("code want %d got %d", CodeUnauthorized, env.Code)
	}
	if env.Data != nil {
		t.Fatalf("data want nil got %v", env.Data)
	}
}
