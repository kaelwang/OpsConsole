package logging

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/pkg/opensearch"
)

// ErrUpstreamUnavailable indicates the log backend is not configured.
var ErrUpstreamUnavailable = errors.New("upstream log service unavailable")

// Service implements log search business logic.
type Service struct {
	os    *opensearch.Client
	audit audit.Sink
}

// NewService builds a logging service.
func NewService(os *opensearch.Client, audit audit.Sink) *Service {
	return &Service{os: os, audit: audit}
}

// Search builds an OpenSearch DSL query and executes it against the tenant index.
func (s *Service) Search(ctx context.Context, tenantID, query, level, service, from, to string, page, limit int) (json.RawMessage, error) {
	if s.os == nil {
		return nil, ErrUpstreamUnavailable
	}
	index := "logs-" + tenantID
	must := make([]map[string]interface{}, 0)
	if query != "" {
		must = append(must, map[string]interface{}{
			"query_string": map[string]interface{}{"query": query},
		})
	}
	if level != "" {
		must = append(must, map[string]interface{}{
			"term": map[string]interface{}{"level": level},
		})
	}
	if service != "" {
		must = append(must, map[string]interface{}{
			"term": map[string]interface{}{"service": service},
		})
	}
	rangeQ := map[string]interface{}{}
	if from != "" {
		rangeQ["gte"] = from
	}
	if to != "" {
		rangeQ["lte"] = to
	}
	if len(rangeQ) > 0 {
		must = append(must, map[string]interface{}{
			"range": map[string]interface{}{"@timestamp": rangeQ},
		})
	}
	body := map[string]interface{}{
		"from": (page - 1) * limit,
		"size": limit,
		"query": map[string]interface{}{
			"bool": map[string]interface{}{"must": must},
		},
		"sort": []map[string]interface{}{
			{"@timestamp": map[string]interface{}{"order": "desc"}},
		},
	}
	return s.os.Search(ctx, index, body)
}
