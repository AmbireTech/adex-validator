curl -H 'Authorization: Bearer x8c9v1b2' -H 'Content-Type: application/json' --data '{"events": [{"type": "IMPRESSION"}]}' -X POST http://localhost:8005/channel/awesomeTestChannel/events
curl -H 'Authorization: Bearer x8c9v1b2' -H 'Content-Type: application/json' --data '{"events": [{"type": "IMPRESSION"}]}' -X POST http://localhost:8006/channel/awesomeTestChannel/events
echo
