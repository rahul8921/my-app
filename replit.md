# Workspace

## Overview

Two completely separate apps in one pnpm monorepo:
1. **BetZone** — IPL cricket sports betting platform with proportional payouts
2. **RideNow** — Full ride-hailing app (Uber clone) with rider and driver views, real-time tracking

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Auth**: Replit Auth (OIDC + PKCE via openid-client v6)
- **Frontend**: React + Vite, Tailwind CSS, Shadcn UI, React Query, Wouter

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (BetZone: auth, matches, bets, admin, rides, driver)
│   ├── betting-app/        # BetZone React + Vite frontend
│   └── uber-app/           # RideNow React + Vite frontend (STANDALONE - no shared betting packages)
├── lib/                    # Shared libraries (BetZone only)
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks (BetZone only)
│   ├── api-zod/            # Generated Zod schemas from OpenAPI (BetZone only)
│   ├── db/                 # Drizzle ORM schema + DB connection (shared infrastructure)
│   └── replit-auth-web/    # useAuth() React hook (BetZone only)
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## RideNow App Separation

The `uber-app` is completely standalone — it does NOT import from any BetZone packages:
- `src/types.ts` — local type definitions (RideWithDetails, DriverProfile, AuthUser, etc.)
- `src/lib/api.ts` — all React Query hooks using direct `fetch()` calls to `/api/*` endpoints
- `src/hooks/use-ride-auth.ts` — custom auth hook calling `/api/auth/user` directly
- `src/components/MapUI.tsx` — imports types from local `@/types` (not from api-zod)

## BetZone Key Features

### User Features
- Login via Replit Auth (OIDC PKCE)
- Registration requires admin approval (pending/approved/rejected status)
- Browse matches (upcoming, live, finished)
- Place bets — fixed at $10 per bet
- View bet odds: proportional to total money bet per team
- Winner team shows 👑 crown, loser shows 💀 skull
- View personal bet history with payout info

### Admin Features
- First user to sign up is automatically admin + approved
- Approve/reject pending users
- View all users with total bet amounts and stats
- Create new matches (team1, team2, date/time)
- Update match results (set winner → auto-settles all bets proportionally)
- View platform stats (total users, bets, amounts, active matches)

## RideNow Key Features

- Rider dashboard: request rides to preset destinations, track driver in real time
- Driver dashboard: register vehicle, toggle availability, accept/start/complete rides
- Ride history: completed and cancelled trips
- Leaflet maps with real-time location tracking
- Fare calculation: $2.50 base + $1.80/km, minimum $5 (Haversine distance)
- Driver earnings and rating system
- State machine: `requested → accepted → in_progress → completed | cancelled`

## Database Schema

### `users` table
- id, email, username, firstName, lastName, profileImageUrl
- isAdmin (boolean), status (pending/approved/rejected)
- createdAt, updatedAt

### `sessions` table (shared auth)
- sid, sess (jsonb), expire

### `matches` table (BetZone)
- id, team1, team2, matchDate, status (upcoming/live/finished), winner

### `bets` table (BetZone)
- id, matchId, userId, team, amount ($10 fixed), payout, status (pending/won/lost)

### `rides` table (RideNow)
- id, riderId, driverId, status, pickupAddress, dropoffAddress
- pickupLat/Lng, dropoffLat/Lng, fare, riderRating
- requestedAt, acceptedAt, startedAt, completedAt

### `driver_profiles` table (RideNow)
- userId, vehicle, licensePlate, isAvailable, rating, totalEarnings, totalRides
- currentLat, currentLng

## Payout Calculation (BetZone)

When a match finishes with a winner:
- `payout = (betAmount / winnerPool) * totalPool`
- Losers get payout = 0

## API Routes (all under `/api`)

### Auth (shared)
- `GET /auth/user` — current user
- `GET /login` — redirect to OIDC
- `GET /callback` — OIDC callback
- `GET /logout` — OIDC end-session

### BetZone
- `GET /matches` — all matches with bet totals
- `GET /matches/:id` — single match with my bet
- `POST /matches` — create match (admin)
- `PATCH /matches/:id/result` — set result + settle bets (admin)
- `GET /bets` — user's bets
- `POST /bets` — place a bet
- `GET /admin/users` — all users with stats (admin)
- `PATCH /admin/users/:id/approve` — approve user (admin)
- `PATCH /admin/users/:id/reject` — reject user (admin)
- `GET /admin/stats` — platform stats (admin)

### RideNow
- `POST /rides` — request a ride
- `GET /rides/active` — current active ride
- `GET /rides/history` — completed/cancelled rides
- `POST /rides/:id/cancel` — cancel a ride
- `POST /rides/:id/accept` — driver accepts a ride
- `POST /rides/:id/start` — driver starts the trip
- `POST /rides/:id/complete` — driver completes the trip
- `POST /rides/:id/rate` — rider rates the driver
- `GET /driver/profile` — driver profile
- `POST /driver/register` — register as driver
- `PATCH /driver/availability` — toggle online/offline
- `PATCH /driver/location` — update driver GPS
- `GET /driver/pending-rides` — available ride requests

## CricAPI Integration

- IPL 2026 series `87c62aac-bc3c-4738-ab93-19da0690488f`
- Polls every 15 minutes for live match score updates
- Requires `CRICAPI_KEY` environment secret

## Development

- `pnpm --filter @workspace/api-server run dev` — run API dev server
- `pnpm --filter @workspace/betting-app run dev` — run BetZone frontend
- `pnpm --filter @workspace/uber-app run dev` — run RideNow frontend
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-spec run codegen` — regenerate BetZone API client
