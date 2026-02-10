package worker

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCleaner_DeleteFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.jsonl")
	require.NoError(t, os.WriteFile(path, []byte("data"), 0644))

	c := NewCleaner([]string{dir}, testLogger())
	require.NoError(t, c.CleanupFile(path))

	_, err := os.Stat(path)
	assert.True(t, os.IsNotExist(err))
}

func TestCleaner_EmptyParentDirsCleanedUp(t *testing.T) {
	base := t.TempDir()
	nested := filepath.Join(base, "a", "b", "c")
	require.NoError(t, os.MkdirAll(nested, 0755))

	path := filepath.Join(nested, "test.jsonl")
	require.NoError(t, os.WriteFile(path, []byte("data"), 0644))

	// Protect base so cleanup stops there.
	c := NewCleaner([]string{base}, testLogger())
	require.NoError(t, c.CleanupFile(path))

	// File removed.
	_, err := os.Stat(path)
	assert.True(t, os.IsNotExist(err))

	// Empty dirs a/b/c, a/b, a should be removed.
	_, err = os.Stat(filepath.Join(base, "a"))
	assert.True(t, os.IsNotExist(err))

	// Base should still exist (protected).
	_, err = os.Stat(base)
	assert.NoError(t, err)
}

func TestCleaner_NonEmptyParentNotRemoved(t *testing.T) {
	base := t.TempDir()
	subdir := filepath.Join(base, "sub")
	require.NoError(t, os.MkdirAll(subdir, 0755))

	// Create a file in base to make it non-empty after sub is cleaned.
	require.NoError(t, os.WriteFile(filepath.Join(base, "keep.txt"), []byte("keep"), 0644))

	path := filepath.Join(subdir, "test.jsonl")
	require.NoError(t, os.WriteFile(path, []byte("data"), 0644))

	c := NewCleaner(nil, testLogger())
	require.NoError(t, c.CleanupFile(path))

	// subdir is empty and should be removed.
	_, err := os.Stat(subdir)
	assert.True(t, os.IsNotExist(err))

	// base is non-empty and should remain.
	_, err = os.Stat(base)
	assert.NoError(t, err)
}

func TestCleaner_ProtectedPathNotRemoved(t *testing.T) {
	base := t.TempDir()
	protected := filepath.Join(base, "protected")
	nested := filepath.Join(protected, "sub")
	require.NoError(t, os.MkdirAll(nested, 0755))

	path := filepath.Join(nested, "test.jsonl")
	require.NoError(t, os.WriteFile(path, []byte("data"), 0644))

	c := NewCleaner([]string{protected}, testLogger())
	require.NoError(t, c.CleanupFile(path))

	// sub is removed (empty).
	_, err := os.Stat(nested)
	assert.True(t, os.IsNotExist(err))

	// protected is not removed (it's protected).
	_, err = os.Stat(protected)
	assert.NoError(t, err)
}

func TestCleaner_FileDoesNotExist(t *testing.T) {
	c := NewCleaner(nil, testLogger())
	err := c.CleanupFile(filepath.Join(t.TempDir(), "nonexistent.jsonl"))
	assert.NoError(t, err)
}
