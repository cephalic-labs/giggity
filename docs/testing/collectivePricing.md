# Collective Pricing Testing Guide

This guide verifies the feature:

`Premium = f(zone, historical_risk, pool_size)`

and the signup countdown UX:

`"X more workers needed in <zone> to unlock INR Y discount"`

## Scope

This test validates:

1. Collective pricing API returns correct zone pool context.
2. Premium decreases as worker pool size increases.
3. Quote endpoint includes pool-size factors.
4. Signup page shows and refreshes countdown + premium.

## Prerequisites

1. Docker is running.
2. Ports `3000` and `8000` are available.
3. You are in repo root:

```bash
cd /path/to/giggity
```

## Start the stack

```bash
docker compose up --build
```

Wait until:

1. Frontend is reachable at `http://localhost:3000`.
2. Backend health returns `ok`:

```bash
curl http://localhost:8000/health
```

## Test 1: Baseline collective pricing endpoint (public)

Call the endpoint for Zone B:

```bash
curl "http://localhost:8000/api/v1/pricing/collective?zone=ZONE_B"
```

Expected fields in response:

1. `pool_size`
2. `base_premium`
3. `current_premium`
4. `workers_needed_for_next_tier`
5. `discount_unlocked_at_next_tier`
6. `countdown_message`

## Test 2: Increase zone pool and verify premium drop

Register 20 workers in the same zone (`ZONE_B`):

```bash
i=1
while [ $i -le 20 ]; do
	ts=$(date +%s)
	phone_suffix=$(printf "%08d" $i)
	curl -s -X POST "http://localhost:8000/api/v1/auth/register" \
		-H "Content-Type: application/json" \
		-d "{
			\"name\":\"Worker $i\",
			\"email\":\"worker_${ts}_${i}@example.com\",
			\"phone\":\"+9199${phone_suffix}\",
			\"password\":\"Demo@1234\",
			\"current_zone\":\"ZONE_B\"
		}" > /dev/null
	i=$((i+1))
done
```

Re-check endpoint:

```bash
curl "http://localhost:8000/api/v1/pricing/collective?zone=ZONE_B"
```

Expected behavior:

1. `pool_size` increased.
2. `current_premium` is lower than baseline (or unchanged if tier threshold not crossed).
3. `workers_needed_for_next_tier` decreased.
4. `countdown_message` reflects updated state.

## Test 3: Quote endpoint includes pool-size factors (auth)

### 3.1 Register a dedicated test user

```bash
TS=$(date +%s)
EMAIL="quote_tester_${TS}@example.com"
PHONE="+9188$(printf "%08d" $((TS % 100000000)))"

curl -s -X POST "http://localhost:8000/api/v1/auth/register" \
	-H "Content-Type: application/json" \
	-d "{
		\"name\":\"Quote Tester\",
		\"email\":\"${EMAIL}\",
		\"phone\":\"${PHONE}\",
		\"password\":\"Demo@1234\",
		\"current_zone\":\"ZONE_B\"
	}"
```

### 3.2 Login and capture access token

```bash
TOKEN=$(curl -s -X POST "http://localhost:8000/api/v1/auth/token" \
	-H "Content-Type: application/json" \
	-d "{\"email\":\"${EMAIL}\",\"password\":\"Demo@1234\"}" \
	| python -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
```

### 3.3 Call quote endpoint

```bash
curl -s -H "Authorization: Bearer ${TOKEN}" \
	"http://localhost:8000/api/v1/policy/quote?zone=ZONE_B"
```

Expected in `factors`:

1. `pool_size`
2. `current_discount_rate`

## Test 4: Signup page live countdown UX

1. Open: `http://localhost:3000/signup`
2. Select `Zone B — Mumbai (Andheri East)`.
3. Verify the Collective Pricing card shows:
   1. Countdown message
   2. Worker pool size
   3. Current premium (`INR ... /week`)
4. Keep page open for ~20 seconds and confirm values auto-refresh.
5. Change the selected zone and confirm immediate refresh for that zone.

## Optional: Fast regression script

Use this sequence for quick before/after checks:

```bash
echo "Baseline"
curl -s "http://localhost:8000/api/v1/pricing/collective?zone=ZONE_B"

echo "Seeding workers"
i=1
while [ $i -le 10 ]; do
	ts=$(date +%s)
	curl -s -X POST "http://localhost:8000/api/v1/auth/register" \
		-H "Content-Type: application/json" \
		-d "{\"name\":\"Seed $i\",\"email\":\"seed_${ts}_${i}@example.com\",\"phone\":\"+9177$(printf '%08d' $i)\",\"password\":\"Demo@1234\",\"current_zone\":\"ZONE_B\"}" > /dev/null
	i=$((i+1))
done

echo "After"
curl -s "http://localhost:8000/api/v1/pricing/collective?zone=ZONE_B"
```

## Pass Criteria

The feature is considered working when all are true:

1. Collective pricing endpoint returns valid zone pricing context.
2. Increasing pool size eventually lowers `current_premium` tier-by-tier.
3. Quote endpoint response includes pool-size pricing factors.
4. Signup page displays countdown text and refreshes automatically.

## Troubleshooting

1. If endpoint returns `404 Zone not found`, verify zone value is one of `ZONE_A`..`ZONE_F`.
2. If signup card shows unavailable state, verify backend is up and CORS allows frontend origin.
3. If no premium change after adding workers, you may not have crossed the next discount threshold yet.
