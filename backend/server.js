require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const mongoose = require('mongoose');

const Telemetry = require('./models/Telemetry');
const { generateTelemetry } = require('./simulator/telemetrySimulator');

// ── Config ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ugv_dashboard';
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'admin123';

// ── Express (serves React build) ─────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Serve React production build
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(FRONTEND_DIR));
app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── MongoDB ──────────────────────────────────────────────────────────
mongoose
    .connect(MONGO_URI)
    .then(() => console.log('✅  MongoDB connected'))
    .catch((err) => console.error('❌  MongoDB connection error:', err.message));

// ── WebSocket ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

// Track single active session
let activeSession = null;   // { ws, interval }

function clearActiveSession() {
    if (activeSession) {
        clearInterval(activeSession.interval);
        // Notify old client they were kicked (ignore errors if already closed)
        try {
            activeSession.ws.send(JSON.stringify({
                type: 'session_kicked',
                message: 'Another user has logged in. You have been disconnected.',
            }));
            activeSession.ws.close(4001, 'Session replaced');
        } catch { /* socket may already be gone */ }
        activeSession = null;
    }
}

wss.on('connection', (ws) => {
    console.log('🔌  New WebSocket connection');

    let authenticated = false;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
            return;
        }

        // ── Authentication ──────────────────────────────────────────────
        if (msg.type === 'auth') {
            const { username, password } = msg.data || {};
            if (username === DASHBOARD_USER && password === DASHBOARD_PASS) {
                // Kick any existing session first
                clearActiveSession();

                authenticated = true;

                // Start telemetry broadcast at 1 Hz
                const interval = setInterval(async () => {
                    if (ws.readyState !== ws.OPEN) { clearInterval(interval); return; }
                    const telemetry = generateTelemetry();
                    ws.send(JSON.stringify(telemetry));

                    // Log to MongoDB (fire-and-forget)
                    try { await Telemetry.create(telemetry.data); } catch (e) {
                        console.error('DB log error:', e.message);
                    }
                }, 1000);

                activeSession = { ws, interval };

                ws.send(JSON.stringify({ type: 'auth_ok', message: 'Authenticated' }));
                console.log(`🔑  User "${username}" authenticated`);
            } else {
                ws.send(JSON.stringify({ type: 'auth_fail', message: 'Invalid credentials' }));
                console.log(`🚫  Auth failed for "${username}"`);
            }
            return;
        }

        // ── Require authentication for all other messages ───────────────
        if (!authenticated) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
            return;
        }

        // ── Manual command ──────────────────────────────────────────────
        if (msg.type === 'manual_cmd') {
            console.log(`🎮  Manual command: ${msg.data?.direction}`);
            ws.send(JSON.stringify({
                type: 'cmd_ack',
                message: `Command "${msg.data?.direction}" received`,
            }));
            return;
        }

        // ── Set waypoint (ROS2 PoseStamped) ─────────────────────────────
        if (msg.type === 'set_waypoint') {
            console.log('📍  Waypoint received:', JSON.stringify(msg.data, null, 2));
            ws.send(JSON.stringify({
                type: 'waypoint_ack',
                message: 'Waypoint set successfully',
            }));
            return;
        }

        // ── Unknown message ─────────────────────────────────────────────
        ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${msg.type}` }));
    });

    ws.on('close', () => {
        console.log('🔌  WebSocket disconnected');
        if (activeSession?.ws === ws) {
            clearInterval(activeSession.interval);
            activeSession = null;
        }
    });

    ws.on('error', (err) => console.error('WS error:', err.message));
});

// ── Start server ─────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`🚀  UGV Dashboard server running on http://localhost:${PORT}`);
});
