# Build stage
FROM node:19.5.0-alpine as builder

WORKDIR /app

COPY package.json ./

RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=cache,target=/root/.npm \
    npm install

COPY . .

RUN npm run build

# Production stage
FROM node:19.5.0-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/build ./build

EXPOSE 3002

CMD ["serve", "-s", "build", "-l", "3002"]
