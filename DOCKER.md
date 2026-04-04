# TodoList Docker 部署指南

## 📋 目录

- [项目架构](#项目架构)
- [快速开始](#快速开始)
- [三种运行模式](#三种运行模式)
- [本地开发模式 vs 纯 Docker 模式](#本地开发模式-vs-纯-docker-模式)
- [常用命令](#常用命令)
- [默认账号](#默认账号)

---

## 项目架构

```
┌─────────────────────────────────────────────────┐
│                 Docker Compose                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  MySQL 8 │  │ ASP.NET  │  │    Nginx      │  │
│  │  :3306   │◄─│ Core API │◄─│  Angular SPA  │  │
│  │  数据库   │  │  :8080   │  │    :80        │  │
│  └──────────┘  └──────────┘  └───────┬───────┘  │
│                                      │          │
└──────────────────────────────────────┼──────────┘
                                       │
                                  用户浏览器
                              http://localhost
```

| 组件 | 技术栈 | 作用 |
|------|--------|------|
| **数据库** | MySQL 8 | 数据存储 |
| **后端 API** | .NET 8 / ABP 8.3 | REST API + OpenIddict 认证 |
| **前端** | Angular 18 / Nginx | SPA 页面 + 反向代理 |
| **迁移工具** | DbMigrator | 初始化数据库结构和种子数据（一次性运行） |

---

## 快速开始

### 🚀 在新电脑上一键部署（推荐）

> **前提**：已安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
# 1. 下载 compose 文件
curl -o docker-compose.yml https://raw.githubusercontent.com/zh667/ABP-TodoList/main/docker-compose.hub.yml

# 2. 一键启动
docker compose up -d

# 3. 等待 1-2 分钟，浏览器访问
#    http://localhost
```

> 无需安装 .NET、Node.js、MySQL，Docker 会自动拉取所有预构建镜像。

### 🐳 从源码构建部署

```bash
# 1. 克隆代码
git clone https://github.com/zh667/ABP-TodoList.git
cd ABP-TodoList

# 2. 构建并启动（首次约 5-10 分钟）
docker compose -f docker-compose.yml up -d

# 3. 等待 1-2 分钟，浏览器访问
#    http://localhost
```

---

## 三种运行模式

项目提供了 3 个 compose 文件，对应 3 种使用场景：

| 命令 | 模式 | 适合场景 |
|------|------|----------|
| `docker compose up -d` | 🔧 本地开发 | 日常写代码、调试 |
| `docker compose -f docker-compose.yml up -d` | 🐳 完整 Docker（构建） | 在本机测试完整部署 |
| `docker compose -f docker-compose.hub.yml up -d` | 🚀 完整 Docker（拉取） | 在另一台电脑快速运行 |

### 🔧 模式一：本地开发

**Docker 只启动 MySQL，前后端在本地运行。**

```bash
# 启动 MySQL
docker compose up -d

# 启动后端 API（另开一个终端）
cd aspnet-core
dotnet run --project src/TodoList.HttpApi.Host

# 启动前端（再开一个终端）
cd angular
npx ng serve --port 4200
```

访问地址：`http://localhost:4200`

### 🐳 模式二：完整 Docker（从源码构建）

**所有组件都在 Docker 中运行，从本地源码构建镜像。**

```bash
docker compose -f docker-compose.yml up -d
```

访问地址：`http://localhost`

### 🚀 模式三：完整 Docker（拉取预构建镜像）

**所有组件都在 Docker 中运行，直接从 Docker Hub 拉取镜像，无需源码。**

```bash
docker compose -f docker-compose.hub.yml up -d
```

访问地址：`http://localhost`

---

## 本地开发模式 vs 纯 Docker 模式

### 核心区别

| 对比项 | 🔧 本地开发模式 | 🐳 纯 Docker 模式 |
|--------|----------------|-------------------|
| **MySQL** | Docker 容器 ✅ | Docker 容器 ✅ |
| **后端 API** | 本地 `dotnet run` | Docker 容器 |
| **前端** | 本地 `ng serve` | Docker 容器 (Nginx) |
| **热重载** | ✅ 支持（改代码立即生效） | ❌ 不支持（需重新构建镜像） |
| **调试** | ✅ 可用 IDE 断点调试 | ❌ 不方便 |
| **启动速度** | 快（秒级） | 首次较慢（需构建镜像） |
| **环境依赖** | 需要 .NET SDK + Node.js | 只需要 Docker |
| **前端访问地址** | `http://localhost:4200` | `http://localhost` |
| **API 访问地址** | `http://localhost:44306` | `http://localhost`（Nginx 代理） |

### 什么时候用哪种？

#### 选择本地开发模式，当你：
- 正在**写代码和调试**
- 需要**热重载**（改一行代码，浏览器自动刷新）
- 需要**断点调试**后端 API
- 需要频繁修改并测试

#### 选择纯 Docker 模式，当你：
- 想给**别人演示**项目
- 想在**另一台电脑**上快速跑起来
- 想验证项目能否**在干净环境中正常运行**
- 不想安装 .NET、Node.js 等开发工具

### 工作流程建议

```
日常开发：
  docker compose up -d          ← 只启动 MySQL
  本地运行前后端，享受热重载和调试

准备演示或分享：
  docker compose -f docker-compose.yml up -d   ← 全部容器化
  或者推送镜像后用 docker-compose.hub.yml

发给别人运行：
  只需发送 docker-compose.hub.yml 这一个文件
  对方 docker compose up -d 即可
```

---

## 常用命令

```bash
# 查看容器状态
docker compose -f docker-compose.yml ps

# 查看日志
docker compose -f docker-compose.yml logs -f        # 所有服务
docker compose -f docker-compose.yml logs -f api    # 仅 API

# 停止服务（保留数据）
docker compose -f docker-compose.yml down

# 停止服务并删除数据（重新开始）
docker compose -f docker-compose.yml down -v

# 重新构建镜像（代码改动后）
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml up -d
```

---

## 默认账号

| 用户名 | 密码 |
|--------|------|
| `admin` | `1q2w3E*` |

---

## Docker Hub 镜像

| 镜像 | 地址 |
|------|------|
| 后端 API | `linqian667/todolist-api:latest` |
| 数据库迁移 | `linqian667/todolist-migrator:latest` |
| 前端 (Nginx) | `linqian667/todolist-web:latest` |

---

## 文件说明

```
TodoList/
├── docker-compose.yml          # 完整部署（从源码构建）
├── docker-compose.override.yml # 本地开发覆盖（只启动 MySQL）
├── docker-compose.hub.yml      # 完整部署（从 Docker Hub 拉取）
├── .env                        # 环境变量（不提交到 Git）
├── .env.example                # 环境变量模板
├── aspnet-core/
│   ├── Dockerfile              # 后端多阶段构建（API + Migrator）
│   └── .dockerignore
└── angular/
    ├── Dockerfile              # 前端多阶段构建（Angular + Nginx）
    ├── nginx.conf              # Nginx 反向代理配置
    ├── .dockerignore
    └── src/environments/
        ├── environment.ts          # 本地开发环境
        ├── environment.prod.ts     # 生产环境
        └── environment.docker.ts   # Docker 环境
```
