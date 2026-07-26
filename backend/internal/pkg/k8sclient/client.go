package k8sclient

import (
	"context"
	"fmt"
	"io"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"

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
	clientset  *kubernetes.Clientset
	restConfig *rest.Config
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
	cs, err := kubernetes.NewForConfig(rc)
	if err != nil {
		return nil, fmt.Errorf("new clientset: %w", err)
	}
	return &Client{clientset: cs, restConfig: rc}, nil
}

// ListPods returns pods in the given namespace (or all namespaces if empty).
func (c *Client) ListPods(ctx context.Context, namespace string) ([]model.Pod, error) {
	ns := namespace
	if ns == "" {
		ns = metav1.NamespaceAll
	}
	list, err := c.clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]model.Pod, 0, len(list.Items))
	for _, p := range list.Items {
		out = append(out, model.Pod{
			Name:      p.Name,
			Namespace: p.Namespace,
			Node:      p.Spec.NodeName,
			Status:    string(p.Status.Phase),
			Age:       age(p.CreationTimestamp.Time),
		})
	}
	return out, nil
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
