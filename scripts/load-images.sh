#!/usr/bin/env bash
# Pull the three SeatSurge images from the registry and load them into a kind cluster.
# usage: scripts/load-images.sh <kind-cluster> <registry-prefix> <tag>
set -euo pipefail
CLUSTER=${1:?kind cluster name}
REGISTRY=${2:?registry prefix, e.g. ghcr.io/owner}
TAG=${3:?image tag}

for svc in web inventory checkout; do
  image="$REGISTRY/seatsurge-$svc:$TAG"
  echo "→ $image"
  docker pull --quiet "$image"
  kind load docker-image "$image" --name "$CLUSTER"
done
