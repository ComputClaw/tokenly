package worker

import (
	"fmt"
	"log/slog"
	"math"
	"sort"
	"time"

	"github.com/ComputClaw/tokenly-client/internal/config"
)

// Learner tracks directory success rates and provides prioritized scan paths.
type Learner struct {
	data     *config.LearningFile
	savePath string
	logger   *slog.Logger
}

// NewLearner loads existing learning data from savePath or creates an empty set.
func NewLearner(savePath string, logger *slog.Logger) (*Learner, error) {
	data, err := config.LoadLearning(savePath)
	if err != nil {
		return nil, fmt.Errorf("load learning data: %w", err)
	}
	return &Learner{
		data:     data,
		savePath: savePath,
		logger:   logger,
	}, nil
}

// UpdateAfterScan updates directory statistics after a scan of dirPath found filesFound files.
func (l *Learner) UpdateAfterScan(dirPath string, filesFound int) {
	stats, exists := l.data.Directories[dirPath]
	if !exists {
		stats = &config.DirectoryStats{Path: dirPath}
		l.data.Directories[dirPath] = stats
	}

	stats.ScanCount++
	stats.FileCount += filesFound

	if filesFound > 0 {
		stats.LastSuccess = time.Now().UTC().Format(time.RFC3339)
		l.removeFromNegativeCache(dirPath)
	} else if stats.ScanCount >= 5 && stats.FileCount == 0 {
		l.addToNegativeCache(dirPath)
	}

	if stats.ScanCount > 0 {
		stats.SuccessRate = float64(stats.FileCount) / float64(stats.ScanCount)
	}

	l.data.LastUpdated = time.Now().UTC().Format(time.RFC3339)
}

// GetPriorityPaths returns directory paths sorted by score (descending),
// excluding negative-cached paths.
func (l *Learner) GetPriorityPaths() []string {
	type scored struct {
		path  string
		score float64
	}

	var paths []scored
	for path, stats := range l.data.Directories {
		if l.IsNegativeCached(path) {
			continue
		}
		paths = append(paths, scored{path: path, score: l.Score(stats)})
	}

	sort.Slice(paths, func(i, j int) bool {
		return paths[i].score > paths[j].score
	})

	result := make([]string, len(paths))
	for i, p := range paths {
		result[i] = p.path
	}
	return result
}

// IsNegativeCached returns true if the path is in the negative cache.
func (l *Learner) IsNegativeCached(path string) bool {
	for _, p := range l.data.NegativeCache {
		if p == path {
			return true
		}
	}
	return false
}

// Score calculates a priority score for the given directory stats.
func (l *Learner) Score(stats *config.DirectoryStats) float64 {
	return stats.SuccessRate * recencyMultiplier(stats.LastSuccess)
}

// Save persists the learning data to disk.
func (l *Learner) Save() error {
	if err := l.data.Save(l.savePath); err != nil {
		return fmt.Errorf("save learning data: %w", err)
	}
	return nil
}

// recencyMultiplier returns a value between 0.1 and 1.0 based on how recently
// a directory yielded files. 1.0 within 24h, linear decay to 0.1 over 30 days.
func recencyMultiplier(lastSuccess string) float64 {
	if lastSuccess == "" {
		return 0.1
	}

	t, err := time.Parse(time.RFC3339, lastSuccess)
	if err != nil {
		return 0.1
	}

	hours := time.Since(t).Hours()
	if hours <= 24 {
		return 1.0
	}

	maxHours := 30.0 * 24.0 // 30 days
	if hours >= maxHours {
		return 0.1
	}

	// Linear decay from 1.0 at 24h to 0.1 at 30d.
	fraction := (hours - 24) / (maxHours - 24)
	return math.Max(0.1, 1.0-fraction*0.9)
}

func (l *Learner) addToNegativeCache(path string) {
	if !l.IsNegativeCached(path) {
		l.data.NegativeCache = append(l.data.NegativeCache, path)
	}
}

func (l *Learner) removeFromNegativeCache(path string) {
	filtered := l.data.NegativeCache[:0]
	for _, p := range l.data.NegativeCache {
		if p != path {
			filtered = append(filtered, p)
		}
	}
	l.data.NegativeCache = filtered
}
