FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite reads these at build time; they end up in the bundle, so never pass secrets.
ARG VITE_APP_TITLE="RPP Client"
ARG VITE_RPP_BASE_URL=""
ENV VITE_APP_TITLE=$VITE_APP_TITLE VITE_RPP_BASE_URL=$VITE_RPP_BASE_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
