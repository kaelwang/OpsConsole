{{/*
Expand the name of the chart.
*/}}
{{- define "opsconsole.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "opsconsole.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Chart name and version, e.g. opsconsole-1.0.0.
*/}}
{{- define "opsconsole.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels.
*/}}
{{- define "opsconsole.labels" -}}
helm.sh/chart: {{ include "opsconsole.chart" . }}
{{ include "opsconsole.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels (stable, used by Deployment selector and Service).
*/}}
{{- define "opsconsole.selectorLabels" -}}
app.kubernetes.io/name: {{ include "opsconsole.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Backend Secret name: an externally-managed Secret if provided, else the
chart-generated one.
*/}}
{{- define "opsconsole.backendSecretName" -}}
{{- .Values.backend.existingSecret | default (printf "%s-backend" (include "opsconsole.fullname" .)) -}}
{{- end -}}
