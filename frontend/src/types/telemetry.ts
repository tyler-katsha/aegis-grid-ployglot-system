import type { ActionType } from "./action";
import type { FlightStatus } from "./flight";

export type EnvelopeType = 
    | "TELEMETRY_INGEST" // Upstream: Drone/Simulator -> Go backend
    | "OPERATOR_COMMAND" // Upstream: Command UI -> Go backend
    | "TELEMETRY_BROADCAST" // Downstream: Go backend -> Command UI
    | "ANOMALY_ALERT" // Downstream: Python ML (via Go) -> Command UI
    | "HEARTBEAT_PING" // Bi-directional keepalive
    | "HEARTBEAT_PONG";

export interface TelemetryPayload {
    droneID: string;
    latitude: number;
    longitude: number;
    altitudeMeters: number;
    speedMps: number;
    batteryVoltage: number;
    batteryPercent: number;
    headingDegrees: number;
    status: FlightStatus;
    timestampUnixMs: number;
}

export interface OperatorCommandPayload {
    targetDroneID: string;
    action: ActionType;
    targetLat?: number;
    targetLng?: number;
    targetAltitude?: number;
    velocityVector?: {vx : number; vy: number; vz: number;};
    issuedAtUnixMs: number;
}

export interface AnomalyAlertPayload {
    alertID: string;
    droneID: string;
    severity: "WARNING" | "CRITICAL";
    reason: string;
    confidenceScore: number;
    recommendedAction: string;
    detectedAtUnixMs: number;
}

export interface WsEnvelope<T = unknown> {
    traceID: string;
    type: EnvelopeType;
    payload: T;
}