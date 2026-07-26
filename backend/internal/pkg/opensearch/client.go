package opensearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client proxies search requests to an OpenSearch instance.
type Client struct {
	baseURL string
	http    *http.Client
}

// New builds an OpenSearch client. An empty baseURL disables the client (returns nil).
func New(baseURL string) *Client {
	if baseURL == "" {
		return nil
	}
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

// Search runs an OpenSearch _search against the given index.
func (c *Client) Search(ctx context.Context, index string, body map[string]interface{}) (json.RawMessage, error) {
	u := fmt.Sprintf("%s/%s/_search", c.baseURL, index)
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rb, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("opensearch status %d: %s", resp.StatusCode, string(rb))
	}
	return rb, nil
}
