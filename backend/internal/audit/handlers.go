package audit

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/opsconsole/backend/internal/pkg/query"
	"github.com/opsconsole/backend/internal/pkg/response"
)

// ListHandler returns a paginated list of audit logs for the principal tenant.
func (s *Service) ListHandler(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))
	page, limit = query.NormPage(page, limit)

	list, total, err := s.repo.List(c.Request.Context(), page, limit)
	if err != nil {
		response.Internal(c, "failed to list audit logs")
		return
	}
	response.OK(c, gin.H{"items": list, "page": page, "limit": limit, "total": total})
}
