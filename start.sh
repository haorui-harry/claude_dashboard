#!/bin/bash
# Claude Code Dashboard
# Usage: bash start.sh

cd "$(dirname "$0")"

source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate "${CONDA_ENV:-claude_dashboard}"

# Kill old processes
pkill -f "python api.py" 2>/dev/null

# Start Flask API backend
nohup python api.py > api.log 2>&1 &
echo "✅ API backend started (port 8998), log: api.log"

# Start frontend
cd frontend
echo "✅ Starting frontend on http://localhost:8999"
npm run dev
