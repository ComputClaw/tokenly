VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
DATE    ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

LDFLAGS = -ldflags "-s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)"

BINDIR = bin

.PHONY: build test clean lint fmt build-all

## Build launcher and worker for current platform
build:
	go build $(LDFLAGS) -o $(BINDIR)/tokenly-launcher ./cmd/launcher
	go build $(LDFLAGS) -o $(BINDIR)/tokenly-worker ./cmd/worker

## Run all tests
test:
	go test ./...

## Run all tests with verbose output
test-v:
	go test -v ./...

## Remove build artifacts
clean:
	rm -rf $(BINDIR)

## Run golangci-lint
lint:
	golangci-lint run ./...

## Format code
fmt:
	gofmt -w .

## Cross-compile for all platforms
build-all: build-linux build-windows build-darwin

## Build for Linux
build-linux:
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-launcher-linux-x64 ./cmd/launcher
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-worker-linux-x64 ./cmd/worker
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-launcher-linux-arm64 ./cmd/launcher
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-worker-linux-arm64 ./cmd/worker

## Build for Windows
build-windows:
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-launcher-windows-x64.exe ./cmd/launcher
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-worker-windows-x64.exe ./cmd/worker

## Build for macOS
build-darwin:
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-launcher-darwin-x64 ./cmd/launcher
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-worker-darwin-x64 ./cmd/worker
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-launcher-darwin-arm64 ./cmd/launcher
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(BINDIR)/tokenly-worker-darwin-arm64 ./cmd/worker
