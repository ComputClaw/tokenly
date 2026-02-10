package worker

import (
	"context"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createTestJSONLFile(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "test.jsonl")
	require.NoError(t, os.WriteFile(path, []byte(`{"line":1}`+"\n"), 0644))
	return path
}

func testMeta() *FileMetadata {
	return &FileMetadata{
		OriginalPath: "/tmp/test.jsonl",
		Directory:    "/tmp",
		Filename:     "test.jsonl",
		SizeBytes:    12,
		ModifiedAt:   "2025-01-15T10:00:00Z",
		CreatedAt:    "2025-01-15T09:00:00Z",
		LineCount:    1,
		FileHash:     "abc123",
	}
}

func TestUpload_Success200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))
	defer srv.Close()

	u := NewUploader(srv.URL, "test-host", testLogger())
	result, err := u.Upload(context.Background(), createTestJSONLFile(t), testMeta())
	require.NoError(t, err)
	assert.True(t, result.ShouldDelete)
	assert.False(t, result.ShouldRetry)
	assert.Equal(t, 200, result.StatusCode)
}

func TestUpload_BadRequest400(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
	}))
	defer srv.Close()

	u := NewUploader(srv.URL, "test-host", testLogger())
	result, err := u.Upload(context.Background(), createTestJSONLFile(t), testMeta())
	require.NoError(t, err)
	assert.False(t, result.ShouldDelete)
	assert.False(t, result.ShouldRetry)
	assert.Equal(t, 400, result.StatusCode)
}

func TestUpload_AuthFailure401(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
	}))
	defer srv.Close()

	u := NewUploader(srv.URL, "test-host", testLogger())
	result, err := u.Upload(context.Background(), createTestJSONLFile(t), testMeta())
	require.NoError(t, err)
	assert.True(t, result.ShouldStopUploads)
	assert.Equal(t, 401, result.StatusCode)
}

func TestUpload_TooLarge413(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(413)
	}))
	defer srv.Close()

	u := NewUploader(srv.URL, "test-host", testLogger())
	result, err := u.Upload(context.Background(), createTestJSONLFile(t), testMeta())
	require.NoError(t, err)
	assert.False(t, result.ShouldRetry)
	assert.False(t, result.ShouldDelete)
	assert.Equal(t, 413, result.StatusCode)
}

func TestUpload_RateLimited429(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(429)
	}))
	defer srv.Close()

	u := NewUploader(srv.URL, "test-host", testLogger())
	result, err := u.Upload(context.Background(), createTestJSONLFile(t), testMeta())
	require.NoError(t, err)
	assert.True(t, result.ShouldRetry)
	assert.Equal(t, 429, result.StatusCode)
	assert.Equal(t, 30*1e9, float64(result.RetryAfter)) // 30 seconds in nanoseconds
}

func TestUpload_ServerError500(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()

	u := NewUploader(srv.URL, "test-host", testLogger())
	result, err := u.Upload(context.Background(), createTestJSONLFile(t), testMeta())
	require.NoError(t, err)
	assert.True(t, result.ShouldRetry)
	assert.Equal(t, 500, result.StatusCode)
}

func TestUpload_NetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close() // Close immediately to simulate network error.

	u := NewUploader(srv.URL, "test-host", testLogger())
	result, err := u.Upload(context.Background(), createTestJSONLFile(t), testMeta())
	require.NoError(t, err) // Network errors are returned in UploadResult, not as error.
	assert.True(t, result.ShouldRetry)
	assert.NotEmpty(t, result.Error)
}

func TestUpload_MultipartStructure(t *testing.T) {
	var receivedParts []string
	var metadataContent string
	var fileContent string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contentType := r.Header.Get("Content-Type")
		mediaType, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			t.Errorf("parse media type: %v", err)
			w.WriteHeader(400)
			return
		}
		assert.Equal(t, "multipart/form-data", mediaType)

		reader := multipart.NewReader(r.Body, params["boundary"])
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Errorf("read part: %v", err)
				break
			}
			receivedParts = append(receivedParts, part.FormName())
			data, _ := io.ReadAll(part)
			if part.FormName() == "metadata" {
				metadataContent = string(data)
			}
			if part.FormName() == "file" {
				fileContent = string(data)
			}
		}
		w.WriteHeader(200)
	}))
	defer srv.Close()

	u := NewUploader(srv.URL, "test-host", testLogger())
	result, err := u.Upload(context.Background(), createTestJSONLFile(t), testMeta())
	require.NoError(t, err)
	assert.Equal(t, 200, result.StatusCode)

	// Verify multipart structure.
	assert.Equal(t, []string{"metadata", "file"}, receivedParts)
	assert.Contains(t, metadataContent, "client_hostname")
	assert.Contains(t, metadataContent, "test-host")
	assert.Contains(t, metadataContent, "file_info")
	assert.Contains(t, fileContent, `{"line":1}`)
}
