package k8sclient

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
)

func TestListPodsEnrichment(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("4"),
				corev1.ResourceMemory: resource.MustParse("8Gi"),
			},
		},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default"},
		Spec:       corev1.PodSpec{NodeName: "node-1", Containers: []corev1.Container{{Name: "c1"}, {Name: "c2"}}},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{Name: "c1", RestartCount: 1},
				{Name: "c2", RestartCount: 1},
			},
		},
	}
	pm := &metricsv1beta1.PodMetrics{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default"},
		Containers: []metricsv1beta1.ContainerMetrics{
			{Name: "c1", Usage: corev1.ResourceList{corev1.ResourceCPU: resource.MustParse("1"), corev1.ResourceMemory: resource.MustParse("1Gi")}},
			{Name: "c2", Usage: corev1.ResourceList{corev1.ResourceCPU: resource.MustParse("1"), corev1.ResourceMemory: resource.MustParse("1Gi")}},
		},
	}

	c := &Client{
		clientset: k8sfake.NewSimpleClientset(node, pod),
		listPodMetrics: func(ctx context.Context, ns string) ([]metricsv1beta1.PodMetrics, error) {
			return []metricsv1beta1.PodMetrics{*pm}, nil
		},
	}

	pods, err := c.ListPods(context.Background(), "default")
	if err != nil {
		t.Fatalf("ListPods error: %v", err)
	}
	if len(pods) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(pods))
	}
	p := pods[0]
	if p.Restarts != 2 {
		t.Errorf("restarts: want 2, got %d", p.Restarts)
	}
	// cpu = (1+1)/4 cores = 50%
	if p.Cpu == nil || *p.Cpu != 50 {
		t.Errorf("cpu pct: want 50, got %v", p.Cpu)
	}
	// mem = (1Gi+1Gi)/8Gi = 25%
	if p.Memory == nil || *p.Memory != 25 {
		t.Errorf("mem pct: want 25, got %v", p.Memory)
	}
}

func TestListPodsNoMetricsServer(t *testing.T) {
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default"},
		Spec:       corev1.PodSpec{NodeName: "node-1", Containers: []corev1.Container{{Name: "c1"}}},
		Status: corev1.PodStatus{
			Phase:             corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{{Name: "c1", RestartCount: 3}},
		},
	}
	// listPodMetrics is nil => metrics-server unavailable; cpu/mem must be nil
	// but restarts must still be populated from the pod status.
	c := &Client{clientset: k8sfake.NewSimpleClientset(pod)}

	pods, err := c.ListPods(context.Background(), "default")
	if err != nil {
		t.Fatalf("ListPods error: %v", err)
	}
	if len(pods) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(pods))
	}
	p := pods[0]
	if p.Restarts != 3 {
		t.Errorf("restarts: want 3, got %d", p.Restarts)
	}
	if p.Cpu != nil || p.Memory != nil {
		t.Errorf("cpu/mem must be nil without metrics server: cpu=%v mem=%v", p.Cpu, p.Memory)
	}
}

func TestNewClientFromKubeconfigContent(t *testing.T) {
	mk := func(server string) string {
		return `apiVersion: v1
kind: Config
clusters:
- name: c
  cluster:
    server: ` + server + `
    insecure-skip-tls-verify: true
contexts:
- name: ctx
  context:
    cluster: c
    user: u
current-context: ctx
users:
- name: u
  user:
    token: dummy
`
	}
	c1, err := NewClientFromKubeconfigContent(mk("https://10.0.0.1:6443"))
	if err != nil {
		t.Fatalf("cluster1 client: %v", err)
	}
	c2, err := NewClientFromKubeconfigContent(mk("https://10.0.0.2:6443"))
	if err != nil {
		t.Fatalf("cluster2 client: %v", err)
	}
	if got := c1.RestConfigHost(); got != "https://10.0.0.1:6443" {
		t.Errorf("c1 host: want https://10.0.0.1:6443, got %q", got)
	}
	if got := c2.RestConfigHost(); got != "https://10.0.0.2:6443" {
		t.Errorf("c2 host: want https://10.0.0.2:6443, got %q", got)
	}
	// Distinct inline kubeconfigs must resolve to distinct API servers.
	if c1.RestConfigHost() == c2.RestConfigHost() {
		t.Errorf("expected distinct hosts for distinct kubeconfigs")
	}
}

func TestListNodes(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1", CreationTimestamp: metav1.NewTime(time.Now().Add(-48 * time.Hour))},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("4"),
				corev1.ResourceMemory: resource.MustParse("8Gi"),
				corev1.ResourcePods:   resource.MustParse("10"),
			},
			Conditions: []corev1.NodeCondition{
				{Type: corev1.NodeReady, Status: corev1.ConditionTrue},
				{Type: corev1.NodeMemoryPressure, Status: corev1.ConditionTrue},
			},
		},
	}
	nm := &metricsv1beta1.NodeMetrics{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
		Usage: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("2"),
			corev1.ResourceMemory: resource.MustParse("4Gi"),
		},
	}
	c := &Client{
		clientset: k8sfake.NewSimpleClientset(node),
		listNodeMetrics: func(ctx context.Context) ([]metricsv1beta1.NodeMetrics, error) {
			return []metricsv1beta1.NodeMetrics{*nm}, nil
		},
	}

	nodes, err := c.ListNodes(context.Background())
	if err != nil {
		t.Fatalf("ListNodes error: %v", err)
	}
	if len(nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(nodes))
	}
	n := nodes[0]
	if n.Status != "Ready" {
		t.Errorf("status: want Ready, got %q", n.Status)
	}
	// cpu = 2/4 = 50%, mem = 4/8 = 50%
	if n.CPUPercent == nil || *n.CPUPercent != 50 {
		t.Errorf("cpu pct: want 50, got %v", n.CPUPercent)
	}
	if n.MemoryPercent == nil || *n.MemoryPercent != 50 {
		t.Errorf("mem pct: want 50, got %v", n.MemoryPercent)
	}
	if !n.MemPressure {
		t.Errorf("expected MemPressure true")
	}
	if n.DiskPressure || n.PIDPressure {
		t.Errorf("did not expect disk/pid pressure")
	}
	if n.CPUUsed != "2.00" || n.CPUTotal != "4.00" {
		t.Errorf("cpu strings: used=%q total=%q", n.CPUUsed, n.CPUTotal)
	}
	if n.MemUsed != "4.0Gi" || n.MemTotal != "8.0Gi" {
		t.Errorf("mem strings: used=%q total=%q", n.MemUsed, n.MemTotal)
	}
	if n.PodCapacity != 10 {
		t.Errorf("pod capacity: want 10, got %d", n.PodCapacity)
	}
}
