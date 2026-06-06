import "./App.css"
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useMemo, useState, useEffect, useCallback } from "react"
import * as Y from "yjs"
import { SocketIOProvider } from "y-socket.io"

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
    { id: 63,  name: "JavaScript", monacoId: "javascript" },
    { id: 71,  name: "Python",     monacoId: "python"     },
    { id: 54,  name: "C++",        monacoId: "cpp"        },
    { id: 60,  name: "Go",         monacoId: "go"         },
    { id: 62,  name: "Java",       monacoId: "java"       },
    { id: 74,  name: "TypeScript", monacoId: "typescript" },
]

const USER_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#85C1E9",
    "#F0A500", "#E17055"
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRoomId() {
    return Math.random().toString(36).substring(2, 10)
}

function getUrlParams() {
    const p = new URLSearchParams(window.location.search)
    return { room: p.get("room"), username: p.get("username") }
}

function getUserColor(username) {
    const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
    return USER_COLORS[hash % USER_COLORS.length]
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

function Landing({ onJoin }) {
    const [username, setUsername] = useState("")
    const [roomCode, setRoomCode] = useState(() => {
        return new URLSearchParams(window.location.search).get("room") || ""
    })
    const [mode, setMode] = useState(() => {
        return new URLSearchParams(window.location.search).get("room") ? "join" : "create"
    })
    const [error, setError] = useState("")

    const handleSubmit = () => {
        setError("")
        if (!username.trim()) { setError("Enter a username"); return }
        if (mode === "join" && !roomCode.trim()) { setError("Enter a room code"); return }

        const roomId = mode === "create"
            ? generateRoomId()
            : roomCode.trim().toLowerCase()

        onJoin(roomId, username.trim())
    }

    return (
        <main className="h-screen w-full bg-gray-950 flex items-center justify-center">
            <div className="bg-gray-900 p-8 rounded-2xl w-full max-w-md flex flex-col gap-5 border border-gray-800 shadow-2xl">
                <div>
                    <h1 className="text-white text-2xl font-bold tracking-tight">LiveCollaborator</h1>
                    <p className="text-gray-400 text-sm mt-1">Real-time collaborative code editor</p>
                </div>

                <input
                    type="text"
                    placeholder="Your username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                    autoFocus
                    className="p-3 rounded-lg bg-gray-800 text-white border border-gray-700
                               focus:outline-none focus:border-amber-400 placeholder-gray-500 transition-colors"
                />

                <div className="flex gap-2">
                    {["create", "join"].map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`flex-1 py-2.5 rounded-lg font-semibold text-sm capitalize transition-colors ${
                                mode === m
                                    ? "bg-amber-400 text-gray-950"
                                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                            }`}
                        >
                            {m === "create" ? "Create Room" : "Join Room"}
                        </button>
                    ))}
                </div>

                {mode === "join" && (
                    <input
                        type="text"
                        placeholder="Room code (e.g. ab3x9z1k)"
                        value={roomCode}
                        onChange={e => setRoomCode(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSubmit()}
                        className="p-3 rounded-lg bg-gray-800 text-white border border-gray-700
                                   focus:outline-none focus:border-amber-400 placeholder-gray-500 font-mono transition-colors"
                    />
                )}

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                    onClick={handleSubmit}
                    className="p-3 rounded-lg bg-amber-400 text-gray-950 font-bold
                               hover:bg-amber-300 transition-colors"
                >
                    {mode === "create" ? "Create & Join →" : "Join Room →"}
                </button>
            </div>
        </main>
    )
}

// ─── Collaborative Editor ─────────────────────────────────────────────────────

function CollaboratorEditor({ roomId, username }) {
    const editorRef   = useRef(null)
    const providerRef = useRef(null)
    const bindingRef  = useRef(null)

    const [users,     setUsers]     = useState([])
    const [language,  setLanguage]  = useState(LANGUAGES[0])
    const [output,    setOutput]    = useState(null)
    const [isRunning, setIsRunning] = useState(false)
    const [copied,    setCopied]    = useState(false)

    const userColor = useMemo(() => getUserColor(username), [username])

    const ydoc      = useMemo(() => new Y.Doc(), [])
    const yText     = useMemo(() => ydoc.getText("monaco"), [ydoc])
    const yLanguage = useMemo(() => ydoc.getMap("language"), [ydoc])
    const yOutput   = useMemo(() => ydoc.getMap("output"), [ydoc])

    const tryCreateBinding = useCallback(() => {
        if (editorRef.current && providerRef.current && !bindingRef.current) {
            bindingRef.current = new MonacoBinding(
                yText,
                editorRef.current.getModel(),
                new Set([editorRef.current]),
                providerRef.current.awareness
            )
        }
    }, [yText])

    useEffect(() => {
        const provider = new SocketIOProvider("/", roomId, ydoc, {
            autoConnect: true,
        })

        provider.awareness.setLocalStateField("user", { username, color: userColor })
        providerRef.current = provider

        // ── Presence
        const updateUsers = () => {
            const states = Array.from(provider.awareness.getStates().values())
            setUsers(states.filter(s => s.user?.username).map(s => s.user))
        }
        updateUsers()
        provider.awareness.on("change", updateUsers)

        // ── Stale awareness cleanup
        const cleanupInterval = setInterval(() => {
            provider.awareness.getStates().forEach((state, clientId) => {
                if (clientId !== ydoc.clientID && !state.user) {
                    provider.awareness.removeAwarenessStates([clientId], "timeout")
                }
            })
        }, 5000)

        tryCreateBinding()

        // ── Language sync
        const onLanguageChange = () => {
            const monacoId = yLanguage.get("current")
            if (monacoId) {
                const lang = LANGUAGES.find(l => l.monacoId === monacoId)
                if (lang) setLanguage(lang)
            }
        }
        yLanguage.observe(onLanguageChange)
        onLanguageChange()

        // ── Output sync
        const onOutputChange = () => {
            const result = yOutput.get("result")
            setOutput(result ?? null)
        }
        yOutput.observe(onOutputChange)
        onOutputChange()

        // ── Cleanup on unmount / reload
        const handleBeforeUnload = () => {
            provider.awareness.setLocalStateField("user", null)
            provider.destroy()
        }
        window.addEventListener("beforeunload", handleBeforeUnload)

        return () => {
            clearInterval(cleanupInterval)
            window.removeEventListener("beforeunload", handleBeforeUnload)
            yLanguage.unobserve(onLanguageChange)
            yOutput.unobserve(onOutputChange)
            bindingRef.current?.destroy()
            bindingRef.current  = null
            provider.awareness.setLocalStateField("user", null)
            provider.disconnect()
            providerRef.current = null
        }
    }, [roomId, username, userColor, ydoc, yLanguage, yOutput, tryCreateBinding])

    const handleEditorMount = (editor) => {
        editorRef.current = editor
        tryCreateBinding()
    }

    const handleLanguageChange = (e) => {
        const lang = LANGUAGES.find(l => l.monacoId === e.target.value)
        if (lang) yLanguage.set("current", lang.monacoId)
    }

    const handleRun = async () => {
        if (!editorRef.current || isRunning) return
        setIsRunning(true)
        yOutput.set("result", "Running…")

        try {
            const code = editorRef.current.getValue()
            const res  = await fetch("/api/execute", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ code, languageId: language.id })
            })
            const data = await res.json()
            const out  = data.stdout || data.stderr || data.compile_output || `Status: ${data.status}`
            yOutput.set("result", out.trim() || "(no output)")
        } catch (err) {
            yOutput.set("result", `Error: ${err.message}`)
        } finally {
            setIsRunning(false)
        }
    }

    const handleCopyLink = () => {
        const url = `${window.location.origin}?room=${roomId}`
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <main className="h-screen w-full bg-gray-950 flex flex-col overflow-hidden">

            {/* Top bar */}
            <header className="flex items-center justify-between px-4 py-2
                               bg-gray-900 border-b border-gray-800 flex-shrink-0">
                <span className="text-amber-400 font-bold text-base tracking-tight">
                    LiveCollaborator
                </span>

                <div className="flex items-center gap-3">
                    <select
                        value={language.monacoId}
                        onChange={handleLanguageChange}
                        className="bg-gray-800 text-white text-sm px-2 py-1.5 rounded-lg
                                   border border-gray-700 focus:outline-none cursor-pointer"
                    >
                        {LANGUAGES.map(l => (
                            <option key={l.id} value={l.monacoId}>{l.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={handleRun}
                        disabled={isRunning}
                        className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600
                                   disabled:opacity-50 text-white text-sm font-semibold
                                   px-4 py-1.5 rounded-lg transition-colors"
                    >
                        <span>{isRunning ? "●" : "▶"}</span>
                        <span>{isRunning ? "Running…" : "Run"}</span>
                    </button>

                    <button
                        onClick={handleCopyLink}
                        className="bg-gray-800 hover:bg-gray-700 text-white text-sm
                                   px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
                    >
                        {copied ? "✓ Copied!" : "Share Link"}
                    </button>

                    <span className="text-gray-500 text-xs hidden sm:block">
                        Room: <span className="text-gray-300 font-mono">{roomId}</span>
                    </span>
                </div>
            </header>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">

                {/* Sidebar */}
                <aside className="w-44 flex-shrink-0 bg-gray-900 border-r border-gray-800
                                  flex flex-col overflow-hidden">
                    <p className="text-gray-500 text-xs uppercase font-semibold tracking-wider
                                  px-4 py-3 border-b border-gray-800 flex-shrink-0">
                        Online · {users.length}
                    </p>
                    <ul className="p-3 flex flex-col gap-2 overflow-y-auto">
                        {users.map((user, i) => (
                            <li key={i} className="flex items-center gap-2 min-w-0">
                                <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: user.color || "#4ECDC4" }}
                                />
                                <span className="text-white text-sm truncate">
                                    {user.username}
                                    {user.username === username && (
                                        <span className="text-gray-500 text-xs ml-1">(you)</span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </aside>

                {/* Editor + output */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    <div className="flex-1 overflow-hidden">
                        <Editor
                            height="100%"
                            language={language.monacoId}
                            theme="vs-dark"
                            onMount={handleEditorMount}
                            options={{
                                fontSize:             14,
                                minimap:              { enabled: false },
                                padding:              { top: 16, bottom: 16 },
                                scrollBeyondLastLine: false,
                                smoothScrolling:      true,
                                cursorBlinking:       "smooth",
                                renderLineHighlight:  "gutter",
                            }}
                        />
                    </div>

                    {output !== null && (
                        <div className="bg-gray-950 border-t border-gray-800
                                        flex-shrink-0 max-h-52 flex flex-col">
                            <div className="flex items-center justify-between
                                            px-4 py-2 border-b border-gray-800 flex-shrink-0">
                                <span className="text-gray-400 text-xs uppercase font-semibold tracking-wider">
                                    Output
                                </span>
                                <button
                                    onClick={() => yOutput.set("result", null)}
                                    className="text-gray-600 hover:text-gray-400 text-xs transition-colors"
                                >
                                    ✕ Close
                                </button>
                            </div>
                            <pre className="flex-1 overflow-auto p-4 text-green-400
                                            text-sm font-mono whitespace-pre-wrap leading-relaxed">
                                {output}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

function App() {
    const [session, setSession] = useState(() => {
        const { room, username } = getUrlParams()
        return room && username ? { room, username } : null
    })

    const handleJoin = (roomId, username) => {
        const params = new URLSearchParams({ room: roomId, username })
        window.history.pushState({}, "", "?" + params.toString())
        setSession({ room: roomId, username })
    }

    if (!session) return <Landing onJoin={handleJoin} />
    return <CollaboratorEditor roomId={session.room} username={session.username} />
}

export default App