#!/usr/bin/env bash

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
SERVICE_NAME="${REED_RELAY_SERVICE:-reed-relay}"
IMAGE_LABEL="${REED_RELAY_IMAGE_LABEL:-relay}"
LOCAL_IMAGE="${REED_RELAY_LOCAL_IMAGE:-reed-relay:lightsail}"
APPLY=false
export AWS_PAGER=""

if [[ "${1:-}" == "--" ]]; then
  shift
fi

usage() {
  cat <<'EOF'
Usage: scripts/deploy-relay-lightsail.sh [--apply]

Checks, builds, and deploys Reed's memory-only relay to one AWS Lightsail
container in Sydney by default. Without --apply, it performs read-only
preflight checks and prints the deployment plan.

Environment overrides:
  AWS_REGION             AWS region (default: ap-southeast-2)
  REED_RELAY_SERVICE     Lightsail service name (default: reed-relay)
  REED_RELAY_IMAGE_LABEL Lightsail image label (default: relay)
  REED_RELAY_LOCAL_IMAGE Local Docker tag (default: reed-relay:lightsail)
EOF
}

if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
elif [[ -n "${1:-}" ]]; then
  usage >&2
  exit 2
fi

for command_name in aws curl docker lightsailctl node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

if [[ ! "$SERVICE_NAME" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  printf 'Invalid Lightsail service name: %s\n' "$SERVICE_NAME" >&2
  exit 2
fi
if [[ ! "$IMAGE_LABEL" =~ ^[a-z0-9]([a-z0-9-]{0,51}[a-z0-9])?$ ]]; then
  printf 'Invalid Lightsail image label: %s\n' "$IMAGE_LABEL" >&2
  exit 2
fi

if docker buildx version >/dev/null 2>&1; then
  DOCKER_BUILD=(docker buildx build)
elif command -v docker-buildx >/dev/null 2>&1; then
  DOCKER_BUILD=(docker-buildx build)
elif [[ -x /opt/homebrew/lib/docker/cli-plugins/docker-buildx ]]; then
  DOCKER_BUILD=(/opt/homebrew/lib/docker/cli-plugins/docker-buildx build)
else
  printf 'Docker Buildx is required for a reproducible Linux/AMD64 Lightsail image.\n' >&2
  printf 'Install the Docker Buildx plugin and try again.\n' >&2
  exit 1
fi

printf 'Checking AWS identity in %s...\n' "$AWS_REGION"
ACCOUNT_ID="$(aws sts get-caller-identity --region "$AWS_REGION" --query Account --output text)"

printf '\nReed relay deployment plan\n'
printf '  AWS account: %s\n' "$ACCOUNT_ID"
printf '  Region:      %s\n' "$AWS_REGION"
printf '  Service:     %s\n' "$SERVICE_NAME"
printf '  Capacity:    one Nano container (scale 1)\n'
printf '  Storage:     none; channel state remains in process memory\n'
printf '  Endpoint:    Lightsail-managed public HTTPS\n'

if [[ "$APPLY" != true ]]; then
  printf '\nPreflight passed. Re-run with --apply to create/update the billed AWS service.\n'
  exit 0
fi

service_state="$(aws lightsail get-container-services \
  --region "$AWS_REGION" \
  --query "containerServices[?containerServiceName=='$SERVICE_NAME'].state | [0]" \
  --output text)"

if [[ "$service_state" == "None" ]]; then
  printf '\nCreating one Nano Lightsail container service...\n'
  aws lightsail create-container-service \
    --region "$AWS_REGION" \
    --service-name "$SERVICE_NAME" \
    --power nano \
    --scale 1 >/dev/null
else
  printf '\nUsing existing Lightsail service (state: %s).\n' "$service_state"
  current_scale="$(aws lightsail get-container-services \
    --region "$AWS_REGION" \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].scale' \
    --output text)"
  if [[ "$current_scale" != "1" ]]; then
    printf 'Refusing to deploy: %s has scale %s, but Reed requires exactly one relay replica.\n' \
      "$SERVICE_NAME" "$current_scale" >&2
    exit 1
  fi
fi

printf 'Waiting for the service to accept a deployment...\n'
for _ in {1..90}; do
  service_state="$(aws lightsail get-container-services \
    --region "$AWS_REGION" \
    --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].state' \
    --output text)"
  case "$service_state" in
    READY|RUNNING) break ;;
    DISABLED|DELETING|None)
      printf 'Lightsail service entered an unusable state: %s\n' "$service_state" >&2
      exit 1
      ;;
  esac
  sleep 5
done

if [[ "$service_state" != "READY" && "$service_state" != "RUNNING" ]]; then
  printf 'Timed out waiting for the Lightsail service (last state: %s).\n' "$service_state" >&2
  exit 1
fi

printf 'Building the Linux/AMD64 relay image...\n'
"${DOCKER_BUILD[@]}" \
  --platform linux/amd64 \
  --load \
  --file apps/relay/Dockerfile \
  --tag "$LOCAL_IMAGE" \
  .

printf 'Uploading the relay image to Lightsail...\n'
if [[ -z "${DOCKER_HOST:-}" ]]; then
  DOCKER_HOST="$(docker context inspect "$(docker context show)" --format '{{.Endpoints.docker.Host}}')"
  export DOCKER_HOST
fi

# push-container-image is a custom AWS CLI command. Its --query/--output path is
# broken in some Homebrew AWS CLI builds, so query the normal Lightsail API only
# after the plugin completes registration.
aws lightsail push-container-image \
  --region "$AWS_REGION" \
  --service-name "$SERVICE_NAME" \
  --label "$IMAGE_LABEL" \
  --image "$LOCAL_IMAGE"

REMOTE_IMAGE="$(aws lightsail get-container-images \
  --region "$AWS_REGION" \
  --service-name "$SERVICE_NAME" \
  --query "containerImages[?starts_with(image, ':$SERVICE_NAME.$IMAGE_LABEL.')].image | [0]" \
  --output text)"
if [[ "$REMOTE_IMAGE" == "None" || -z "$REMOTE_IMAGE" ]]; then
  printf 'Lightsail did not return the registered relay image.\n' >&2
  exit 1
fi

CONTAINERS_JSON="$(node -e 'process.stdout.write(JSON.stringify({relay:{image:process.argv[1],ports:{"8787":"HTTP"}}}))' "$REMOTE_IMAGE")"
PUBLIC_ENDPOINT_JSON='{"containerName":"relay","containerPort":8787,"healthCheck":{"healthyThreshold":2,"unhealthyThreshold":2,"timeoutSeconds":5,"intervalSeconds":10,"path":"/healthz","successCodes":"200-299"}}'

printf 'Starting the single-instance deployment...\n'
aws lightsail create-container-service-deployment \
  --region "$AWS_REGION" \
  --service-name "$SERVICE_NAME" \
  --containers "$CONTAINERS_JSON" \
  --public-endpoint "$PUBLIC_ENDPOINT_JSON" >/dev/null

printf 'Waiting for the deployment to become active...\n'
deployment_state=""
for _ in {1..120}; do
  deployment_state="$(aws lightsail get-container-service-deployments \
    --region "$AWS_REGION" \
    --service-name "$SERVICE_NAME" \
    --query 'deployments[0].state' \
    --output text)"
  case "$deployment_state" in
    ACTIVE) break ;;
    FAILED)
      printf 'Lightsail deployment failed. Inspect it with:\n' >&2
      printf '  aws lightsail get-container-service-deployments --region %s --service-name %s\n' \
        "$AWS_REGION" "$SERVICE_NAME" >&2
      exit 1
      ;;
  esac
  sleep 5
done

if [[ "$deployment_state" != "ACTIVE" ]]; then
  printf 'Timed out waiting for the deployment (last state: %s).\n' "$deployment_state" >&2
  exit 1
fi

RELAY_URL="$(aws lightsail get-container-services \
  --region "$AWS_REGION" \
  --service-name "$SERVICE_NAME" \
  --query 'containerServices[0].url' \
  --output text)"
RELAY_URL="${RELAY_URL%/}"

printf 'Verifying %s/healthz...\n' "$RELAY_URL"
health_response=""
for _ in {1..30}; do
  if health_response="$(curl --fail --silent "$RELAY_URL/healthz" 2>/dev/null)"; then
    break
  fi
  sleep 3
done
if [[ -z "$health_response" ]]; then
  printf 'The deployment is active, but its public health endpoint did not become ready.\n' >&2
  exit 1
fi
printf '%s' "$health_response"
printf '\n\nRelay ready: %s\n' "$RELAY_URL"
printf 'Compile this origin into Android with REED_AGENT_RELAY_URL=%s.\n' "$RELAY_URL"
