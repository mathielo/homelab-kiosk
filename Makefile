.PHONY: web build run image clean tidy

# Build the SPA and stage it where the Go binary embeds it from.
web:
	cd web && npm install && npm run build
	rm -rf server/webdist
	mkdir -p server/webdist
	cp -r web/dist/. server/webdist/
	touch server/webdist/.gitkeep

# Single self-contained binary with the SPA embedded.
build: web
	cd server && go build -trimpath -ldflags "-s -w" -o ../bin/kiosk .

run: build
	./bin/kiosk

image:
	docker build -t homelab-kiosk:dev .

tidy:
	cd server && go mod tidy

clean:
	rm -rf bin web/dist web/node_modules server/webdist
	mkdir -p server/webdist && touch server/webdist/.gitkeep
