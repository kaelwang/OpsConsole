// Package alertmanager is a thin HTTP client for the Alertmanager API.
// It backs dynamic configuration: the backend writes a generated
// alertmanager.yml to a shared volume and calls Reload so Alertmanager picks
// up the new routing without a container restart.
package alertmanager

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client talks to an Alertmanager instance.
type Client struct {
	baseURL string
	http    *http.Client
}

// New builds an Alertmanager client; returns nil when no URL is configured so
// the caller can treat alerting-notification as an optional capability.
func New(baseURL string) *Client {
	if baseURL == "" {
		return nil
	}
	return &Client{baseURL: baseURL, http: &http.Client{Timeout: 8 * time.Second}}
}

// Status performs a liveness probe against /api/v2/status. (Alertmanager v0.27
// removed the v1 status endpoint; v2 is the supported one.)
func (c *Client) Status(ctx context.Context) error {
	if c == nil {
		return fmt.Errorf("alertmanager not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v2/status", nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("alertmanager status %d", resp.StatusCode)
	}
	return nil
}

// Reload triggers a configuration reload via POST /-/reload. This requires
// Alertmanager to be started with --web.enable-lifecycle.
func (c *Client) Reload(ctx context.Context) error {
	if c == nil {
		return fmt.Errorf("alertmanager not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/-/reload", nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("alertmanager reload status %d", resp.StatusCode)
	}
	return nil
}
