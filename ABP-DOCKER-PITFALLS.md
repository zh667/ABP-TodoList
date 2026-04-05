# ABP 框架 Docker 部署踩坑记录

## 坑 1: 容器内不能用 localhost 做服务通信地址

**现象**: `/.well-known/openid-configuration` 和 `/api/abp/application-configuration` 返回 500

**原因**: `docker-compose.yml` 中配置了：
```yaml
AuthServer__Authority: http://localhost/
App__SelfUrl: http://localhost
```
Docker 容器内 `localhost` 指向容器自己，不是宿主机，也不是其他容器。API 容器去访问自己不存在的认证地址，直接 500。

**修复**:
```yaml
# 容器内部通信用服务名
App__SelfUrl: http://todolist-api:8080
AuthServer__Authority: http://todolist-api:8080
# 浏览器端的地址保持 localhost
App__ClientUrl: http://localhost
App__CorsOrigins: http://localhost
```

**记住**: Docker 里 localhost 永远只代表自己，容器间通信用服务名。

---

## 坑 2: Development 模式下 ReplaceEmbeddedByPhysical 导致容器崩溃

**现象**: API 容器启动直接崩溃，日志报 `System.IO.DirectoryNotFoundException: /TodoList.Domain.Shared/`

**原因**: ABP 在 Development 模式下会用本地源码目录替换嵌入资源，方便热重载调试：
```csharp
if (hostingEnvironment.IsDevelopment())
{
    options.FileSets.ReplaceEmbeddedByPhysical<TodoListDomainSharedModule>(
        Path.Combine(hostingEnvironment.ContentRootPath, "../TodoList.Domain.Shared"));
}
```
Docker 容器里只有 `/app` 目录，没有源码目录，直接炸。

**修复**: 检测 `DOTNET_RUNNING_IN_CONTAINER` 环境变量（.NET 官方 Docker 镜像自动设置）：
```csharp
var isRunningInContainer = Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER") == "true";
if (hostingEnvironment.IsDevelopment() && !isRunningInContainer)
{
    // ReplaceEmbeddedByPhysical...
}
```

---

## 坑 3: wwwroot/libs 静态资源缺失导致 500

**现象**: API 容器正常启动，但所有请求 500，日志报 `The 'wwwroot/libs' folder does not exist or empty!`

**原因**: `.gitignore` 排除了 `**/wwwroot/libs/*`，`git clone` 后目录为空。Docker build 时也没有安装这些前端库。

**修复**: 在 Dockerfile build 阶段安装 Node.js 并运行资源复制脚本：
```dockerfile
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN cd src/TodoList.HttpApi.Host \
    && npm install \
    && node ../../scripts/copy-abp-libs.js
```

**注意**: 不要用 `abp install-libs`（需要安装 ABP CLI），如果 `NuGet.Config` 的 `packageSources` 为空会导致安装失败。直接用 Node.js 脚本读取 `abp.resourcemapping.js` 复制文件更可靠。

---

## 坑 4: Antiforgery (CSRF) 验证导致 POST 请求 400

**现象**: GET 请求正常，POST/PUT/DELETE 返回 `400 Bad Request`，本地开发正常，Docker 下才报错。

**原因**: ABP 默认启用 Antiforgery 自动验证，通过 cookie 传递 XSRF token。经过 Nginx 反向代理后 cookie 域/路径不匹配，token 验证失败。

**修复**: 前后端分离架构下关闭自动验证（API 已通过 OAuth Bearer Token 保护）：
```csharp
using Volo.Abp.AspNetCore.Mvc.AntiForgery;

Configure<AbpAntiForgeryOptions>(options =>
{
    options.AutoValidate = false;
});
```

---

## 坑 5: Nginx 缺少 ABP 后端路径代理规则

**现象**: 
- 点击登录跳转后报 `NG04002: 'Account/Login'`（Angular 路由找不到）
- 登录页无样式，控制台大量 `SyntaxError: Unexpected token '<'`（JS 文件返回了 HTML）

**原因**: ABP 的登录页是后端 MVC Razor Pages 渲染的（`/Account/Login`），还有大量动态 JS/CSS 从 `/_content/`、`/_bundles/`、`/Themes/`、`/libs/` 等路径加载。Nginx 没有为这些路径配置代理，全部被 Angular SPA 的 `try_files` 捕获，返回了 `index.html`。

**修复**: 用一条正则统一匹配所有 ABP 路径：
```nginx
location ~ ^/(api|Account|connect|\.well-known|Abp|abp|libs|swagger|_content|_framework|_bundles|Themes|global-styles\.css)(/|$) {
    proxy_pass http://api:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Angular SPA fallback 放最后
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## 总结：ABP + Docker 部署检查清单

| # | 检查项 | 关键点 |
|---|--------|--------|
| 1 | 容器间通信地址 | 用服务名（如 `todolist-api`），不用 `localhost` |
| 2 | ReplaceEmbeddedByPhysical | Docker 中跳过，检测 `DOTNET_RUNNING_IN_CONTAINER` |
| 3 | wwwroot/libs | Dockerfile 中 `npm install` + 复制脚本 |
| 4 | Antiforgery | 前后端分离架构关闭 `AutoValidate` |
| 5 | Nginx 代理规则 | 用正则统一代理所有 ABP 路径，SPA fallback 放最后 |



按展示顺序，从核心到辅助：

## 必展示（核心 4 个）

| 文件 | 展示重点 |
|------|---------|
| **`aspnet-core/Dockerfile`** | 多阶段构建（build → api/migrator）、Node.js 安装前端资源 |
| **`docker-compose.yml`** | 服务编排、健康检查、依赖关系、环境变量配置 |
| **`angular/nginx.conf`** | 反向代理、正则匹配 ABP 路径、SPA fallback |
| **`angular/Dockerfile`** | 前端多阶段构建（ng build → Nginx） |

## 加分项（体现深度）

| 文件 | 展示重点 |
|------|---------|
| **`docker-compose.hub.yml`** | 预构建镜像部署方案，说明你推过 Docker Hub |
| **`docker-compose.override.yml`** | 本地开发模式 vs 完整 Docker 模式的切换设计 |
| **`ABP-DOCKER-PITFALLS.md`** | 踩坑记录，展示排查和解决问题的能力 |
| **`aspnet-core/scripts/copy-abp-libs.js`** | 自定义脚本替代 ABP CLI，展示问题解决思路 |

## 代码层面（如果面试官追问）

| 文件 | 展示重点 |
|------|---------|
| **`TodoListHttpApiHostModule.cs`** | `DOTNET_RUNNING_IN_CONTAINER` 检测、Antiforgery 配置、ForwardedHeaders |
| **`.dockerignore`** | 优化构建上下文 |
| **`DOCKER.md`** | 部署文档，体现工程规范 |

## 展示话术建议

> 先讲架构图（DOCKER.md 里有），再逐层展开：Dockerfile → docker-compose → nginx → 踩坑经验。**踩坑记录是最大亮点**，说明你不是照抄模板，而是实际调试解决过问题。



`-d` 参数已经让容器在后台运行了，**关闭终端不会停止容器**。

## 常用场景

| 场景 | 命令 |
|------|------|
| **电脑重启后启动** | `docker compose -f docker-compose.yml up -d` |
| **停止（保留数据）** | `docker compose -f docker-compose.yml down` |
| **停止（清除数据）** | `docker compose -f docker-compose.yml down -v` |
| **代码改了要重新构建** | `docker compose -f docker-compose.yml up --build -d` |
| **查看运行状态** | `docker compose -f docker-compose.yml ps` |

> **关键区别**：`up -d` 是直接启动已有镜像（秒级），`up --build -d` 是重新构建镜像再启动（分钟级）。没改代码的话用 `up -d` 就行。

如果想让容器**开机自动启动**，可以在 docker-compose.yml 的每个服务里加：
```yaml
restart: unless-stopped
```