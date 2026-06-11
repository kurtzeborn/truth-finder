# Spot the Lie

A multiplayer party game based on "2 Truths and 1 Lie." A game keeper projects a QR code, players join on their phones, get randomly assigned to groups, write statements, and vote on each other's lies.

**Live at**: https://truth.k61.dev

## How It Works

1. Game Keeper creates a game and projects the QR code
2. Players scan the QR code and enter their name
3. Game Keeper assigns everyone to random groups (A, B, C…)
4. Groups collaborate on 2 truths and 1 lie
5. Game Keeper leads voting, group by group
6. Scores are revealed dramatically at the end

## Development

See [docs/plan.md](docs/plan.md) for the full development plan.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: SWA Managed Functions (Node.js, TypeScript)
- **Database**: Azure Table Storage
- **Hosting**: Azure Static Web Apps (Free tier)
- **Auth**: Microsoft Entra ID (Game Keeper only)
