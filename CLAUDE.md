# Project Rules

## Server Restart After Code Changes

After any change to `server.py`, always restart the server so changes take effect.
Use `kill -9` on ALL running instances — `pkill` alone is not enough if stale processes linger.

```bash
# Kill every running instance (including old/orphan processes)
ps aux | grep "server.py" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
sleep 1

# Start fresh
cd "/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/Royce-HomeKit"
nohup python3 server.py >/tmp/server_nbids.log 2>&1 &
sleep 2

# Verify the new server is up and serving latest code
echo "PID $!"
curl -s http://localhost:8088/ | head -3
```

**Important:** Always confirm only ONE process is running after restart:
```bash
ps aux | grep "server.py" | grep -v grep
```
