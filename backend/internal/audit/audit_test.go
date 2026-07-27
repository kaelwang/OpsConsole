package audit

import (
	"context"
	"testing"

	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

// stubRepo captures written audit entries (test-only stub, not a runtime mode).
type stubRepo struct {
	entries []model.AuditLog
}

func (r *stubRepo) Write(_ context.Context, entry model.AuditLog) error {
	r.entries = append(r.entries, entry)
	return nil
}

func (r *stubRepo) List(_ context.Context, _, _ int) ([]model.AuditLog, int, error) {
	return r.entries, len(r.entries), nil
}

func TestAuditRecordsActorFromContext(t *testing.T) {
	repo := &stubRepo{}
	svc := NewService(repo)
	ctx := tenant.WithPrincipal(context.Background(), tenant.Principal{
		UserID: "u-actor", TenantID: "t-act", Role: model.RoleOwner,
	})

	// entry without explicit actor -> actor filled from principal
	if err := svc.Record(ctx, model.AuditLog{
		Action:   "cluster.create",
		Resource: "infrastructure",
		Detail:   "created prod-cluster",
	}); err != nil {
		t.Fatal(err)
	}
	if len(repo.entries) != 1 {
		t.Fatalf("want 1 audit entry got %d", len(repo.entries))
	}
	e := repo.entries[0]
	if e.UserID != "u-actor" || e.TenantID != "t-act" {
		t.Fatalf("actor not recorded from context: %+v", e)
	}
	if !e.OK {
		t.Fatal("recorded entry must be OK=true")
	}
	if e.ID == "" {
		t.Fatal("ID must be auto-generated")
	}

	// explicit denied entry records OK=false
	if err := svc.Denied(ctx, "t-act", "u-actor", "infrastructure.write", "infrastructure", "missing permission"); err != nil {
		t.Fatal(err)
	}
	e2 := repo.entries[1]
	if e2.OK {
		t.Fatal("denied entry must be OK=false")
	}
	if e2.Action != "infrastructure.write" || e2.Resource != "infrastructure" {
		t.Fatalf("denied entry fields mismatch: %+v", e2)
	}
}
