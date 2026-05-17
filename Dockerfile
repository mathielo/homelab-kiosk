# syntax=docker/dockerfile:1

# --- stage 1: build the SPA ---------------------------------------------------
FROM node:26.1.0-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# --- stage 2: build the Go binary (SPA embedded) ------------------------------
FROM golang:1.26.3-alpine AS server
WORKDIR /src
COPY server/go.mod server/go.sum* ./server/
RUN cd server && go mod download
COPY server/ ./server/
COPY --from=web /web/dist/ ./server/webdist/
RUN cd server && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/kiosk .

# --- stage 3: minimal runtime ------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /out/kiosk /kiosk
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/kiosk"]
