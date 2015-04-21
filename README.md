# fleet-rolling-deploys
Rolling deploys of services



FLEET_BINARY=/usr/local/bin/fleetctl fleet-deploy --sidekick audiorouter-dev-382cc7d /services/audiorouter/ -e http://127.0.0.1:4001 -n 1
