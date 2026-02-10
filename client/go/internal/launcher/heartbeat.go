package launcher

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/ComputClaw/tokenly-client/internal/config"
)

// HeartbeatRequest matches the protocol spec heartbeat request contract.
type HeartbeatRequest struct {
	ClientHostname  string          `json:"client_hostname"`
	Timestamp       string          `json:"timestamp"`
	LauncherVersion string          `json:"launcher_version"`
	WorkerVersion   string          `json:"worker_version"`
	WorkerStatus    string          `json:"worker_status"`
	SystemInfo      SystemInfo      `json:"system_info"`
	Stats           *HeartbeatStats `json:"stats,omitempty"`
}

// SystemInfo describes the client machine.
type SystemInfo struct {
	OS       string `json:"os"`
	Arch     string `json:"arch"`
	Platform string `json:"platform,omitempty"`
}

// HeartbeatStats contains optional operational statistics.
type HeartbeatStats struct {
	FilesUploadedToday       int    `json:"files_uploaded_today,omitempty"`
	LastScanTime             string `json:"last_scan_time,omitempty"`
	DirectoriesMonitored     int    `json:"directories_monitored,omitempty"`
	ErrorsSinceLastHeartbeat int    `json:"errors_since_last_heartbeat,omitempty"`
}

// HeartbeatResponse matches the server's heartbeat response contract.
type HeartbeatResponse struct {
	ClientID          string               `json:"client_id"`
	Approved          bool                 `json:"approved"`
	Config            *config.ClientConfig `json:"config,omitempty"`
	Update            *UpdateInfo          `json:"update,omitempty"`
	ServerTime        string               `json:"server_time"`
	Message           string               `json:"message,omitempty"`
	RetryAfterSeconds int                  `json:"retry_after_seconds,omitempty"`
}

// UpdateInfo describes an available software update.
type UpdateInfo struct {
	Enabled            bool   `json:"enabled"`
	Available          bool   `json:"available"`
	Version            string `json:"version"`
	DownloadURL        string `json:"download_url"`
	Checksum           string `json:"checksum"`
	Required           bool   `json:"required"`
	CheckIntervalHours int    `json:"check_interval_hours"`
	ReleaseNotes       string `json:"release_notes"`
}

// HeartbeatSender is the interface for sending heartbeats (mockable in tests).
type HeartbeatSender interface {
	SendHeartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, int, error)
}

// HeartbeatClient sends heartbeat requests to the server.
type HeartbeatClient struct {
	serverURL  string
	httpClient *http.Client
	logger     *slog.Logger
}

// NewHeartbeatClient creates a HeartbeatClient pointing at the given server URL.
func NewHeartbeatClient(serverURL string, logger *slog.Logger) *HeartbeatClient {
	return &HeartbeatClient{
		serverURL: serverURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger: logger,
	}
}

// SendHeartbeat POSTs a heartbeat to {server}/api/heartbeat and returns the
// parsed response, HTTP status code, and any error.
func (c *HeartbeatClient) SendHeartbeat(ctx context.Context, req *HeartbeatRequest) (*HeartbeatResponse, int, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, 0, fmt.Errorf("marshal heartbeat request: %w", err)
	}

	url := c.serverURL + "/api/heartbeat"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, fmt.Errorf("create heartbeat request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	c.logger.Debug("sending heartbeat", "url", url)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, 0, fmt.Errorf("send heartbeat: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read heartbeat response: %w", err)
	}

	c.logger.Debug("heartbeat response", "status", resp.StatusCode, "body_len", len(respBody))

	var hbResp HeartbeatResponse
	if err := json.Unmarshal(respBody, &hbResp); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("parse heartbeat response: %w", err)
	}

	return &hbResp, resp.StatusCode, nil
}
