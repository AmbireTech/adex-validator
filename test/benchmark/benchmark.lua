
wrk.method = "POST"
wrk.body   = "{ \"events\": [ {\"type\": \"IMPRESSION\", \"publisher\": \"awesomePublisher\"} ] }"
wrk.headers["Content-Type"] = "application/json"
-- uses the creator token
wrk.headers["authorization"] = "Bearer awesomeCreator"