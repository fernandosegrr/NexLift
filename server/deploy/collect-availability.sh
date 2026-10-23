#!/bin/sh
# Read-only, run on the Docker/Swarm manager. No env, full inspect, secrets,
# request bodies, health output, or arbitrary application logs are emitted.
set -eu
SERVICE=${1:?Usage: collect-availability.sh exact-service-name}
case "$SERVICE" in *[!a-zA-Z0-9_.-]*|'') exit 2;; esac
date -u '+%Y-%m-%dT%H:%M:%SZ'
docker service inspect "$SERVICE" --format 'service={{.Spec.Name}} desired={{json .Spec.Mode}} update={{if .UpdateStatus}}{{.UpdateStatus.State}}{{else}}none{{end}} policy={{json .Spec.UpdateConfig}} restart={{json .Spec.TaskTemplate.RestartPolicy}} resources={{json .Spec.TaskTemplate.Resources}}'
docker service ps "$SERVICE" --no-trunc --format 'task={{.ID}} name={{.Name}} node={{.Node}} desired={{.DesiredState}} current={{.CurrentState}}'
docker service inspect "$SERVICE" --format '{{with .Spec.TaskTemplate.ContainerSpec.Healthcheck}}healthInterval={{.Interval}} healthTimeout={{.Timeout}} startPeriod={{.StartPeriod}} retries={{.Retries}}{{else}}health=none{{end}}'
for container in $(docker ps -aq --filter "label=com.docker.swarm.service.name=$SERVICE"); do
  docker inspect "$container" --format 'id={{.Id}} image={{.Image}} status={{.State.Status}} running={{.State.Running}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} started={{.State.StartedAt}} finished={{.State.FinishedAt}} restarts={{.RestartCount}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
  docker inspect "$container" --format '{{if .State.Health}}{{range .State.Health.Log}}probeStart={{.Start}} probeEnd={{.End}} exit={{.ExitCode}}{{println}}{{end}}{{end}}'
done
docker stats --no-stream --format 'container={{.Name}} cpu={{.CPUPerc}} memory={{.MemUsage}} limitPercent={{.MemPerc}} pids={{.PIDs}}'
