#!/bin/sh
# Flash the firmware to the Pico and restart it in one shot.
# Every mpremote command (cp, ls, cat, rm) stops the running agent and leaves the board at the REPL: no WiFi,
# no screen, buttons dead. Only a reset brings it back, so this script always ends with one. Never poke the
# board with mpremote while someone is using it; watch the dev server log instead (GET /api/sign once a second).
set -e
cd "$(dirname "$0")/../firmware"
exec mpremote connect "${PICO:-auto}" cp *.py : + reset
