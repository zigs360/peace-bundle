#!/bin/bash
set -e

# ==============================================================================
# Peace Bundle - .env Sanitizer Script
# ==============================================================================
# Fixes syntax issues in .env such as missing '#' before comment headers like
# '==========================================' or pasted command lines.
# ==============================================================================

if [ ! -f .env ]; then
  echo "Error: .env file not found in $(pwd)."
  exit 1
fi

cp .env .env.backup_$(date +%Y%m%d_%H%M%S)

# Clean carriage returns (CRLF -> LF)
tr -d '\r' < .env > .env.tmp && mv .env.tmp .env

# Ensure any line that is not a valid KEY=VALUE or empty line starts with #
awk '
{
  line = $0
  # Trim leading and trailing whitespace
  gsub(/^[ \t]+|[ \t]+$/, "", line)
  
  if (line == "" || line ~ /^#/) {
    print $0
  } else if (line ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
    print $0
  } else {
    print "# " $0
  }
}
' .env > .env.fixed && mv .env.fixed .env

echo "✓ Successfully sanitized .env! Invalid lines have been commented with '#'."
echo "You can now safely run: docker compose up -d"
