/**
 * test-ws.js — Automated WebSocket test client for UGV Dashboard
 * 
 * Tests: auth → telemetry reception → manual_cmd → set_waypoint → disconnect
 */
const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3000';
const PASS = 0;
const FAIL = 1;
let exitCode = PASS;

function log(icon, msg) { console.log(`${icon}  ${msg}`); }
function pass(msg) { log('✅', msg); }
function fail(msg) { log('❌', msg); exitCode = FAIL; }

const WAYPOINT_PAYLOAD = {
    type: 'set_waypoint',
    data: {
        header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'map' },
        pose: {
            position: { x: 30.12345, y: 31.54321, z: 0.0 },
            orientation: { x: 0.0, y: 0.0, z: 0.707, w: 0.707 },
        },
    },
};

async function runTests() {
    log('🔌', `Connecting to ${WS_URL}...`);

    const ws = new WebSocket(WS_URL);

    const received = [];
    let resolveNext;

    // Collect messages and resolve promises
    ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        received.push(msg);
        if (resolveNext) { resolveNext(msg); resolveNext = null; }
    });

    // Wait for next message with timeout
    function waitForMsg(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeoutMs);
            resolveNext = (msg) => { clearTimeout(timer); resolve(msg); };
        });
    }

    // Wait for open
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });
    pass('WebSocket connected');

    // ── Test 1: Authentication ─────────────────────────────────────
    log('🔑', 'Sending auth...');
    ws.send(JSON.stringify({ type: 'auth', data: { username: 'admin', password: 'admin123' } }));
    const authReply = await waitForMsg();
    if (authReply.type === 'auth_ok') {
        pass(`Auth OK: "${authReply.message}"`);
    } else {
        fail(`Auth failed: ${JSON.stringify(authReply)}`);
        ws.close();
        process.exit(FAIL);
    }

    // ── Test 2: Telemetry reception ────────────────────────────────
    log('📡', 'Waiting for telemetry broadcast (max 3s)...');
    const telem = await waitForMsg(3000);
    if (telem.type === 'telemetry' && telem.data) {
        const d = telem.data;
        const fields = ['batteryPercent', 'batteryVoltage', 'speed', 'heading',
            'gps', 'componentsTemp', 'leftMotorCurrent',
            'rightMotorCurrent', 'rpiCurrent', 'latency'];
        const missing = fields.filter((f) => d[f] === undefined);
        if (missing.length === 0) {
            pass(`Telemetry received — all ${fields.length} fields present`);
            log('📊', `  Battery: ${d.batteryPercent}% | Speed: ${d.speed} m/s | GPS: (${d.gps.lat}, ${d.gps.lng}) | Latency: ${d.latency}ms`);
        } else {
            fail(`Telemetry missing fields: ${missing.join(', ')}`);
        }
    } else {
        fail(`Expected telemetry, got: ${JSON.stringify(telem)}`);
    }

    // ── Test 3: Manual command ─────────────────────────────────────
    log('🎮', 'Sending manual_cmd (forward)...');
    ws.send(JSON.stringify({ type: 'manual_cmd', data: { direction: 'forward' } }));
    const cmdReply = await waitForMsg();
    if (cmdReply.type === 'cmd_ack') {
        pass(`Command ACK: "${cmdReply.message}"`);
    } else if (cmdReply.type === 'telemetry') {
        // Might get a telemetry tick before the ACK, try once more
        const cmdReply2 = await waitForMsg();
        if (cmdReply2.type === 'cmd_ack') {
            pass(`Command ACK: "${cmdReply2.message}"`);
        } else {
            fail(`Expected cmd_ack, got: ${cmdReply2.type}`);
        }
    } else {
        fail(`Expected cmd_ack, got: ${JSON.stringify(cmdReply)}`);
    }

    // ── Test 4: Set waypoint (ROS2 PoseStamped) ────────────────────
    log('📍', 'Sending set_waypoint (ROS2 PoseStamped)...');
    ws.send(JSON.stringify(WAYPOINT_PAYLOAD));
    // Drain any telemetry ticks until we get waypoint_ack
    let wpAck = null;
    for (let i = 0; i < 5; i++) {
        const msg = await waitForMsg();
        if (msg.type === 'waypoint_ack') { wpAck = msg; break; }
    }
    if (wpAck) {
        pass(`Waypoint ACK: "${wpAck.message}"`);
    } else {
        fail('Did not receive waypoint_ack within 5 messages');
    }

    // ── Test 5: Graceful disconnect ────────────────────────────────
    ws.close();
    pass('Disconnected gracefully');

    // ── Summary ────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(50));
    if (exitCode === PASS) {
        log('🎉', 'ALL TESTS PASSED');
    } else {
        log('💥', 'SOME TESTS FAILED');
    }
    console.log('═'.repeat(50));

    process.exit(exitCode);
}

runTests().catch((err) => {
    fail(`Unhandled error: ${err.message}`);
    process.exit(FAIL);
});
