# LiveCollaborator

A real-time collaborative code editor with CRDT-based sync, room isolation, live presence, and in-browser code execution.

🔴 **Live demo:** https://live-collaborator.onrender.com
> First load may take ~30 seconds (free tier cold start)

## Features

- **CRDT sync** — conflict-free concurrent editing via Yjs + y-socket.io. No last-write-wins conflicts.
- **Room isolation** — unique 8-char room IDs. Each room gets its own Y.Doc instance on the server automatically.
- **Live presence** — color-coded online users sidebar powered by Yjs Awareness Protocol.
- **Synced language switching** — language changes broadcast to all users in the room via a shared Y.Doc map.
- **Synced code execution** — output from running code is broadcast to all users in the room via Y.Doc.
- **Multi-language** — JavaScript, Python, C++, Go, Java, TypeScript with Monaco syntax highlighting.
- **Code execution** — run code in-browser via Judge0 CE, proxied through Express to avoid CORS.
- **Shareable links** — one-click copy of a join URL with the room code pre-filled.

## Tech Stack

| Layer      | Technology                                        |
|------------|---------------------------------------------------|
| Frontend   | React 19, Monaco Editor, Yjs, Tailwind CSS, Vite  |
| Backend    | Node.js, Express, Socket.io, y-socket.io          |
| Sync       | Yjs CRDT (y-socket.io transport)                  |
| Execution  | Judge0 Community Edition API                      |
| Infra      | Docker (multi-stage), AWS ECS, AWS ECR, Render    |

**Why Yjs over raw Socket.io?**
Plain Socket.io broadcasting has a race condition: if two users type simultaneously, the last write wins and one user's change is lost. Yjs uses a CRDT (Conflict-free Replicated Data Type) which merges concurrent edits mathematically — no conflicts, no data loss, no locking needed.

## Running Locally

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:3000

## Deployment (Docker)

```bash
# Build image (multi-stage: builds frontend, copies dist into backend)
docker build -t live-collaborator .

# Run
docker run -p 3000:3000 live-collaborator
```

Two-stage build: the builder stage installs frontend deps and runs `vite build`. The production stage installs only backend deps and copies the built frontend into `public/`. Result: a single container serving both frontend and backend with a minimal image size.

## AWS Deployment (ECS + ECR)

```bash
aws ecr get-login-password | docker login --username AWS --password-stdin <ECR_URI>
docker tag live-collaborator:latest <ECR_URI>/live-collaborator:latest
docker push <ECR_URI>/live-collaborator:latest
```

ECS task definition: expose port 3000, set `PORT` env var.

## Environment Variables

| Variable    | Default  | Description                                 |
|-------------|----------|---------------------------------------------|
| `PORT`      | `3000`   | Server port                                 |
| `REDIS_URL` | *(none)* | Optional — room persistence across restarts |

## API Reference

| Method | Endpoint         | Description                        |
|--------|------------------|------------------------------------|
| `GET`  | `/health`        | Health check + uptime + room count |
| `POST` | `/api/rooms`     | Create a new room                  |
| `GET`  | `/api/rooms/:id` | Get room metadata                  |
| `POST` | `/api/execute`   | Execute code via Judge0            |
