package internals

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/sirupsen/logrus"
)

type Envelope struct {
	TraceID string `json:traceID`
	Type    string `json:type`
	Payload json.RawMessage `json:payload`
}

type TelemetryHub struct {
	mu sync.RWMutex
	clients map[*websocket.Conn]struct{}
	log *logrus.Logger
}

func NewTelemtryHub(log *logrus.Logger) *TelemetryHub {
	return &TelemetryHub{
		clients: make(map[*websocket.Conn]struct{}),
		log: log,
	}
}

func (h *TelemetryHub) HandleWs(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w,r,&websocket.AcceptOptions{
		OriginPatterns: []string{"localhost:*", "127.0.0.1:*"},
	})

	if err != nil {
		h.log.WithError(err).Error("Failed to upgrade WebSocket connection")
		return
	}

	defer conn.CloseNow()

	conn.SetReadLimit(65536)

	h.register(conn)
	defer h.unregister(conn)

	ctx := r.Context()
	for {
		_, rawBytes, err := conn.Read(ctx)

		if err != nil {
			h.log.WithError(err).Debug("Client disconnected from Telemetry Hub")
			return
		}

		var env Envelope
		if err := json.Unmarshal(rawBytes,&env); err != nil {
			h.log.WithError(err).Warn("Dropped malformed JSON frame")
			return
		}

		switch env.Type {
		case "TELEMETRY_INGEST":
			// 1. Repackage as TELEMETRY_BROADCAST for connected UI dashboards
			// 2. Asynchronously push rawBytes to Kafka topic `telemetry.raw.stream` & Redis GEOADD
			broadcastEnv := Envelope{
				TraceID: env.TraceID,
				Type: "TELEMETRY_BROADCAST",
				Payload: env.Payload,
			}

			h.BroadcastJSON(ctx,broadcastEnv)
		
		case "OPERATOR_COMMAND":
			h.log.WithField("traceID",env.TraceID).Info("Received operator command from UI")
			// Forward command down to the target drone's socket & publish to RabbitMQ/Kafka
			h.BroadcastJSON(ctx, env)
		}

		
	}
}

func (h *TelemetryHub) BroadcastJSON(ctx context.Context, env Envelope) {
	bytes, err := json.Marshal(env);

	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		go func(c *websocket.Conn) {
			writeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			defer cancel()
			_ = c.Write(writeCtx, websocket.MessageText, bytes)
		}(client)
	}
}

func (h *TelemetryHub) register(c *websocket.Conn) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *TelemetryHub) unregister(c *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients,c)
	h.mu.Unlock()
}