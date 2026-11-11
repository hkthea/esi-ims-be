#!/usr/bin/env bash
# Send a message through the Telegram Bot API.
# Required environment variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_MESSAGE
# Optional: TELEGRAM_PARSE_MODE (default: Markdown), TELEGRAM_DISABLE_NOTIFICATION (default: false)
set -euo pipefail

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is not set}"
: "${TELEGRAM_CHAT_ID:?TELEGRAM_CHAT_ID is not set}"

message="${TELEGRAM_MESSAGE:-}"
parse_mode="${TELEGRAM_PARSE_MODE:-Markdown}"
disable_notification="${TELEGRAM_DISABLE_NOTIFICATION:-false}"
attempts=3

if [ -z "${message//[[:space:]]/}" ]; then
  echo "notify-telegram: empty message, nothing to send" >&2
  exit 0
fi

api_url="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"

for attempt in $(seq 1 "$attempts"); do
  response="$(curl --silent --show-error --max-time 20 \
    --write-out $'\n%{http_code}' \
    --request POST "$api_url" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${message}" \
    --data-urlencode "parse_mode=${parse_mode}" \
    --data-urlencode "disable_notification=${disable_notification}" 2>/dev/null || true)"

  http_status="${response##*$'\n'}"
  body="${response%$'\n'*}"

  if [ "$http_status" = "200" ]; then
    echo "notify-telegram: message sent"
    exit 0
  fi

  echo "notify-telegram: attempt ${attempt}/${attempts} failed (HTTP ${http_status:-no-response}) ${body}" >&2
  if [ "$attempt" -lt "$attempts" ]; then
    sleep $((attempt * 2))
  fi
done

echo "notify-telegram: could not deliver message" >&2
exit 1
