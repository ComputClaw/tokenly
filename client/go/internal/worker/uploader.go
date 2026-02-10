package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// FileMetadata describes the file being uploaded.
type FileMetadata struct {
	OriginalPath string `json:"original_path"`
	Directory    string `json:"directory"`
	Filename     string `json:"filename"`
	SizeBytes    int64  `json:"size_bytes"`
	ModifiedAt   string `json:"modified_at"`
	CreatedAt    string `json:"created_at"`
	LineCount    int    `json:"line_count"`
	FileHash     string `json:"file_hash"`
}

// UploadResult describes the outcome of a single upload attempt.
type UploadResult struct {
	StatusCode        int
	ShouldDelete      bool
	ShouldRetry       bool
	ShouldStopUploads bool
	RetryAfter        time.Duration
	Error             string
}

// Uploader sends files to the server's ingest endpoint.
type Uploader struct {
	serverURL  string
	hostname   string
	httpClient *http.Client
	logger     *slog.Logger
}

// NewUploader creates an Uploader for the given server.
func NewUploader(serverURL, hostname string, logger *slog.Logger) *Uploader {
	return &Uploader{
		serverURL: serverURL,
		hostname:  hostname,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
		logger: logger,
	}
}

// Upload sends a file to the server with its metadata.
func (u *Uploader) Upload(ctx context.Context, filePath string, meta *FileMetadata) (*UploadResult, error) {
	// Build multipart body.
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Part 1: metadata JSON field.
	metadataPayload := map[string]any{
		"client_hostname": u.hostname,
		"collected_at":    time.Now().UTC().Format(time.RFC3339),
		"file_info": map[string]any{
			"original_path": meta.OriginalPath,
			"directory":     meta.Directory,
			"filename":      meta.Filename,
			"size_bytes":    meta.SizeBytes,
			"modified_at":   meta.ModifiedAt,
			"created_at":    meta.CreatedAt,
			"line_count":    meta.LineCount,
			"file_hash":     meta.FileHash,
		},
	}
	metaJSON, err := json.Marshal(metadataPayload)
	if err != nil {
		return nil, fmt.Errorf("marshal upload metadata: %w", err)
	}
	if err := writer.WriteField("metadata", string(metaJSON)); err != nil {
		return nil, fmt.Errorf("write metadata field: %w", err)
	}

	// Part 2: file content.
	filePart, err := writer.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return nil, fmt.Errorf("create file form part: %w", err)
	}
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open file for upload: %w", err)
	}
	defer f.Close()
	if _, err := io.Copy(filePart, f); err != nil {
		return nil, fmt.Errorf("copy file to multipart: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close multipart writer: %w", err)
	}

	// Build HTTP request.
	url := u.serverURL + "/api/ingest"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &buf)
	if err != nil {
		return nil, fmt.Errorf("create upload request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	u.logger.Debug("uploading file", "path", filePath, "url", url)

	resp, err := u.httpClient.Do(req)
	if err != nil {
		// Network error.
		return &UploadResult{
			ShouldRetry: true,
			Error:       err.Error(),
		}, nil
	}
	defer resp.Body.Close()
	// Drain body to allow connection reuse.
	io.Copy(io.Discard, resp.Body)

	return mapUploadResponse(resp), nil
}

// mapUploadResponse converts an HTTP response to an UploadResult.
func mapUploadResponse(resp *http.Response) *UploadResult {
	result := &UploadResult{StatusCode: resp.StatusCode}

	switch {
	case resp.StatusCode == 200:
		result.ShouldDelete = true
	case resp.StatusCode == 400:
		// Bad request — keep file, no retry.
		result.Error = "server rejected file (400)"
	case resp.StatusCode == 401 || resp.StatusCode == 403:
		result.ShouldStopUploads = true
		result.Error = fmt.Sprintf("authentication error (%d)", resp.StatusCode)
	case resp.StatusCode == 413:
		result.Error = "file too large for server (413)"
	case resp.StatusCode == 429:
		result.ShouldRetry = true
		result.RetryAfter = parseRetryAfter(resp.Header.Get("Retry-After"))
		result.Error = "rate limited (429)"
	case resp.StatusCode >= 500:
		result.ShouldRetry = true
		result.Error = fmt.Sprintf("server error (%d)", resp.StatusCode)
	default:
		result.Error = fmt.Sprintf("unexpected status (%d)", resp.StatusCode)
	}

	return result
}

// parseRetryAfter parses the Retry-After header as seconds.
func parseRetryAfter(val string) time.Duration {
	if val == "" {
		return 60 * time.Second
	}
	secs, err := strconv.Atoi(val)
	if err != nil {
		return 60 * time.Second
	}
	return time.Duration(secs) * time.Second
}
