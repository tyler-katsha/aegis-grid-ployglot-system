import { useState, useEffect } from "react";
import { useAegisFleetSocket } from "../hooks/useAegisFleetSocket";
import type { TelemetryPayload } from "../types/telemetry";
import { WSURL } from "../api/API";

export const AegisCommandCenter = () => {

    const { fleetState, alerts, connectionStatus, sendOperatorCommand, streamTelemetryToBackend } = useAegisFleetSocket({
        wsUrl: WSURL,
        jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dev-operator-token'
    });

    const [selectedDroneID, setSelectedDroneID] = useState<string>("AEGIS-UAV-01");
    const [isStreamingUplink, setIsStreamingUplink] = useState<boolean>(false);

    useEffect(() => {
        if (!isStreamingUplink) return;

        let angle = 0;
        const baseLat = -33.9249; // Sector Center
        const baseLng = 18.4241;

        const intervalId = window.setInterval(() => {
            angle += 0.05;
            const simulatedFrame: TelemetryPayload = {
                droneID: selectedDroneID,
                latitude: Number((baseLat + Math.sin(angle) * 0.012).toFixed(6)),
                longitude: Number((baseLng + Math.cos(angle) * 0.012).toFixed(6)),
                altitudeMeters: Math.round(120 + Math.sin(angle * 2) * 15),
                speedMps: Number((18.5 + Math.cos(angle) * 2.1).toFixed(1)),
                batteryVoltage: Number((22.4 - (angle * 0.02) % 3).toFixed(2)),
                batteryPercent: Math.max(15, Math.round(98 - (angle * 0.5) % 80)),
                headingDegrees: Math.round(((angle * 180) / Math.PI) % 360),
                status: "IN_FLIGHT",
                timestampUnixMs: Date.now(),
            };

            streamTelemetryToBackend(simulatedFrame);
        }, 100);

        return () => clearInterval(intervalId);

    }, [isStreamingUplink, selectedDroneID, streamTelemetryToBackend]);

    const handleEmergencyRTH = (droneId: string) => {
        sendOperatorCommand({
            targetDroneID: droneId,
            action: "RETURN_TO_HOME",
            targetLat: -33.9249,
            targetLng: 18.4241,
            targetAltitude: 60,
            issuedAtUnixMs: Date.now(),
        });
    };

    const activeDrones = Object.values(fleetState);

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", height: "100vh", background: "#0b0f19", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
            < div style={{ padding: "24px", overflowY: "auto" }}>
                <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", borderBottom: "1px solid #1e293b", paddingBottom: "16px" }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: "20px", letterSpacing: "0.05em" }}> AEGISGRID // TACTICAL TELEMETRY MATRIX</h1>
                        < small style={{ color: "#94a3b8" }}> Active Streams: {activeDrones.length} UAVs | Render Rate: 60 FPS Locked </small>
                    </div>

                    < div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <button
                            onClick={() => setIsStreamingUplink((prev) => !prev)}
                            style={{
                                padding: "8px 16px",
                                background: isStreamingUplink ? "#ef4444" : "#10b981",
                                color: "#fff",
                                border: "none",
                                borderRadius: "6px",
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            {isStreamingUplink ? "STOP 10Hz UPLINK STREAM" : "START 10Hz UPLINK STREAM"}
                        </button>
                        < span style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, background: connectionStatus === "CONNECTED" ? "#065f46" : "#7f1d1d" }}>
                            WS: {connectionStatus}
                        </span>
                    </div>
                </header>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                    {
                        activeDrones.map((drone) => (
                            <div
                                key={drone.droneID}
                                style={{
                                    background: "#111827",
                                    border: "1px solid #1f2937",
                                    borderRadius: "8px",
                                    padding: "16px",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                    <strong style={{ color: "#38bdf8" }}> {drone.droneID} </strong>
                                    < span style={{ fontSize: "12px", color: "#a7f3d0" }}> {drone.status} </span>
                                </div>
                                < div style={{ fontSize: "13px", lineHeight: "1.7", fontFamily: "monospace", color: "#cbd5e1" }}>
                                    <div>POS: {drone.latitude}, {drone.longitude} </div>
                                    < div > ALT: {drone.altitudeMeters} m | SPD: {drone.speedMps} m / s </div>
                                    < div > BAT: {drone.batteryPercent}% ({drone.batteryVoltage}V)</div>
                                    < div > HDG: {drone.headingDegrees}°</div>
                                </div>
                                < button
                                    onClick={() => handleEmergencyRTH(drone.droneID)}
                                    style={{
                                        marginTop: "12px",
                                        width: "100%",
                                        padding: "8px",
                                        background: "#1e293b",
                                        color: "#f87171",
                                        border: "1px solid #ef4444",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                    }}
                                >
                                    DISPATCH RETURN - TO - HOME
                                </button>
                            </div>
                        ))}
                </div>
            </div>

            <aside style={{ background: "#0f172a", borderLeft: "1px solid #1e293b", padding: "24px", overflowY: "auto" }}>
                <h2 style={{ fontSize: "16px", marginTop: 0, color: "#f87171" }}> LIVE ANOMALY ALERTS </h2>
                {
                    alerts.length === 0 ? (
                        <p style={{ color: "#64748b", fontSize: "13px" }
                        }> No airspace or hardware anomalies detected.</p>
                    ) : (
                        alerts.map((alert) => (
                            <div
                                key={alert.alertID}
                                style={{
                                    background: "#1e1b4b",
                                    borderLeft: `4px solid ${alert.severity === "CRITICAL" ? "#ef4444" : "#f59e0b"}`,
                                    padding: "12px",
                                    marginBottom: "12px",
                                    borderRadius: "4px",
                                }}
                            >
                                <div style={{ fontWeight: 700, fontSize: "13px" }}> {alert.droneID} // {alert.severity}</div>
                                < div style={{ fontSize: "12px", color: "#cbd5e1", marginTop: "4px" }}> {alert.reason} </div>
                                < div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}> Action: {alert.recommendedAction} </div>
                            </div>
                        ))
                    )}
            </aside>
        </div>
    );
}