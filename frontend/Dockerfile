# syntax=docker/dockerfile:1
# ---------- Stage 1: build Angular ----------
FROM node:20-alpine AS build
WORKDIR /app
# Giới hạn heap Node để không bị OOM trên máy 1 GB RAM (đã có swap 4 GB hỗ trợ)
ENV NODE_OPTIONS=--max-old-space-size=768
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Yêu cầu package.json có script "build": "ng build"
RUN npm run build -- --configuration production

# ---------- Stage 2: Nginx phục vụ file tĩnh + reverse proxy ----------
FROM nginx:1.27-alpine
# Angular >= 17 (builder application) xuất ra dist/<tên-project>/browser.
# Angular cũ hơn xuất ra dist/<tên-project>: bỏ "/browser" ở dòng dưới.
COPY --from=build /app/dist/*/browser /usr/share/nginx/html
# default.conf.template được mount từ docker-compose.yml vào /etc/nginx/templates/
EXPOSE 80 443
