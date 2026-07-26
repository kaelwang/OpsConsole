package infrastructure

import (
	"context"
	"testing"

	"github.com/opsconsole/backend/internal/model"
	"github.com/opsconsole/backend/internal/platform/store"
)

func TestClusterRepoTenantIsolation(t *testing.T) {
	db := store.NewMemDB()
	// seed already has c-0001 under SeedTenantID; add a foreign-tenant cluster
	db.Clusters["c-9999"] = model.Cluster{ID: "c-9999", TenantID: "t-other", Name: "evil", Provider: "eks"}
	repo := NewMemClusterRepository(db)
	ctx := context.Background()

	// owning tenant sees exactly its own cluster
	listA, err := repo.List(ctx, store.SeedTenantID)
	if err != nil {
		t.Fatal(err)
	}
	if len(listA) != 1 || listA[0].ID != "c-0001" {
		t.Fatalf("tenant A want exactly 1 cluster (c-0001) got %d", len(listA))
	}

	// the other tenant sees its own only
	listO, err := repo.List(ctx, "t-other")
	if err != nil {
		t.Fatal(err)
	}
	if len(listO) != 1 || listO[0].ID != "c-9999" {
		t.Fatalf("t-other want exactly 1 cluster (c-9999) got %d", len(listO))
	}

	// a tenant that owns nothing gets an empty result (cross-tenant isolation)
	empty, _ := repo.List(ctx, "t-none")
	if len(empty) != 0 {
		t.Fatalf("t-none want 0 clusters got %d", len(empty))
	}

	// cross-tenant Get must be NotFound (no leakage)
	if _, err := repo.Get(ctx, "t-other", "c-0001"); err != ErrNotFound {
		t.Fatalf("cross-tenant Get want ErrNotFound got %v", err)
	}
	// own-tenant Get succeeds
	if c, err := repo.Get(ctx, store.SeedTenantID, "c-0001"); err != nil || c.ID != "c-0001" {
		t.Fatalf("own-tenant Get failed: %v", err)
	}
}
