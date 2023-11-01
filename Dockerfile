FROM golang:alpine AS builder

ARG TARGETARCH

RUN apk update && apk add --upgrade --no-cache git nodejs-current yarn upx binutils
RUN go install github.com/GeertJohan/go.rice/rice@latest

ARG APP_NAME="maildebug"
ARG SRC=.
ARG DEST=/${APP_NAME}/

WORKDIR ${DEST}

COPY go.mod .
COPY go.sum .

RUN go mod download

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn

RUN yarn

COPY ${SRC} ${DEST}
RUN yarn build

RUN rice embed-go
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -a -installsuffix cgo -ldflags="-w -s" -o ${APP_NAME}  .

RUN strip --strip-unneeded ${APP_NAME}
RUN upx ${APP_NAME}

FROM scratch

ARG APP_NAME="maildebug"
ENV APP_CMD "./${APP_NAME}"

COPY --from=builder /${APP_NAME}/${APP_NAME} .

CMD [ "./maildebug" ]
