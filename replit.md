# Workspace

## Overview

BetZone — a full-stack sports betting platform with pnpm workspace monorepo using TypeScript. Users bet on teams for matches, with payouts divided proportionally based on money bet per team.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: Replit Auth (OIDC + PKCE via openid-client v6)
- **Frontend**: React + Vite, Tailwind CSS, Shadcn UI, React Query, Wouter

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (auth, matches, bets, admin routes)
│   └── betting-app/        # React + Vite frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── replit-auth-web/    # useAuth() React hook for browser auth
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Key Features

### User Features
- Login via Replit Auth (OIDC PKCE)
- Registration requires admin approval (pending/approved/rejected status)
- Browse matches (upcoming, live, finished)
- Place bets on a team for a match
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

## Database Schema

### `users` table
- id, email, username, firstName, lastName, profileImageUrl
- isAdmin (boolean), status (pending/approved/rejected)
- createdAt, updatedAt

### `sessions` table (Replit Auth)
- sid, sess (jsonb), expire

### `matches` table
- id, team1, team2, matchDate, status (upcoming/live/finished), winner
- createdAt, updatedAt

### `bets` table
- id, matchId, userId, team, amount, payout, status (pending/won/lost)
- createdAt

## Payout Calculation

When a match finishes with a winner:
- `payout = (betAmount / winnerPool) * totalPool`
- Losers get payout = 0

## API Routes

All routes under `/api`:
- `GET /auth/user` — current user (fresh from DB)
- `GET /login` — redirect to OIDC
- `GET /callback` — OIDC callback
- `GET /logout` — OIDC end-session
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

## Development

- `pnpm --filter @workspace/api-server run dev` — run API dev server
- `pnpm --filter @workspace/betting-app run dev` — run frontend dev server
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client
