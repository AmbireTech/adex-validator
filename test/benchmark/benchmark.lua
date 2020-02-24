wrk.method = "POST"
wrk.body   = "{ \"events\": [ {\"type\": \"IMPRESSION\", \"publisher\": \"0xb7d3f81e857692d13e9d63b232a90f4a1793189e\"} ] }"
wrk.headers["Content-Type"] = "application/json"
-- uses the creator token
wrk.headers["authorization"] = "Bearer 0x033ed90e0fec3f3ea1c9b005c724d704501e0196"
