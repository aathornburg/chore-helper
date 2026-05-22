# chore-helper

Chore Helper is a local React + Express + Prisma app for managing household chores and reviewing them with assistant-generated recommendations.

## Local Recommendation Provider

The backend owns recommendation generation behind `AgentProvider`. The React app calls Chore Helper APIs only; it never receives an OpenAI API key.

By default, local development uses deterministic mock recommendations:

```powershell
AGENT_PROVIDER="mock"
```

To use OpenAI-backed recommendations locally, set these values in `server/.env`:

```powershell
AGENT_PROVIDER="openai"
OPENAI_API_KEY="sk-your-key"
OPENAI_AGENT_MODEL="gpt-5.5"
```

`OPENAI_API_KEY` is required when `AGENT_PROVIDER` is `openai`. Keep it in `server/.env`; do not add it to Vite or any frontend `.env` file.
