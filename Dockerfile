### bun
FROM oven/bun:alpine as bun-builder

WORKDIR /tmp
COPY ui ui

RUN bun install --frozen-lockfile

WORKDIR /tmp/ui

RUN bun run build

### golang
FROM golang:alpine AS builder

ARG TARGETARCH

RUN apk update && apk add --upgrade --no-cache git upx binutils
RUN go install github.com/GeertJohan/go.rice/rice@latest

ARG APP_NAME="maildebug"
ARG SRC=.
ARG DEST=/${APP_NAME}/

WORKDIR ${DEST}

COPY --from=bun-builder /tmp/ui/dist ui/dist

COPY api api
COPY session session 
COPY storage storage
COPY types types
COPY main.go go.mod go.sum ./

RUN pwd
RUN ls -la

RUN go mod download

RUN rice embed-go
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -a -installsuffix cgo -ldflags="-w -s" -o ${APP_NAME}  .

RUN strip --strip-unneeded ${APP_NAME}
RUN upx ${APP_NAME}

FROM scratch

ARG APP_NAME="maildebug"
ENV APP_CMD "./${APP_NAME}"

COPY --from=builder /${APP_NAME}/${APP_NAME} .

CMD [ "./maildebug" ]
