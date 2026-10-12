export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker build  --target build -t docker.gitlab.liip.ch/chregu/repo/tfc-api:build .

docker build --provenance=false -t docker.gitlab.liip.ch/chregu/repo/tfc-api:latest .
