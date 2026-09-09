# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /mahajoni ./...

# ---- Runtime stage ----
FROM alpine:3.20
RUN adduser -D -u 10001 app
USER app
COPY --from=builder /mahajoni /mahajoni
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["/mahajoni"]
