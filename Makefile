.PHONY: test vet build-web sync-web build run compose-up compose-down

# Diretório que o go:embed lê. O Dockerfile copia o dist para cá; o build local
# precisa fazer o mesmo, senão o binário embute um frontend antigo.
WEB_DIST := internal/adapters/inbound/http/web/dist

test:
	go test -v -race ./...

vet:
	go vet ./...

build-web:
	cd web && npm run build
	$(MAKE) sync-web

sync-web:
	rm -rf $(WEB_DIST)
	mkdir -p $(WEB_DIST)
	cp -R web/dist/. $(WEB_DIST)/

build:
	go build -ldflags="-s -w" -o bin/harmoni ./cmd/server

run:
	go run ./cmd/server

compose-up:
	docker compose up --build -d

compose-down:
	docker compose down
