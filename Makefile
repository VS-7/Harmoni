.PHONY: test vet build-web build run compose-up compose-down

test:
	go test -v -race ./...

vet:
	go vet ./...

build-web:
	cd web && npm run build

build:
	go build -ldflags="-s -w" -o bin/harmoni ./cmd/server

run:
	go run ./cmd/server

compose-up:
	docker compose up --build -d

compose-down:
	docker compose down
