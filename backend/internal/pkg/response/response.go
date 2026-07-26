package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const (
	CodeOK           = 0
	CodeBadRequest   = 40000
	CodeUnauthorized = 40100
	CodeForbidden    = 40300
	CodeNotFound     = 40400
	CodeTimeout      = 40800
	CodeConflict     = 40900
	CodeUpstream     = 50200
	CodeInternal     = 50000
)

// Envelope is the unified API response wrapper.
type Envelope struct {
	Code    int         `json:"code"`
	Data    interface{} `json:"data"`
	Message string      `json:"message"`
}

// OK writes a 200 response.
func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Envelope{Code: CodeOK, Data: data})
}

// Created writes a 201 response.
func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, Envelope{Code: CodeOK, Data: data})
}

// Accepted writes a 202 response.
func Accepted(c *gin.Context, data interface{}) {
	c.JSON(http.StatusAccepted, Envelope{Code: CodeOK, Data: data})
}

// Error writes a raw envelope with the given HTTP status and business code.
func Error(c *gin.Context, httpStatus, code int, message string) {
	c.JSON(httpStatus, Envelope{Code: code, Data: nil, Message: message})
}

func BadRequest(c *gin.Context, message string) {
	if message == "" {
		message = "bad request"
	}
	Error(c, http.StatusBadRequest, CodeBadRequest, message)
}

func Unauthorized(c *gin.Context, message string) {
	if message == "" {
		message = "unauthorized"
	}
	Error(c, http.StatusUnauthorized, CodeUnauthorized, message)
}

func Forbidden(c *gin.Context, message string) {
	if message == "" {
		message = "forbidden"
	}
	Error(c, http.StatusForbidden, CodeForbidden, message)
}

func NotFound(c *gin.Context, message string) {
	if message == "" {
		message = "not found"
	}
	Error(c, http.StatusNotFound, CodeNotFound, message)
}

func Conflict(c *gin.Context, message string) {
	if message == "" {
		message = "conflict"
	}
	Error(c, http.StatusConflict, CodeConflict, message)
}

func Timeout(c *gin.Context, message string) {
	if message == "" {
		message = "upstream timeout"
	}
	Error(c, http.StatusRequestTimeout, CodeTimeout, message)
}

func Upstream(c *gin.Context, message string) {
	if message == "" {
		message = "upstream service unavailable"
	}
	Error(c, http.StatusBadGateway, CodeUpstream, message)
}

func Internal(c *gin.Context, message string) {
	if message == "" {
		message = "internal server error"
	}
	Error(c, http.StatusInternalServerError, CodeInternal, message)
}
