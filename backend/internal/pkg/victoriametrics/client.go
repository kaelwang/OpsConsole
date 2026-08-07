package victoriametrics

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Client proxies PromQL queries to a VictoriaMetrics instance.
type Client struct {
	baseURL string
	http    *http.Client
}

// New builds a VictoriaMetrics client. An empty baseURL disables the client (returns nil).
func New(baseURL string) *Client {
	if baseURL == "" {
		return nil
	}
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// Query runs an instant PromQL query. filters is an optional comma-separated list
// of "label:value" pairs (e.g. "node:n1,namespace:default"); it is embedded
// directly into the PromQL expression as label matchers so that it works
// regardless of VictoriaMetrics' (sometimes ineffective) label_filters param.
func (c *Client) Query(ctx context.Context, expr string, filters string) (json.RawMessage, error) {
	v := url.Values{"query": {applyFilters(expr, filters)}}
	return c.get(ctx, "/api/v1/query", v)
}

// QueryRange runs a range PromQL query over [start, end] with the given step.
// start/end are forwarded as-is (unix seconds or RFC3339) to VictoriaMetrics.
// filters is embedded into the expression (see Query).
func (c *Client) QueryRange(ctx context.Context, expr, step, start, end string, filters string) (json.RawMessage, error) {
	v := url.Values{"query": {applyFilters(expr, filters)}}
	if step != "" {
		v.Set("step", step)
	}
	if start != "" {
		v.Set("start", start)
	}
	if end != "" {
		v.Set("end", end)
	}
	return c.get(ctx, "/api/v1/query_range", v)
}

func (c *Client) get(ctx context.Context, path string, q url.Values) (json.RawMessage, error) {
	u := c.baseURL + path + "?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("victoriametrics status %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// reservedMatchers lists PromQL keywords/labels that must NOT be treated as the
// metric to receive the injected label matchers. Without this, tokens such as
// `by`, `rate` or the label name inside `by (pod)` would be mistaken for a metric.
var reservedMatchers = map[string]bool{
	// functions / keywords
	"sum": true, "avg": true, "min": true, "max": true, "count": true, "count_values": true,
	"rate": true, "irate": true, "increase": true, "delta": true, "idelta": true,
	"by": true, "without": true, "on": true, "group_left": true, "group_right": true,
	"topk": true, "bottomk": true, "histogram_quantile": true, "clamp_max": true, "clamp_min": true,
	"stddev": true, "stdvar": true, "abs": true, "ceil": true, "floor": true,
	"vector": true, "scalar": true, "time": true, "absent": true, "label_replace": true, "label_join": true,
	"round": true, "sqrt": true, "exp": true, "ln": true, "log": true, "log2": true, "log10": true,
	"deriv": true, "predict_linear": true, "changes": true, "resets": true, "sort": true, "sort_desc": true,
	"and": true, "or": true, "unless": true, "bool": true,
	// common label names (so `by (pod)` etc. are skipped)
	"pod": true, "namespace": true, "node": true, "instance": true, "cluster": true,
	"job": true, "le": true, "quantile": true, "container": true, "created_by": true,
	"severity": true, "channel": true, "method": true, "code": true, "status": true,
	"service": true, "reason": true, "mode": true, "exported_instance": true, "exported_node": true,
}

// metricRe matches a metric selector: a metric name, optionally already followed
// by a {...} label-matcher clause.
var metricRe = regexp.MustCompile(`([A-Za-z_:][\w:]*)((?:\{\s*[^\}]*\})?)`)

// applyFilters embeds the "label:value" filters into the first metric selector
// found in expr as proper PromQL label matchers. Series that already carry the
// label are left untouched (dedup), so re-applying is safe. If expr contains no
// usable metric selector, the original expr is returned unchanged.
func applyFilters(expr, filters string) string {
	filters = strings.TrimSpace(filters)
	if filters == "" {
		return expr
	}
	var mats []string
	for _, p := range strings.Split(filters, ",") {
		kv := strings.SplitN(p, ":", 2)
		if len(kv) != 2 {
			continue
		}
		k, v := strings.TrimSpace(kv[0]), strings.TrimSpace(kv[1])
		if k == "" || v == "" {
			continue
		}
		mats = append(mats, fmt.Sprintf(`%s=%q`, k, v))
	}
	if len(mats) == 0 {
		return expr
	}

	for _, m := range metricRe.FindAllStringSubmatchIndex(expr, -1) {
		name := expr[m[2]:m[3]]
		if reservedMatchers[name] {
			continue
		}
		// Group 2 (index 4,5) is the existing {...} clause, if present.
		// (An optional group that matched empty has equal indices, not -1, so
		// require a genuine, non-empty brace span.)
		if m[4] != -1 && m[5] > m[4] {
			inner := expr[m[4]+1 : m[5]-1] // content between { and }
			merged := "{" + mergeMatchers(inner, mats) + "}"
			return expr[:m[4]] + merged + expr[m[5]:]
		}
		// No braces: insert the matcher right after the metric name.
		return expr[:m[3]] + "{" + strings.Join(mats, ",") + "}" + expr[m[3]:]
	}
	return expr
}

// mergeMatchers concatenates existing inner matchers with the new ones, skipping
// any new matcher whose label already exists in inner (keeps the original value).
func mergeMatchers(inner string, mats []string) string {
	parts := []string{}
	if strings.TrimSpace(inner) != "" {
		parts = append(parts, strings.TrimSpace(inner))
	}
	for _, mt := range mats {
		label := mt[:strings.Index(mt, "=")]
		if strings.Contains(inner, label+"=") {
			continue // already present, keep existing
		}
		parts = append(parts, mt)
	}
	return strings.Join(parts, ",")
}
