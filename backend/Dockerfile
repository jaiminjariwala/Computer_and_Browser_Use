FROM golang:1.27-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY go.sum ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/cbu-backend ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/cbu-backend /cbu-backend
EXPOSE 8787
ENTRYPOINT ["/cbu-backend"]
