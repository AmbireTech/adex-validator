#!/usr/bin/env bash

# Run the benchmark using 
# t1 - one thread
# c100 - one hundred concurrent connections
# d30s - 30 seconds
# R2000  2000 requests per second (total, across all connections combined)

wrk2 -s ./test/benchmark/benchmark.lua -t1 -c100 -d30s -R2000 --latency http://127.0.0.1:8005/channel/awesomeTestChannel/events
