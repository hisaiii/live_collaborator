// import express from "express"
// import { createServer } from "http"
// import { Server } from "socket.io"
// import { YSocketIO } from "y-socket.io/dist/server"


// const app = express()
// app.use(express.static("public"))


// const httpServer = createServer(app)

// const io = new Server(httpServer, {
//     cors: {
//         origin: "*",
//         methods: [ "GET", "POST" ]
//     }
// })


// const ySocketIO = new YSocketIO(io)
// ySocketIO.initialize()


// app.get('/health', (req, res) => {
//     res.status(200).json({
//         message: "ok",
//         success: true
//     })
// })


// httpServer.listen(3000, () => {
//     console.log("Server is running on port 3000")
// })

import express from "express"
import { createServer } from "http"
import { Server } from "socket.io"
import { YSocketIO } from "y-socket.io/dist/server"

const app = express()
app.use(express.json())
app.use(express.static("public"))

const httpServer = createServer(app)

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PATCH"]
    }
})

// Yjs CRDT sync
// y-socket.io automatically creates a separate Y.Doc per unique room name
// so room isolation is handled — no extra code needed here
const ySocketIO = new YSocketIO(io)
ySocketIO.initialize()

// ─── In-memory room store ─────────────────────────────────────────────────────
// Each room stores: id, language, createdAt
// To upgrade later: swap this Map for Redis get/set calls (same API shape)
const rooms = new Map()

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check — also useful to confirm deployment is live
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        activeRooms: rooms.size,
        uptime: process.uptime()
    })
})

// Create a new room, return its ID
app.post("/api/rooms", (req, res) => {
    const roomId = Math.random().toString(36).substring(2, 10)
    rooms.set(roomId, {
        id: roomId,
        language: "javascript",
        createdAt: Date.now()
    })
    res.status(201).json({ roomId })
})

// Get room metadata (used to validate a room code on join)
app.get("/api/rooms/:roomId", (req, res) => {
    const room = rooms.get(req.params.roomId)
    // If room not found, create it on the fly so shared links always work
    if (!room) {
        const newRoom = {
            id: req.params.roomId,
            language: "javascript",
            createdAt: Date.now()
        }
        rooms.set(req.params.roomId, newRoom)
        return res.json(newRoom)
    }
    res.json(room)
})

// Update room language — lets the language selector sync across users
app.patch("/api/rooms/:roomId/language", (req, res) => {
    const room = rooms.get(req.params.roomId)
    if (!room) return res.status(404).json({ error: "Room not found" })
    room.language = req.body.language
    res.json(room)
})

// Code execution proxy — avoids CORS issues if called from the browser directly
// Uses Judge0 Community Edition (free, no API key needed for basic usage)
app.post("/api/execute", async (req, res) => {
    const { code, languageId } = req.body

    if (!code || !languageId) {
        return res.status(400).json({ error: "code and languageId are required" })
    }

    try {
        const response = await fetch(
            "https://ce.judge0.com/submissions?base64_encoded=false&wait=true",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source_code: code,
                    language_id: languageId,
                    stdin: ""
                })
            }
        )

        const result = await response.json()

        res.json({
            stdout:          result.stdout          || "",
            stderr:          result.stderr          || "",
            compile_output:  result.compile_output  || "",
            status:          result.status?.description || "Unknown"
        })
    } catch (err) {
        console.error("Judge0 error:", err.message)
        res.status(500).json({ error: "Code execution failed. Judge0 may be rate-limiting." })
    }
})

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})