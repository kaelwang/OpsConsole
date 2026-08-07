// Package vmalert is a thin HTTP client for the vmalert REST API
// (https://docs.victoriametrics.com/vmalert/). It backs the active alert
// listing so alert events shown in the console are real rule evaluations.
package vmalert

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Alert is a single active alert as reported by vmalert /api/v1/alerts.
type Alert struct {
	ID          string            `json:"id"`
	RuleID      string            `json:"rule_id"`
	GroupID     string            `json:"group_id"`
	Name        string            `json:"name"`
	State       string            `json:"state"` // "firing" | "pending"
	Value       string            `json:"value"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	ActiveAt    time.Time         `json:"activeAt"`
	Expression  string            `json:"expression"`
}

type alertsResponse struct {
	Status string `json:"status"`
	Data   struct {
		Alerts []Alert `json:"alerts"`
	} `json:"data"`
}

// Client talks to a vmalert instance.
type Client struct {
	baseURL string
	http    *http.Client
}

// New builds a vmalert client; returns nil when no URL is configured so the
// caller can surface an explicit "not configured" upstream error.
func New(baseURL string) *Client {
	if baseURL == "" {
		return nil
	}
	return &Client{baseURL: baseURL, http: &http.Client{Timeout: 8 * time.Second}}
}

// ListAlerts returns the currently active alerts.
func (c *Client) ListAlerts(ctx context.Context) ([]Alert, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v1/alerts", nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vmalert status %d", resp.StatusCode)
	}
	var out alertsResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return out.Data.Alerts, nil
}

// Reload triggers a rule-file reload via POST /-/reload so vmalert picks up
// newly generated rule files. Requires vmalert to expose the lifecycle endpoint
// (it does by default on its httpListenAddr).
func (c *Client) Reload(ctx context.Context) error {
	if c == nil {
		return fmt.Errorf("vmalert not configured")
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
		return fmt.Errorf("vmalert reload status %d", resp.StatusCode)
	}
	return nil
}
