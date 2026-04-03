const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema({
  batteryPercent:     { type: Number, required: true },
  batteryVoltage:     { type: Number, required: true },
  speed:              { type: Number, required: true },        // m/s
  heading:            { type: Number, required: true },        // degrees
  gps: {
    lat:              { type: Number, required: true },
    lng:              { type: Number, required: true },
  },
  componentsTemp:     { type: Number, required: true },        // °C
  leftMotorCurrent:   { type: Number, required: true },        // A
  rightMotorCurrent:  { type: Number, required: true },        // A
  rpiCurrent:         { type: Number, required: true },        // A
  latency:            { type: Number, required: true },        // ms
  timestamp:          { type: Date,   default: Date.now },
});

module.exports = mongoose.model('Telemetry', telemetrySchema);
