# ===========================
# Stage 1: Build Angular App
# ===========================
FROM node:20-alpine AS build
WORKDIR /app

# 先复制 package 文件以利用 Docker 缓存
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# 复制源代码并构建
COPY . .
RUN npx ng build --configuration docker

# ===========================
# Stage 2: Nginx
# ===========================
FROM nginx:alpine
COPY --from=build /app/dist/TodoList /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
