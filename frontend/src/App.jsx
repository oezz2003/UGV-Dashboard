import { useState, useRef, useCallback, useEffect } from 'react';

/* ── Static ROS2 route (set_route) ────────────────────────────────────── */
const STATIC_ROUTE = {
    type: 'set_route',
    data: {
        route: [
            {
                header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'map' },
                pose: { position: { x: 0.0, y: 0.0, z: 0.0 }, orientation: { x: 0.0, y: 0.0, z: 0.998, w: 0.060 } },
            },
            {
                header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'map' },
                pose: { position: { x: -13.84, y: 1.11, z: 0.0 }, orientation: { x: 0.0, y: 0.0, z: -0.858, w: 0.513 } },
            },
            {
                header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'map' },
                pose: { position: { x: -28.36, y: -26.02, z: 0.0 }, orientation: { x: 0.0, y: 0.0, z: -0.864, w: 0.503 } },
            },
            {
                header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'map' },
                pose: { position: { x: -62.68, y: -86.51, z: 0.0 }, orientation: { x: 0.0, y: 0.0, z: -0.916, w: 0.401 } },
            },
            {
                header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'map' },
                pose: { position: { x: -117.28, y: -145.67, z: 0.0 }, orientation: { x: 0.0, y: 0.0, z: -0.998, w: 0.062 } },
            },
            {
                header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'map' },
                pose: { position: { x: -127.08, y: -146.89, z: 0.0 }, orientation: { x: 0.0, y: 0.0, z: -0.998, w: 0.062 } },
            },
        ],
    },
};

/* ── Helpers ─────────────────────────────────────────────────────── */
function wsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // In dev (Vite) we talk to the same host; in prod Express serves us
    return `${proto}://${window.location.host}`;
}

/* ================================================================ */
/*  App                                                              */
/* ================================================================ */
export default function App() {
    const [screen, setScreen] = useState('login');   // login | dashboard
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState('Disconnected');
    const [logs, setLogs] = useState([]);        // [{time, msg}]
    const [telemetry, setTelemetry] = useState(null);      // latest reading

    const wsRef = useRef(null);

    // ── Add a log entry (keep last 60) ────────────────────────────────
    const addLog = useCallback((msg) => {
        setLogs((prev) => [
            { time: new Date().toLocaleTimeString(), msg },
            ...prev,
        ].slice(0, 60));
    }, []);

    // ── Send JSON over WS ────────────────────────────────────────────
    const send = useCallback((obj) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(obj));
        }
    }, []);

    // ── Connect & Authenticate ───────────────────────────────────────
    const handleLogin = (e) => {
        e.preventDefault();
        setStatus('Connecting…');

        const ws = new WebSocket(wsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus('Authenticating…');
            ws.send(JSON.stringify({ type: 'auth', data: { username, password } }));
        };

        ws.onmessage = (evt) => {
            let msg;
            try { msg = JSON.parse(evt.data); } catch { return; }

            switch (msg.type) {
                case 'auth_ok':
                    setStatus('Connected ✅');
                    setScreen('dashboard');
                    addLog('Authenticated successfully');
                    break;
                case 'auth_fail':
                    setStatus('Auth failed ❌');
                    addLog(`Auth failed: ${msg.message}`);
                    ws.close();
                    break;
                case 'telemetry':
                    setTelemetry(msg.data);
                    break;
                case 'cmd_ack':
                case 'waypoint_ack':
                    addLog(`Server: ${msg.message}`);
                    break;
                case 'session_kicked':
                    setStatus('Kicked ⚠️');
                    setScreen('login');
                    addLog(`Session ended: ${msg.message}`);
                    break;
                case 'error':
                    addLog(`Error: ${msg.message}`);
                    break;
                default:
                    addLog(`Unknown: ${JSON.stringify(msg)}`);
            }
        };

        ws.onclose = () => {
            setStatus('Disconnected');
        };

        ws.onerror = () => {
            setStatus('Connection error ❌');
            addLog('WebSocket error');
        };
    };

    // ── Cleanup on unmount ────────────────────────────────────────────
    useEffect(() => {
        return () => wsRef.current?.close();
    }, []);

    // ── Disconnect button ─────────────────────────────────────────────
    const handleDisconnect = () => {
        wsRef.current?.close();
        setScreen('login');
        setTelemetry(null);
        setStatus('Disconnected');
    };

    /* ================================================================ */
    /*  LOGIN SCREEN                                                     */
    /* ================================================================ */
    if (screen === 'login') {
        return (
            <div className="app">
                <div className="login-card">
                    <div className="login-logo">⬡</div>
                    <h1>UGV Dashboard</h1>
                    <p className="login-sub">Test Build — Sign In</p>
                    <form onSubmit={handleLogin}>
                        <input
                            id="input-username"
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                            required
                        />
                        <input
                            id="input-password"
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                        <button id="btn-login" type="submit" className="btn-primary">
                            Connect
                        </button>
                    </form>
                    <span className="status-badge">{status}</span>
                </div>
            </div>
        );
    }

    /* ================================================================ */
    /*  DASHBOARD SCREEN                                                 */
    /* ================================================================ */
    return (
        <div className="app">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <header className="header">
                <div className="header-left">
                    <span className="logo">⬡</span>
                    <h1>UGV Dashboard</h1>
                    <span className={`status-dot ${status.includes('✅') ? 'green' : 'red'}`} />
                    <span className="status-text">{status}</span>
                </div>
                <button id="btn-disconnect" className="btn-disconnect" onClick={handleDisconnect}>
                    Disconnect
                </button>
            </header>

            <main className="main">
                {/* ── Controls ───────────────────────────────────────────────── */}
                <section className="panel controls-panel">
                    <h2>Manual Control</h2>

                    <div className="dpad">
                        <button
                            id="btn-forward"
                            className="dpad-btn up"
                            onClick={() => {
                                send({ type: 'manual_cmd', data: { direction: 'forward' } });
                                addLog('Sent: forward');
                            }}
                        >▲<br /><span>FWD</span></button>

                        <button
                            id="btn-left"
                            className="dpad-btn left"
                            onClick={() => {
                                send({ type: 'manual_cmd', data: { direction: 'left' } });
                                addLog('Sent: left');
                            }}
                        >◄<br /><span>LEFT</span></button>

                        <div className="dpad-center" />

                        <button
                            id="btn-right"
                            className="dpad-btn right"
                            onClick={() => {
                                send({ type: 'manual_cmd', data: { direction: 'right' } });
                                addLog('Sent: right');
                            }}
                        >►<br /><span>RIGHT</span></button>

                        <button
                            id="btn-backward"
                            className="dpad-btn down"
                            onClick={() => {
                                send({ type: 'manual_cmd', data: { direction: 'backward' } });
                                addLog('Sent: backward');
                            }}
                        >▼<br /><span>BWD</span></button>
                    </div>

                    <button
                        id="btn-waypoint"
                        className="btn-waypoint"
                        onClick={() => {
                            send(STATIC_ROUTE);
                            addLog('Sent: set_route (6 ROS2 PoseStamped waypoints)');
                        }}
                    >
                        📍 Send Route (6 Waypoints)
                    </button>
                </section>

                {/* ── Telemetry ──────────────────────────────────────────────── */}
                <section className="panel telemetry-panel">
                    <h2>Live Telemetry</h2>
                    {telemetry ? (
                        <div className="telem-grid">
                            <TItem label="Battery" value={`${telemetry.batteryPercent}%`} accent={telemetry.batteryPercent < 20 ? 'red' : 'green'} />
                            <TItem label="Voltage" value={`${telemetry.batteryVoltage} V`} />
                            <TItem label="Speed" value={`${telemetry.speed} m/s`} />
                            <TItem label="Heading" value={`${telemetry.heading}°`} />
                            <TItem label="GPS Lat" value={telemetry.gps.lat} />
                            <TItem label="GPS Lng" value={telemetry.gps.lng} />
                            <TItem label="Temp" value={`${telemetry.componentsTemp} °C`} accent={telemetry.componentsTemp > 60 ? 'red' : ''} />
                            <TItem label="L Motor" value={`${telemetry.leftMotorCurrent} A`} />
                            <TItem label="R Motor" value={`${telemetry.rightMotorCurrent} A`} />
                            <TItem label="RPi Current" value={`${telemetry.rpiCurrent} A`} />
                            <TItem label="Latency" value={`${telemetry.latency} ms`} accent={telemetry.latency > 80 ? 'yellow' : ''} />
                        </div>
                    ) : (
                        <p className="muted">Waiting for telemetry…</p>
                    )}
                </section>

                {/* ── Log ────────────────────────────────────────────────────── */}
                <section className="panel log-panel">
                    <h2>Event Log</h2>
                    <div className="log-scroll">
                        {logs.length === 0 && <p className="muted">No events yet.</p>}
                        {logs.map((l, i) => (
                            <div key={i} className="log-entry">
                                <span className="log-time">{l.time}</span>
                                <span className="log-msg">{l.msg}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}

/* ── Telemetry item component ────────────────────────────────────── */
function TItem({ label, value, accent = '' }) {
    return (
        <div className={`telem-item ${accent}`}>
            <span className="telem-label">{label}</span>
            <span className="telem-value">{value}</span>
        </div>
    );
}
