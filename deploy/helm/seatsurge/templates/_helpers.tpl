{{- define "seatsurge.fullname" -}}
{{- printf "%s" .Release.Name | trunc 40 | trimSuffix "-" -}}
{{- end -}}

{{- define "seatsurge.labels" -}}
app.kubernetes.io/name: seatsurge
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ include "seatsurge.tag" . | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: seatsurge
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
seatsurge.io/environment: {{ .Values.global.environment }}
{{- end -}}

{{- define "seatsurge.selectorLabels" -}}
app.kubernetes.io/name: seatsurge
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .name }}
{{- end -}}

{{- define "seatsurge.tag" -}}
{{- default .Chart.AppVersion .Values.global.imageTag -}}
{{- end -}}

{{/* Image reference for a component: [registry/]image:tag */}}
{{- define "seatsurge.image" -}}
{{- $registry := .root.Values.global.imageRegistry -}}
{{- $tag := include "seatsurge.tag" .root -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry .component.image $tag -}}
{{- else -}}
{{- printf "%s:%s" .component.image $tag -}}
{{- end -}}
{{- end -}}

{{- define "seatsurge.svc" -}}
{{- printf "%s-%s" (include "seatsurge.fullname" .root) .name -}}
{{- end -}}

{{- define "seatsurge.secretName" -}}
{{- printf "%s-postgres" (include "seatsurge.fullname" .) -}}
{{- end -}}
