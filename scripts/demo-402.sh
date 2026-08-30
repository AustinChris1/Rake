#!/usr/bin/env bash
# Shows the x402 challenge for the deep pass: the 402 line, then the decoded quote.
# Usage: bash scripts/demo-402.sh [tokenAddress] [hours]
set -euo pipefail
TOKEN="${1:-0xbf927b841994731c573bdf09ceb0c6b0aa887cdd}"
HOURS="${2:-4}"
URL="https://basedrake.vercel.app/api/deeppass?token=$TOKEN&hours=$HOURS"

echo "\$ curl -i --http1.1 \"$URL\""
echo
curl -sS --http1.1 -D rake402.h -o /dev/null "$URL"
head -1 rake402.h
echo
echo "the quote it hands back:"
python -c "
import base64,json,re
raw=open('rake402.h',encoding='utf-8',errors='replace').read()
m=re.search(r'(?im)^payment-required:\s*(\S+)',raw)
s=m.group(1); s+='='*(-len(s)%4)
q=json.loads(base64.b64decode(s))['accepts'][0]
print(f\"  price    \${int(q['amount'])/1e6:.2f} USDC\")
print(f\"  asset    {q['asset']}\")
print(f\"  pay to   {q['payTo']}\")
print(f\"  network  {q['network']}\")
print(f\"  scheme   {q['scheme']}\")
"
rm -f rake402.h
