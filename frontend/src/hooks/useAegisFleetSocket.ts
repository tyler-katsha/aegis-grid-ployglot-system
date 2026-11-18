import { useCallback, useEffect, useRef, useState } from "react";
import type { AnomalyAlertPayload, TelemetryPayload, OperatorCommandPayload, WsEnvelope } from "../types/telemetry";

interface UseAegisSocketOptions {
    wsUrl: string;
    jwtToken: string;
}

export function useAegisFleetSocket({wsUrl, jwtToken}: UseAegisSocketOptions) {
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef<number>(0);

    const fleetBufferRef = useRef<Record<string, TelemetryPayload>>({});
    const isDirtyRef = useRef<boolean>(false);

    const [fleetState,setFleetState] = useState<Record<string, TelemetryPayload>>({});
    const [alerts, setAlerts] = useState<AnomalyAlertPayload[]>([]);
    const [connectionStatus,setConnectionStatus] = useState<"DISCONNECTED" | "CONNECTED" | "CONNECTING">("DISCONNECTED");

    useEffect(() => {
    let animationFrameId: number;

    const syncBufferToUI = () => {
      if (isDirtyRef.current) {
        setFleetState({ ...fleetBufferRef.current });
        isDirtyRef.current = false;
      }
      animationFrameId = requestAnimationFrame(syncBufferToUI);
    };

    animationFrameId = requestAnimationFrame(syncBufferToUI);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("CONNECTING");
    const urlWithAuth = `${wsUrl}?token=${encodeURIComponent(jwtToken)}`;
    const ws = new WebSocket(urlWithAuth);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("CONNECTED");
      reconnectAttemptsRef.current = 0;
      console.info("[AegisGrid WS] Connected to Go Telemetry Gateway");
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const envelope: WsEnvelope = JSON.parse(event.data);

        switch (envelope.type) {
          case "TELEMETRY_BROADCAST": {
            const data = envelope.payload as TelemetryPayload;
            fleetBufferRef.current[data.droneID] = data;
            isDirtyRef.current = true;
            break;
          }
          case "ANOMALY_ALERT": {
            const alert = envelope.payload as AnomalyAlertPayload;
            setAlerts((prev) => [alert, ...prev.slice(0, 49)]);
            break;
          }
          case "HEARTBEAT_PING": {
            ws.send(
              JSON.stringify({
                traceID: envelope.traceID,
                type: "HEARTBEAT_PONG",
                payload: { timestampUnixMs: Date.now() },
              })
            );
            break;
          }
        }
      } catch (err) {
        console.error("[AegisGrid WS] Malformed frame:", err);
      }
    };

    ws.onclose = () => {
      setConnectionStatus("DISCONNECTED");
      const backoffMs = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 15000);
      reconnectAttemptsRef.current += 1;
      console.warn(`[AegisGrid WS] Disconnected. Reconnecting in ${backoffMs}ms...`);
      reconnectTimeoutRef.current = window.setTimeout(connect, backoffMs);
    };

    ws.onerror = (error) => {
      console.error("[AegisGrid WS] Transport error:", error);
      ws.close();
    };
  }, [wsUrl, jwtToken]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  const sendOperatorCommand = useCallback((command: OperatorCommandPayload) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;

    const envelope: WsEnvelope<OperatorCommandPayload> = {
      traceID: crypto.randomUUID(),
      type: "OPERATOR_COMMAND",
      payload: command,
    };
    socketRef.current.send(JSON.stringify(envelope));
    return true;
  }, []);

  const streamTelemetryToBackend = useCallback((telemetry: TelemetryPayload) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;

    const envelope: WsEnvelope<TelemetryPayload> = {
      traceID: crypto.randomUUID(),
      type: "TELEMETRY_INGEST",
      payload: telemetry,
    };
    socketRef.current.send(JSON.stringify(envelope));
    return true;
  }, []);

  return {
    fleetState,
    alerts,
    connectionStatus,
    sendOperatorCommand,
    streamTelemetryToBackend,
  };
}