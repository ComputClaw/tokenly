package launcher

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ComputClaw/tokenly-client/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func makeTestRequest() *HeartbeatRequest {
	return &HeartbeatRequest{
		ClientHostname:  "test-host",
		Timestamp:       "2026-01-15T10:00:00Z",
		LauncherVersion: "1.0.0",
		WorkerVersion:   "1.0.0",
		WorkerStatus:    "running",
		SystemInfo: SystemInfo{
			OS:   "linux",
			Arch: "x64",
		},
	}
}

func TestHeartbeat_200Approved(t *testing.T) {
	cfg := configForTest()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		json.NewEncoder(w).Encode(HeartbeatResponse{
			ClientID:   "client-123",
			Approved:   true,
			ServerTime: "2026-01-15T10:00:01Z",
			Config:     &cfg,
		})
	}))
	defer srv.Close()

	client := NewHeartbeatClient(srv.URL, testLogger())
	resp, status, err := client.SendHeartbeat(context.Background(), makeTestRequest())

	require.NoError(t, err)
	assert.Equal(t, 200, status)
	assert.True(t, resp.Approved)
	assert.Equal(t, "client-123", resp.ClientID)
	assert.NotNil(t, resp.Config)
}

func TestHeartbeat_202Pending(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(202)
		json.NewEncoder(w).Encode(HeartbeatResponse{
			ClientID:          "client-123",
			Approved:          false,
			ServerTime:        "2026-01-15T10:00:01Z",
			Message:           "Awaiting admin approval",
			RetryAfterSeconds: 120,
		})
	}))
	defer srv.Close()

	client := NewHeartbeatClient(srv.URL, testLogger())
	resp, status, err := client.SendHeartbeat(context.Background(), makeTestRequest())

	require.NoError(t, err)
	assert.Equal(t, 202, status)
	assert.False(t, resp.Approved)
	assert.Equal(t, 120, resp.RetryAfterSeconds)
	assert.Equal(t, "Awaiting admin approval", resp.Message)
}

func TestHeartbeat_403Rejected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(403)
		json.NewEncoder(w).Encode(HeartbeatResponse{
			ClientID:   "client-123",
			Approved:   false,
			ServerTime: "2026-01-15T10:00:01Z",
			Message:    "Client has been rejected",
		})
	}))
	defer srv.Close()

	client := NewHeartbeatClient(srv.URL, testLogger())
	resp, status, err := client.SendHeartbeat(context.Background(), makeTestRequest())

	require.NoError(t, err)
	assert.Equal(t, 403, status)
	assert.False(t, resp.Approved)
	assert.Equal(t, "Client has been rejected", resp.Message)
}

func TestHeartbeat_400BadRequest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(400)
		json.NewEncoder(w).Encode(HeartbeatResponse{
			Message: "Invalid request",
		})
	}))
	defer srv.Close()

	client := NewHeartbeatClient(srv.URL, testLogger())
	resp, status, err := client.SendHeartbeat(context.Background(), makeTestRequest())

	require.NoError(t, err)
	assert.Equal(t, 400, status)
	assert.Equal(t, "Invalid request", resp.Message)
}

func TestHeartbeat_5xxServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(HeartbeatResponse{
			Message: "Internal server error",
		})
	}))
	defer srv.Close()

	client := NewHeartbeatClient(srv.URL, testLogger())
	resp, status, err := client.SendHeartbeat(context.Background(), makeTestRequest())

	require.NoError(t, err)
	assert.Equal(t, 500, status)
	assert.Equal(t, "Internal server error", resp.Message)
	_ = resp
}

func TestHeartbeat_NetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close() // close immediately to simulate network error

	client := NewHeartbeatClient(srv.URL, testLogger())
	resp, status, err := client.SendHeartbeat(context.Background(), makeTestRequest())

	assert.Error(t, err)
	assert.Nil(t, resp)
	assert.Equal(t, 0, status)
}

func TestHeartbeat_RequestJSONMatchesSpec(t *testing.T) {
	var receivedBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/heartbeat", r.URL.Path)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &receivedBody))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		json.NewEncoder(w).Encode(HeartbeatResponse{
			ClientID:   "client-123",
			Approved:   true,
			ServerTime: "2026-01-15T10:00:01Z",
		})
	}))
	defer srv.Close()

	req := &HeartbeatRequest{
		ClientHostname:  "my-host",
		Timestamp:       "2026-01-15T10:00:00Z",
		LauncherVersion: "1.2.3",
		WorkerVersion:   "1.2.3",
		WorkerStatus:    "running",
		SystemInfo: SystemInfo{
			OS:       "linux",
			Arch:     "x64",
			Platform: "Ubuntu 22.04",
		},
		Stats: &HeartbeatStats{
			FilesUploadedToday:       5,
			LastScanTime:             "2026-01-15T09:55:00Z",
			DirectoriesMonitored:     3,
			ErrorsSinceLastHeartbeat: 1,
		},
	}

	client := NewHeartbeatClient(srv.URL, testLogger())
	_, _, err := client.SendHeartbeat(context.Background(), req)
	require.NoError(t, err)

	// Verify protocol spec field names
	assert.Equal(t, "my-host", receivedBody["client_hostname"])
	assert.Equal(t, "2026-01-15T10:00:00Z", receivedBody["timestamp"])
	assert.Equal(t, "1.2.3", receivedBody["launcher_version"])
	assert.Equal(t, "1.2.3", receivedBody["worker_version"])
	assert.Equal(t, "running", receivedBody["worker_status"])

	sysInfo, ok := receivedBody["system_info"].(map[string]any)
	require.True(t, ok, "system_info should be an object")
	assert.Equal(t, "linux", sysInfo["os"])
	assert.Equal(t, "x64", sysInfo["arch"])
	assert.Equal(t, "Ubuntu 22.04", sysInfo["platform"])

	stats, ok := receivedBody["stats"].(map[string]any)
	require.True(t, ok, "stats should be an object")
	assert.Equal(t, float64(5), stats["files_uploaded_today"])
	assert.Equal(t, "2026-01-15T09:55:00Z", stats["last_scan_time"])
	assert.Equal(t, float64(3), stats["directories_monitored"])
	assert.Equal(t, float64(1), stats["errors_since_last_heartbeat"])
}

// configForTest returns a minimal ClientConfig for test assertions.
func configForTest() config.ClientConfig {
	return config.ClientConfig{
		ScanEnabled:           true,
		ScanIntervalMinutes:   60,
		HeartbeatIntervalSecs: 300,
		LogLevel:              "info",
	}
}
