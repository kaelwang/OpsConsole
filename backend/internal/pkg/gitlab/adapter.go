package gitlab

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Pipeline is a CI/CD pipeline summary.
type Pipeline struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Ref       string `json:"ref"`
	Status    string `json:"status"`
	WebURL    string `json:"web_url"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

// CICDProvider abstracts a CI/CD backend.
type CICDProvider interface {
	ListPipelines(ctx context.Context, projectID string) ([]Pipeline, error)
	Trigger(ctx context.Context, projectID, ref string) (*Pipeline, error)
}

// GitLabAdapter talks to the GitLab REST v4 API.
type GitLabAdapter struct {
	baseURL string
	token   string
	http    *http.Client
}

// NewGitLabAdapter builds a GitLab REST client.
func NewGitLabAdapter(baseURL, token string) *GitLabAdapter {
	return &GitLabAdapter{baseURL: baseURL, token: token, http: &http.Client{Timeout: 15 * time.Second}}
}

func (g *GitLabAdapter) ListPipelines(ctx context.Context, projectID string) ([]Pipeline, error) {
	u := fmt.Sprintf("%s/api/v4/projects/%s/pipelines", g.baseURL, projectID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", g.token)
	resp, err := g.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gitlab status %d", resp.StatusCode)
	}
	var out []Pipeline
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (g *GitLabAdapter) Trigger(ctx context.Context, projectID, ref string) (*Pipeline, error) {
	u := fmt.Sprintf("%s/api/v4/projects/%s/pipeline?ref=%s", g.baseURL, projectID, ref)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("PRIVATE-TOKEN", g.token)
	resp, err := g.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("gitlab trigger status %d", resp.StatusCode)
	}
	var p Pipeline
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, err
	}
	return &p, nil
}
