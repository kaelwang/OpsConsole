package audit

import (
	"context"
	"testing"

	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/store"
	"github.com/opsconsole/backend/internal/platform/tenant"
)

func TestAuditRecordsActorFromContext(t *testing.T) {
	db := store.NewMemDB()
	svc := NewService(NewMemRepository(db))
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
	if len(db.Audit) != 1 {
		t.Fatalf("want 1 audit entry got %d", len(db.Audit))
	}
	e := db.Audit[0]
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
	e2 := db.Audit[1]
	if e2.OK {
		t.Fatal("denied entry must be OK=false")
	}
	if e2.Action != "infrastructure.write" || e2.Resource != "infrastructure" {
		t.Fatalf("denied entry fields mismatch: %+v", e2)
	}
}
