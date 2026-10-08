# Contributing

Small, focused improvements are welcome. Open an issue to discuss a substantial
gameplay or architecture change before implementing it.

## Local workflow

1. Fork the repository and create a branch.
2. Use Node.js 22.16+ or 24, then run `npm ci`.
3. Start the game with `npm run dev`.
4. Make your change, then run `npm run format`, `npm test`, and `npm run build`.
5. Open a pull request explaining the problem, the change, and how you checked it.

Include desktop and mobile screenshots for visual changes. For gameplay changes,
check jump timing, slide timing, and a reachable path at maximum speed. Add tests
for behavior that could regress; avoid tests that only repeat the implementation.

The leaderboard is optional for local gameplay. See the README for database setup.
Database integration tests write data and must use a separate test database.

## Code and assets

Keep TypeScript strict, validate untrusted data at its boundary, and prefer explicit
types and small functions over new abstractions. Formatting is enforced by Prettier.
The source, API, scripts, and Vite configuration are checked by TypeScript.

Never commit `.env` files, credentials, private player data, deployment account
configuration, or raw generation responses. Add an entry to [ASSETS.md](ASSETS.md)
and the applicable license when introducing media or a third-party asset. Code
contributions use the MIT license; bundled media and trademarks have separate terms.
