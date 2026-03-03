#!/bin/sh
# Railway injects PORT as an environment variable
# Use python3 to serve the built Vite UI on the correct port
PORT="${PORT:-3000}"
echo "Starting UI server on port $PORT"
exec python3 -m http.server "$PORT" --directory /app/packages/ui/dist --bind 0.0.0.0
