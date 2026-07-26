package auth

import (
	"github.com/gin-gonic/gin"
	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/pkg/response"
)

// LoginHandler binds the login request, authenticates and returns tokens.
func (s *Service) LoginHandler(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" {
		response.BadRequest(c, "email and password are required")
		return
	}
	tokens, err := s.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		response.Unauthorized(c, "invalid email or password")
		return
	}
	response.OK(c, tokens)
}
