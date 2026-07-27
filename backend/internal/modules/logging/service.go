package logging

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/opsconsole/backend/internal/audit"
	"github.com/opsconsole/backend/internal/model"
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

// Search builds an OpenSearch DSL query and returns normalized log entries.
func (s *Service) Search(ctx context.Context, tenantID, query, level, service, from, to string, page, limit int) ([]model.LogEntry, error) {
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
	raw, err := s.os.Search(ctx, index, body)
	if err != nil {
		return nil, err
	}
	return mapHits(raw)
}

// mapHits extracts _source documents from an OpenSearch _search response and
// normalizes them into LogEntry values consumable by the frontend.
func mapHits(raw json.RawMessage) ([]model.LogEntry, error) {
	var resp struct {
		Hits struct {
			Hits []struct {
				Source map[string]interface{} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	out := make([]model.LogEntry, 0, len(resp.Hits.Hits))
	for _, h := range resp.Hits.Hits {
		out = append(out, model.LogEntry{
			Timestamp: firstString(h.Source["@timestamp"], h.Source["timestamp"]),
			Level:     strings.ToLower(firstString(h.Source["level"])),
			Service:   firstString(h.Source["service"]),
			Message:   firstString(h.Source["message"]),
		})
	}
	return out, nil
}

// firstString returns the first argument that is a string, else empty.
func firstString(vals ...interface{}) string {
	for _, v := range vals {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
