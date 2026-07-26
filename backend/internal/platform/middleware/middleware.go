package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/pkg/response"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

type jwtClaims struct {
	UserID   string `json:"uid"`
	TenantID string `json:"tid"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// JWTAuth validates the bearer access token and populates the tenant principal.
func JWTAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if len(auth) < 8 || auth[:7] != "Bearer " {
			response.Unauthorized(c, "missing or malformed authorization header")
			c.Abort()
			return
		}
		claims := &jwtClaims{}
		token, err := jwt.ParseWithClaims(auth[7:], claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			response.Unauthorized(c, "invalid token")
			c.Abort()
			return
		}
		p := tenant.Principal{
			UserID:   claims.UserID,
			TenantID: claims.TenantID,
			Role:     model.Role(claims.Role),
		}
		c.Request = c.Request.WithContext(tenant.WithPrincipal(c.Request.Context(), p))
		c.Next()
	}
}

// Recovery is a thin wrapper around gin.Recovery to keep middleware imports stable.
func Recovery() gin.HandlerFunc {
	return gin.Recovery()
}

type window struct {
	count   int
	resetAt time.Time
}

type rateLimiter struct {
	mu       sync.Mutex
	windows  map[string]*window
	limit    int
	interval time.Duration
}

// NewRateLimit returns a fixed-window per-IP rate limiter.
func NewRateLimit(limit int, interval time.Duration) *rateLimiter {
	l := &rateLimiter{
		windows:  make(map[string]*window),
		limit:    limit,
		interval: interval,
	}
	go l.sweep()
	return l
}

func (l *rateLimiter) sweep() {
	ticker := time.NewTicker(l.interval)
	for range ticker.C {
		l.mu.Lock()
		now := time.Now()
		for ip, w := range l.windows {
			if now.After(w.resetAt) {
				delete(l.windows, ip)
			}
		}
		l.mu.Unlock()
	}
}

// Middleware enforces the per-IP request cap.
func (l *rateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		l.mu.Lock()
		now := time.Now()
		w, ok := l.windows[ip]
		if !ok || now.After(w.resetAt) {
			w = &window{count: 0, resetAt: now.Add(l.interval)}
			l.windows[ip] = w
		}
		w.count++
		allowed := w.count <= l.limit
		l.mu.Unlock()
		if !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, response.Envelope{
				Code:    response.CodeUpstream,
				Message: "rate limit exceeded",
			})
			return
		}
		c.Next()
	}
}
