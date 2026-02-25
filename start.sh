#!/bin/bash

# Ensure we are in the script's directory
cd "$(dirname "$0")"

export TENCENTCLOUD_SECRET_ID=""
export TENCENTCLOUD_SECRET_KEY=""

# Function to kill background processes on exit
cleanup() {
    echo "Stopping background processes..."
    kill $(jobs -p) 2>/dev/null
    echo "Done."
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup EXIT

echo "Starting ASR Server (Port 8002)..."
python3 -m uvicorn asr_server:app --host 127.0.0.1 --port 8002 --reload &

echo "Starting HTTP Server (Port 8000)..."
python3 -m http.server 8000 &

echo "Starting LibreTV Frontend..."
cd LibreTV || { echo "LibreTV directory not found!"; exit 1; }
npm run dev

