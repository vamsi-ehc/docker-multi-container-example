# syntax=docker/dockerfile:1

ARG NODE_VERSION=19.5.0

FROM node:${NODE_VERSION}-alpine

# Use production node environment by default.
ENV NODE_ENV production

WORKDIR /usr/src/app

# Download dependencies as a separate step to take advantage of Docker's caching.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=cache,target=/root/.npm \
    npm install

# install nodemon for development
RUN npm install -g nodemon

# Copy the rest of the source files into the image.
COPY . .

# Expose the port the app uses
EXPOSE 3001

# Run the application.
CMD node server.js
