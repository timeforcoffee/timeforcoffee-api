docker push docker.gitlab.liip.ch/chregu/repo/tfc-api:latest
kubectl patch deployment tfc-api -n tfc -p "{\"spec\": {\"template\": {\"metadata\": { \"labels\": {  \"redeploy\": \"$(date +%s)\"}}}}}"
