/**
 * Telemetry Simulator
 * --------------------
 * Generates realistic-looking dummy telemetry for the UGV test build.
 * State persists across calls so values drift naturally rather than
 * jumping randomly every tick.
 */

// ── helpers ──────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const drift = (v, range) => v + (Math.random() - 0.5) * 2 * range;
const round = (v, d = 2) => +v.toFixed(d);

// ── persistent state ─────────────────────────────────────────────────
let state = {
    batteryPercent: 85,
    batteryVoltage: 12.4,
    speed: 0,
    heading: 0,
    lat: 30.0444,   // Cairo, Egypt (default start)
    lng: 31.2357,
    componentsTemp: 38,
    leftMotorCurrent: 0,
    rightMotorCurrent: 0,
    rpiCurrent: 0.8,
};

/**
 * Returns a fresh telemetry reading and mutates internal state.
 */
function generateTelemetry() {
    // Battery slowly drains
    state.batteryPercent = clamp(drift(state.batteryPercent, 0.15), 0, 100);
    state.batteryVoltage = clamp(9.0 + (state.batteryPercent / 100) * 3.6, 9.0, 12.6);

    // Speed fluctuates 0 – 3 m/s
    state.speed = clamp(drift(state.speed, 0.3), 0, 3);

    // Heading drifts
    state.heading = (state.heading + (Math.random() - 0.5) * 5 + 360) % 360;

    // GPS drifts very slightly
    state.lat = drift(state.lat, 0.00002);
    state.lng = drift(state.lng, 0.00002);

    // Component temperature
    state.componentsTemp = clamp(drift(state.componentsTemp, 0.5), 25, 75);

    // Motor currents proportional to speed + noise
    state.leftMotorCurrent = clamp(state.speed * 1.2 + (Math.random() - 0.5) * 0.3, 0, 5);
    state.rightMotorCurrent = clamp(state.speed * 1.2 + (Math.random() - 0.5) * 0.3, 0, 5);

    // RPi current fairly stable
    state.rpiCurrent = clamp(drift(state.rpiCurrent, 0.05), 0.4, 1.5);

    // Simulated network latency 15-120 ms
    const latency = clamp(15 + Math.random() * 40, 10, 120);

    return {
        type: 'telemetry',
        data: {
            batteryPercent: round(state.batteryPercent, 1),
            batteryVoltage: round(state.batteryVoltage, 2),
            speed: round(state.speed, 2),
            heading: round(state.heading, 1),
            gps: {
                lat: round(state.lat, 6),
                lng: round(state.lng, 6),
            },
            componentsTemp: round(state.componentsTemp, 1),
            leftMotorCurrent: round(state.leftMotorCurrent, 2),
            rightMotorCurrent: round(state.rightMotorCurrent, 2),
            rpiCurrent: round(state.rpiCurrent, 2),
            latency: round(latency, 0),
        },
        timestamp: new Date().toISOString(),
    };
}

module.exports = { generateTelemetry };
