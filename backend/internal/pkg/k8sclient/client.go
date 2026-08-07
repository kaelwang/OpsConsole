package k8sclient

import (
	"context"
	"fmt"
	"io"
	"strconv"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
	metricsclientset "k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/opsconsole/backend/internal/model"
)

// Config configures a Kubernetes client.
type Config struct {
	KubeconfigPath   string
	ServiceAccount   string
	ImpersonateGroup string
}

// Client wraps client-go for pod listing and exec.
type Client struct {
	clientset kubernetes.Interface
	// listPodMetrics lists pod resource usage. It is nil when the metrics server
	// is unreachable, in which case CPU/memory stay unset. Exposed as a func so
	// it can be faked in tests without a real metrics client.
	listPodMetrics func(ctx context.Context, namespace string) ([]metricsv1beta1.PodMetrics, error)
	// listNodeMetrics lists node resource usage. Nil when metrics-server is
	// unreachable; node CPU/memory percentages then stay unset.
	listNodeMetrics func(ctx context.Context) ([]metricsv1beta1.NodeMetrics, error)
	restConfig      *rest.Config
}

// NewClient builds a client-go client, optionally impersonating a service account.
func NewClient(cfg Config) (*Client, error) {
	rc, err := clientcmd.BuildConfigFromFlags("", cfg.KubeconfigPath)
	if err != nil {
		return nil, fmt.Errorf("build kubeconfig: %w", err)
	}
	if cfg.ServiceAccount != "" {
		rc.Impersonate = rest.ImpersonationConfig{UserName: cfg.ServiceAccount}
	}
	return NewClientFromRestConfig(rc)
}

// NewClientFromRestConfig builds a client from an already-resolved rest.Config.
func NewClientFromRestConfig(rc *rest.Config) (*Client, error) {
	cs, err := kubernetes.NewForConfig(rc)
	if err != nil {
		return nil, fmt.Errorf("new clientset: %w", err)
	}
	// metrics client is best-effort: if it fails (e.g. metrics-server not
	// installed), pod/node CPU/memory stay nil but listing still works.
	var listPM func(ctx context.Context, ns string) ([]metricsv1beta1.PodMetrics, error)
	var listNM func(ctx context.Context) ([]metricsv1beta1.NodeMetrics, error)
	if mc, err := metricsclientset.NewForConfig(rc); err == nil {
		listPM = func(ctx context.Context, ns string) ([]metricsv1beta1.PodMetrics, error) {
			ml, e := mc.MetricsV1beta1().PodMetricses(ns).List(ctx, metav1.ListOptions{})
			if e != nil {
				return nil, e
			}
			return ml.Items, e
		}
		listNM = func(ctx context.Context) ([]metricsv1beta1.NodeMetrics, error) {
			ml, e := mc.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
			if e != nil {
				return nil, e
			}
			return ml.Items, e
		}
	}
	return &Client{clientset: cs, listPodMetrics: listPM, listNodeMetrics: listNM, restConfig: rc}, nil
}

// NewClientFromKubeconfigContent builds a client from inline kubeconfig YAML.
// It lets a per-cluster kubeconfig override the global one.
func NewClientFromKubeconfigContent(content string) (*Client, error) {
	cfg, err := clientcmd.Load([]byte(content))
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}
	rc, err := clientcmd.NewDefaultClientConfig(*cfg, &clientcmd.ConfigOverrides{}).ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest config: %w", err)
	}
	return NewClientFromRestConfig(rc)
}

// RestConfigHost returns the API server host this client targets, or "" if unset.
// Useful for verifying a per-cluster kubeconfig resolved to the expected cluster.
func (c *Client) RestConfigHost() string {
	if c.restConfig == nil {
		return ""
	}
	return c.restConfig.Host
}

// nodeRes holds a node's allocatable capacity in base units (cores / bytes).
type nodeRes struct {
	cpuCores float64
	memBytes float64
}

// ListPods returns pods in the given namespace (or all namespaces if empty).
// Each pod is enriched with container restart counts and, when the metrics
// server is reachable, the pod's CPU/memory usage as a percentage of the
// hosting node's allocatable capacity.
func (c *Client) ListPods(ctx context.Context, namespace string) ([]model.Pod, error) {
	ns := namespace
	if ns == "" {
		ns = metav1.NamespaceAll
	}
	list, err := c.clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Pod metrics keyed by "namespace/name".
	metricsByPod := map[string]metricsv1beta1.PodMetrics{}
	if c.listPodMetrics != nil {
		if ml, err := c.listPodMetrics(ctx, ns); err == nil {
			for _, m := range ml {
				metricsByPod[m.Namespace+"/"+m.Name] = m
			}
		}
	}
	// Node allocatable keyed by node name (for percentage denominator).
	nodeAlloc := c.nodeAllocatable(ctx)

	out := make([]model.Pod, 0, len(list.Items))
	for _, p := range list.Items {
		pod := model.Pod{
			Name:      p.Name,
			Namespace: p.Namespace,
			Node:      p.Spec.NodeName,
			Status:    string(p.Status.Phase),
			Age:       age(p.CreationTimestamp.Time),
		}
		var restarts int32
		for _, cs := range p.Status.ContainerStatuses {
			restarts += cs.RestartCount
		}
		pod.Restarts = restarts

		if m, ok := metricsByPod[p.Namespace+"/"+p.Name]; ok {
			if alloc, ok := nodeAlloc[p.Spec.NodeName]; ok && alloc.cpuCores > 0 && alloc.memBytes > 0 {
				var cpuCores, memBytes float64
				for _, c := range m.Containers {
					if v, ok := c.Usage[corev1.ResourceCPU]; ok {
						cpuCores += v.AsApproximateFloat64()
					}
					if v, ok := c.Usage[corev1.ResourceMemory]; ok {
						memBytes += v.AsApproximateFloat64()
					}
				}
				cpuPct := cpuCores / alloc.cpuCores * 100
				memPct := memBytes / alloc.memBytes * 100
				pod.Cpu = &cpuPct
				pod.Memory = &memPct
			}
		}
		out = append(out, pod)
	}
	return out, nil
}

// nodeAllocatable returns each node's allocatable CPU (cores) and memory (bytes).
func (c *Client) nodeAllocatable(ctx context.Context) map[string]nodeRes {
	nodes, err := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil
	}
	out := make(map[string]nodeRes, len(nodes.Items))
	for _, n := range nodes.Items {
		out[n.Name] = nodeRes{
			cpuCores: n.Status.Allocatable.Cpu().AsApproximateFloat64(),
			memBytes: n.Status.Allocatable.Memory().AsApproximateFloat64(),
		}
	}
	return out
}

// ListNodes returns the cluster's nodes with resource pressure information:
// CPU/memory usage as a percentage of Allocatable, the three pressure
// conditions, and pod capacity utilization.
func (c *Client) ListNodes(ctx context.Context) ([]model.Node, error) {
	nodes, err := c.clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	nodeMetrics := map[string]metricsv1beta1.NodeMetrics{}
	if c.listNodeMetrics != nil {
		if ml, e := c.listNodeMetrics(ctx); e == nil {
			for _, m := range ml {
				nodeMetrics[m.Name] = m
			}
		}
	}
	pods, _ := c.clientset.CoreV1().Pods(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})

	out := make([]model.Node, 0, len(nodes.Items))
	for _, n := range nodes.Items {
		nd := model.Node{
			Name:        n.Name,
			Status:      nodeReady(n),
			Age:         age(n.CreationTimestamp.Time),
			PodCapacity: int(n.Status.Allocatable.Pods().Value()),
		}
		for _, cond := range n.Status.Conditions {
			switch cond.Type {
			case corev1.NodeDiskPressure:
				nd.DiskPressure = cond.Status == corev1.ConditionTrue
			case corev1.NodeMemoryPressure:
				nd.MemPressure = cond.Status == corev1.ConditionTrue
			case corev1.NodePIDPressure:
				nd.PIDPressure = cond.Status == corev1.ConditionTrue
			}
		}
		if m, ok := nodeMetrics[n.Name]; ok {
			cpuTotal := n.Status.Allocatable.Cpu().AsApproximateFloat64()
			memTotal := n.Status.Allocatable.Memory().AsApproximateFloat64()
			cpuUsed := m.Usage.Cpu().AsApproximateFloat64()
			memUsed := m.Usage.Memory().AsApproximateFloat64()
			if cpuTotal > 0 {
				pct := cpuUsed / cpuTotal * 100
				nd.CPUPercent = &pct
			}
			if memTotal > 0 {
				pct := memUsed / memTotal * 100
				nd.MemoryPercent = &pct
			}
			nd.CPUUsed = fmtCores(cpuUsed)
			nd.CPUTotal = fmtCores(cpuTotal)
			nd.MemUsed = fmtGiB(memUsed)
			nd.MemTotal = fmtGiB(memTotal)
		}
		for _, p := range pods.Items {
			if p.Spec.NodeName == n.Name {
				nd.PodCount++
			}
		}
		out = append(out, nd)
	}
	return out, nil
}

// nodeReady reports the aggregate Ready condition of a node.
func nodeReady(n corev1.Node) string {
	for _, c := range n.Status.Conditions {
		if c.Type == corev1.NodeReady {
			if c.Status == corev1.ConditionTrue {
				return "Ready"
			}
			return "NotReady"
		}
	}
	return "Unknown"
}

func fmtCores(v float64) string { return strconv.FormatFloat(v, 'f', 2, 64) }
func fmtGiB(bytes float64) string {
	return strconv.FormatFloat(bytes/1024/1024/1024, 'f', 1, 64) + "Gi"
}


// StreamExec runs a command in a pod container, bridging stdio over SPDy.
func (c *Client) StreamExec(ctx context.Context, ns, pod, container string, command []string, stdin io.Reader, stdout, stderr io.Writer, tty bool) error {
	req := c.clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(pod).
		Namespace(ns).
		SubResource("exec")
	req.VersionedParams(&corev1.PodExecOptions{
		Container: container,
		Command:   command,
		Stdin:     stdin != nil,
		Stdout:    stdout != nil,
		Stderr:    stderr != nil,
		TTY:       tty,
	}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(c.restConfig, "POST", req.URL())
	if err != nil {
		return err
	}
	return exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
		Tty:    tty,
	})
}

func age(t time.Time) string {
	return time.Since(t).Round(time.Second).String()
}
