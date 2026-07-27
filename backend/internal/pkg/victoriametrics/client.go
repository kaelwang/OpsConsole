package victoriametrics

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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

// Query runs an instant PromQL query.
func (c *Client) Query(ctx context.Context, expr string) (json.RawMessage, error) {
	return c.get(ctx, "/api/v1/query", url.Values{"query": {expr}})
}

// QueryRange runs a range PromQL query over [start, end] with the given step.
// start/end are forwarded as-is (unix seconds or RFC3339) to VictoriaMetrics.
func (c *Client) QueryRange(ctx context.Context, expr, step, start, end string) (json.RawMessage, error) {
	v := url.Values{"query": {expr}}
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
