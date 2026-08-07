package victoriametrics

import "testing"

func TestApplyFilters(t *testing.T) {
	cases := []struct {
		name     string
		expr     string
		filters  string
		expected string
	}{
		{"plain metric gets matcher", "up", "instance:foo", `up{instance="foo"}`},
		{"colon in value preserved", "up", "instance:opsconsole-nodeexporter:9100", `up{instance="opsconsole-nodeexporter:9100"}`},
		{"inject into existing braces", "100 - avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100", "node:n1",
			`100 - avg(rate(node_cpu_seconds_total{mode="idle",node="n1"}[5m])) * 100`},
		{"dedup existing label", "sum(rate(container_cpu_usage_seconds_total{namespace=\"default\"}[5m])) by (pod)", "namespace:default",
			`sum(rate(container_cpu_usage_seconds_total{namespace="default"}[5m])) by (pod)`},
		{"empty filters unchanged", "up", "", "up"},
		{"no usable metric unchanged", "1 + 1", "node:n1", "1 + 1"},
		{"multiple matchers", "up", "node:n1,cluster:c1", `up{node="n1",cluster="c1"}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := applyFilters(c.expr, c.filters)
			if got != c.expected {
				t.Errorf("\n got  %q\n want %q", got, c.expected)
			}
		})
	}
}
