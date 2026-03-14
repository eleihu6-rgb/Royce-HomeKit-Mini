#!/bin/bash
# ============================================================
# start_agents.sh  —  Launch all import agents + monitor
# Usage: bash start_agents.sh [NUM_WORKERS]
# Default: 3 workers + 1 monitor = 4 agents total
# Max recommended: 4 workers (matches CPU cores)
# ============================================================

BASE_DIR="/home/eleihu6/rois_tg_live_load"
NUM_WORKERS="${1:-3}"
LOG_DIR="$BASE_DIR/logs"
mkdir -p "$LOG_DIR"

echo "=============================================="
echo " MySQL Import Agent Launcher"
echo "=============================================="
echo " Workers    : $NUM_WORKERS"
echo " Monitor    : 1"
echo " Total agents: $(( NUM_WORKERS + 1 ))"
echo " Base dir   : $BASE_DIR"
echo "----------------------------------------------"

# Kill any stale agents from previous run
echo "Stopping any previous agents..."
pkill -f "worker.sh" 2>/dev/null
pkill -f "monitor.sh" 2>/dev/null
sleep 1

# Recover orphaned in_progress files back to pending
ORPHANS=$(ls "$BASE_DIR/tables/in_progress/" 2>/dev/null | wc -l)
if [ "$ORPHANS" -gt 0 ]; then
    echo "Recovering $ORPHANS orphaned in_progress files back to pending..."
    for f in "$BASE_DIR/tables/in_progress"/tbl_*; do
        [ -f "$f" ] || continue
        ORIGINAL=$(basename "$f" | sed 's/_w[0-9]*$//')
        mv "$f" "$BASE_DIR/tables/$ORIGINAL"
    done
fi

# Queue status
PENDING=$(find "$BASE_DIR/tables" -maxdepth 1 -name 'tbl_*' ! -name 'tbl_0000' -type f | wc -l)
COMPLETED=$(ls "$BASE_DIR/tables/completed/" 2>/dev/null | wc -l)
echo " Pending files  : $PENDING"
echo " Already done   : $COMPLETED"
echo "----------------------------------------------"

if [ "$PENDING" -eq 0 ]; then
    echo "No pending files — nothing to import. Exiting."
    exit 0
fi

# Start monitor agent
nohup bash "$BASE_DIR/monitor.sh" >> "$LOG_DIR/monitor.log" 2>&1 &
MON_PID=$!
echo " [MONITOR ] PID $MON_PID → logs/monitor.log"

sleep 1

# Start worker agents
for i in $(seq 1 $NUM_WORKERS); do
    nohup bash "$BASE_DIR/worker.sh" $i >> "$LOG_DIR/worker_${i}.log" 2>&1 &
    WPD=$!
    echo " [WORKER $i] PID $WPD → logs/worker_${i}.log"
    sleep 0.5
done

echo "----------------------------------------------"
echo " All agents launched."
echo ""
echo " Live status  : cat $BASE_DIR/PROGRESS_REPORT.txt"
echo " Audit log    : tail -f $BASE_DIR/logs/ROW_AUDIT.log"
echo " Worker 1 log : tail -f $BASE_DIR/logs/worker_1.log"
echo " Stop all     : pkill -f worker.sh; pkill -f monitor.sh"
echo "=============================================="
