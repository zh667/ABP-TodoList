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

---

## DNS 解析记录各字段含义（面试知识点）

### 页面截图中的字段逐一解释

| 字段 | 含义 | 详细说明 |
|------|------|----------|
| **主机记录** | 域名前缀（子域名部分） | `@` = 根域名（zh667.cn 本身）；`*` = 泛解析（匹配所有未明确配置的子域名，如 abc.zh667.cn）；`verification` = 具体子域名（verification.zh667.cn） |
| **记录类型** | DNS 记录的类型 | 决定这条记录的用途，见下方详表 |
| **解析请求来源** | 按请求来源线路分流 | `默认` = 不区分线路，所有来源统一解析。可以设置"电信"、"联通"等实现智能DNS |
| **记录值** | 解析目标地址 | A 记录填 IP；CNAME 填域名；TXT 填任意文本 |
| **负载策略** | 多条同类记录时的分配方式 | `轮询` = 依次轮流返回（Round Robin）；`权重` = 按权重比例分配流量 |
| **权重** | 权重值（仅权重策略有效） | 数值越大被选中的概率越高。只有一条记录时权重无意义 |
| **TTL** | Time To Live（缓存时间） | DNS 结果在客户端/中间 DNS 服务器缓存的时间。`10分钟` = 每 10 分钟重新查询一次。TTL 越短切换越快但查询量越大 |
| **启用状态** | 这条记录是否生效 | 绿色 = 启用中，可以暂停而不删除 |

### 常见 DNS 记录类型

| 类型 | 全称 | 用途 | 示例 |
|------|------|------|------|
| **A** | Address | 将域名直接指向一个 IPv4 地址 | `zh667.cn → 1.12.253.107`（你的服务器 IP） |
| **AAAA** | Address (IPv6) | 将域名指向 IPv6 地址 | `zh667.cn → 2001:db8::1` |
| **CNAME** | Canonical Name | 将域名指向另一个域名（别名） | `*.zh667.cn → video-zh667-cn-idvqwdj.qiniudns.com`（七牛 CDN） |
| **TXT** | Text | 存储任意文本，常用于验证和安全 | `verification.zh667.cn → verify_215764...`（域名所有权验证） |
| **MX** | Mail Exchange | 指定邮件服务器地址 | 收发 `xxx@zh667.cn` 邮件用 |
| **NS** | Name Server | 指定域名的权威 DNS 服务器 | 一般由域名注册商自动管理 |
| **SRV** | Service | 指定特定服务的主机和端口 | 用于 VoIP、即时通讯等协议 |

### 你的 3 条记录解读

#### 记录 1：`*` → CNAME → `video-zh667-cn-idvqwdj.qiniudns.com`
- **作用**：泛解析，把所有未明确配置的子域名（如 `abc.zh667.cn`、`blog.zh667.cn`）都指向七牛云 CDN
- **面试点**：CNAME 不能和其他记录共存于同一主机记录（RFC 规范）。用 CDN 时通常用 CNAME 而非 A 记录，因为 CDN 的 IP 会动态变化

#### 记录 2：`verification` → TXT → `verify_21576433b8adc92e3e67ce3e58fde411`
- **作用**：域名所有权验证。第三方平台（如七牛、SSL 证书商）要求你添加一条特定 TXT 记录来证明你拥有这个域名
- **面试点**：TXT 记录除了验证外，还常用于 SPF（防垃圾邮件）、DKIM（邮件签名）、DMARC（邮件策略）

#### 记录 3：`@` → A → `1.12.253.107`
- **作用**：根域名直接指向服务器 IP，访问 `zh667.cn` 时解析到 `1.12.253.107`（腾讯云 IP 段）
- **面试点**：这就是你的 Docker 容器运行的服务器地址。用户访问 `zh667.cn` → DNS 解析到这个 IP → Nginx 接收请求 → 反向代理到容器

### DNS 解析完整流程（面试常考）

```
用户输入 zh667.cn
    ↓
浏览器缓存 → 系统缓存 → 路由器缓存（有缓存直接返回）
    ↓ 没有缓存
本地 DNS 服务器（ISP 提供）
    ↓ 递归查询
根域名服务器（.） → 返回 .cn 的 NS
    ↓
.cn 顶级域名服务器 → 返回 zh667.cn 的 NS
    ↓
zh667.cn 权威 DNS 服务器（你配置记录的地方）
    ↓
返回 A 记录：1.12.253.107
    ↓
浏览器发起 HTTP 请求到 1.12.253.107
```

### 面试高频追问

| 问题 | 回答要点 |
|------|----------|
| A 和 CNAME 的区别？ | A 直接指向 IP，CNAME 指向另一个域名。CNAME 适合目标 IP 会变的场景（如 CDN） |
| 为什么根域名（@）不建议用 CNAME？ | RFC 1034 规定 CNAME 不能与其他记录类型共存，而根域名通常还需要 MX、TXT 等记录 |
| TTL 设多少合适？ | 正常 10 分钟~1 小时。迁移服务器前先调低（如 60 秒），迁移完再调回来 |
| 什么是 DNS 劫持？ | 攻击者篡改 DNS 响应，把域名指向恶意 IP。防御：用 DNSSEC 或 DoH (DNS over HTTPS) |
| CDN 为什么用 CNAME？ | CDN 有全球节点，IP 不固定。CNAME 指向 CDN 智能 DNS，根据用户位置返回最近节点 IP |

---

## 面试题：实习中最难解决的问题

### 故事包装（STAR 法则）

**Situation（背景）**：
实习时参与一个基于开源项目的二次开发，我负责修改前端某个系统级页面的功能。

**Task（任务）**：
需要定位并修改这个系统级页面的源码。但这个页面不是业务页面，而是框架内置的系统页面（比如登录页、权限管理页），源码散布在框架的底层模块中。

**Action（行动）**：
1. 首先我按照常规思路，在项目源码中全局搜索页面上的关键字、组件名、路由路径
2. 但搜不到——因为项目当时做了一次大版本升级，框架把很多模块**重命名**了（比如文件名、组件名、甚至目录结构都变了），老版本的文档和博客文章里的路径全部失效
3. 我尝试了几种方法：
   - 翻 Git 提交历史，用 `git log --all --follow` 追踪文件重命名
   - 在 `node_modules` / NuGet 包里搜索运行时渲染出来的 HTML 片段
   - 对比新老版本的 changelog / migration guide
4. 花了比较长的时间没有完全定位到，最终请教了技术主管，他凭经验直接指出了新的模块位置

**Result（结果）**：
- 成功完成了页面修改
- **更重要的是**，我之后整理了一份版本升级后的模块映射文档，把老文件名 → 新文件名的对应关系记了下来，后面团队其他人遇到类似问题可以直接查

### 应对追问：「你主管能找到，你为什么找不到？」

> ⚠️ 这个问题的核心不是质疑你的能力，而是在考察：**你对"求助"这件事的认知是否成熟**。不要慌，不要否定自己。

**回答策略：承认差距 → 解释原因 → 展示成长**

#### 话术参考：

> 「这是个好问题。我主管能快速定位，是因为他**经历过这次版本升级的全过程**，甚至可能参与了升级决策，所以他脑子里有一张完整的模块映射关系。而我是升级之后才加入的，面对的是一个已经变化过的代码库，手头的文档和社区资料还停留在老版本，这就形成了一个信息差。
>
> 但我觉得这件事给我最大的收获不是最终怎么找到的，而是两点：
>
> 1. **我意识到"知道什么时候该求助"本身就是一种能力**。我不是一上来就问的，我自己先尝试了 Git 历史追踪、包内搜索、changelog 对比这些方法，花了大概半天时间。当我判断继续自己摸索的时间成本已经超过直接请教的成本时，我选择了求助。在工程实践中，效率和结果比"全靠自己"更重要。
>
> 2. **我把这次经验沉淀了下来**。找到答案后，我整理了一份模块映射文档，这样团队里其他人遇到同样的问题就不需要再重复踩坑了。这其实也是工程师的职责——把个人经验变成团队资产。」

### 这个回答好在哪

| 维度 | 体现了什么 |
|------|-----------|
| **不回避差距** | 诚实、自我认知清晰，面试官最怕听到"我什么都行" |
| **解释合理** | 信息差是客观存在的，不是能力问题，面试官自己也经历过 |
| **展示方法论** | 你不是瞎找的，你有系统性的排查思路（Git history、包搜索、changelog） |
| **求助的判断力** | 知道什么时候该独立解决、什么时候该借力，这是高级工程师的特质 |
| **闭环思维** | 问题解决后沉淀文档，从"个人经验"变成"团队知识"，这是加分项 |

### 绝对不要说的话

- ❌ 「我就是不如主管厉害」—— 自我贬低，面试官会真的觉得你不行
- ❌ 「那个项目文档太烂了」—— 甩锅，暴露心态问题
- ❌ 「其实我也差不多快找到了」—— 嘴硬，面试官一听就知道在编
- ❌ 「这个问题确实不难」—— 既然不难为什么你没搞定？自相矛盾

---

## 面试反问环节：怎么问出有深度的问题

### 先纠正你的认知：这三个东西在企业里远不止你想的那样

#### SharePoint ≠ 只是共享文档的网站

你的印象没错但太窄了。SharePoint 在企业里是一整个**低代码业务平台**：

| 你以为的 | 实际上它还能做 |
|---------|--------------|
| 存文档、共享文件 | ✅ 这是最基础的功能 |
| — | 📋 **业务流程审批**：请假、采购、报销流程，用 Power Automate 串起来 |
| — | 📊 **内部门户/仪表盘**：部门首页、KPI 看板、公告系统 |
| — | 🗃️ **轻量级数据库**：用 SharePoint List 做结构化数据管理（类似 Excel 但支持权限、版本、审批流） |
| — | 🔗 **系统集成枢纽**：通过 API/Power Automate 和 SAP、SQL Server、第三方系统对接 |
| — | 📱 **Power Apps 前端**：直接在 SharePoint 上嵌入低代码应用 |

所以这个岗位要你做的可能是：**用 SharePoint + Power Platform 搭建企业内部应用**，比如一个设备管理系统、一个质量检查流程、一个供应商管理门户。

#### SQL Server ≠ 只是一个数据库

| 你以为的 | 实际上它还包含 |
|---------|--------------|
| 存数据、写 SQL | ✅ 基础功能 |
| — | 📊 **SSRS**（SQL Server Reporting Services）：企业级报表系统 |
| — | 📦 **SSIS**（SQL Server Integration Services）：ETL 工具，从各系统抽数据、清洗、入库 |
| — | 📈 **SSAS**（SQL Server Analysis Services）：OLAP 多维分析 |
| — | ⏰ **SQL Agent**：定时任务调度（自动备份、自动跑报表、自动同步数据） |
| — | 🔒 **审计与合规**：ISO 质量体系要求的数据追溯 |

在这个岗位里，你可能需要：写存储过程、做 ETL 从 SAP 取数据、用 SSRS 出报表、维护数据库的备份和监控。

#### SAP ≠ 只是一个操作流程工具

| 你以为的 | 实际上 |
|---------|--------|
| 审批流程、ERP 操作 | SAP 是全球最大的企业 ERP 系统 |
| — | 💰 **财务**：总账、应收应付、资产管理 |
| — | 📦 **供应链**：采购、库存、物流 |
| — | 🏭 **生产**：工单、BOM、排程 |
| — | 👥 **人力资源**：HR 模块 |
| — | 📊 **数据源**：几乎所有企业核心数据都在 SAP 里 |

你在这个岗位里大概**不是**去写 SAP ABAP 代码，更可能是：**从 SAP 取数据**（通过 RFC/BAPI/OData 接口）→ 放到 SQL Server → 用 Power BI 做报表 → 展示在 SharePoint 门户上。

### 这三个东西在这个岗位里是怎么串起来的

```
SAP（核心业务数据源）
    ↓ OData / RFC 接口
SQL Server（数据仓库 + ETL + 报表）
    ↓ API / 数据连接
SharePoint + Power Platform（前端展示 + 流程审批 + 低代码应用）
    ↓
最终用户（浏览器访问）
```

**你在这个链条中的角色**：用 .NET/C# 写中间的集成层和自定义功能，用 Power Platform 做快速交付，用 SQL 做数据层。

---

### 推荐反问的问题（按优先级排序）

#### 第一梯队：展示你理解岗位本质（选 1-2 个问）

**问题 1：关于技术栈协作**
> 「我注意到岗位描述中提到了 SharePoint、SQL Server 和 SAP 这几个系统。我想了解一下，在日常工作中，这几个系统之间的数据流是怎样的？比如是不是会从 SAP 抽取业务数据到 SQL Server 做分析，然后通过 SharePoint 或 Power BI 展示给业务部门？」

**为什么好**：
- 你不是单独问每个系统是干嘛的（太基础），而是问**它们之间的关系**
- 面试官一听就知道你对企业级系统集成有概念
- 自然引出你的 .NET/数据库技能在中间层的价值

**问题 2：关于 SharePoint 的使用深度**
> 「公司目前使用 SharePoint 主要是做文档管理，还是已经在上面搭建了一些业务应用？比如用 SharePoint List 做数据管理，或者结合 Power Apps/Power Automate 做流程自动化？我想了解一下这块目前的成熟度，以及团队未来的发展方向。」

**为什么好**：
- 说明你知道 SharePoint 有不同的使用层次（文档管理 → 业务平台）
- 问「成熟度和方向」让面试官觉得你在评估自己能贡献什么
- 如果公司还处于初级阶段，这恰好是你的机会

#### 第二梯队：展示你的工程素养（选 1 个问）

**问题 3：关于开发流程**
> 「岗位提到了 CI/CD 和 Azure DevOps，我想了解一下团队目前的开发流程。开发新功能的时候，是从需求分析到部署都由同一个人负责（端到端），还是有专门的分工？代码审查和自动化测试目前推行到什么程度了？」

**问题 4：关于国际化协作**
> 「岗位提到参与国际项目团队，我想了解一下日常的跨国协作是什么形式？比如是不是会有全球统一的 IT 标准要在本地落地，还是更多是和其他区域的团队一起做开发项目？沟通主要用英语吗？」

#### 第三梯队：展示你的成长意愿（选 1 个问）

**问题 5：关于 SAP 集成**
> 「我之前的经验主要在 .NET 和数据库方面，对 SAP 的接口对接了解还不够深入。想问一下，这个岗位入职后会有机会学习 SAP 相关的集成开发吗？团队内部有这方面的知识传承或培训吗？」

**为什么好**：
- 诚实承认不足（SAP），但用"我想学"来转化
- 问「知识传承和培训」侧面了解团队文化
- 面试官会觉得你务实、有成长意愿

### 反问的禁忌

| ❌ 别问 | 原因 |
|--------|------|
| 「公司是做什么的？」 | 面试前没做功课，直接减分 |
| 「加班多吗？」 | 第一轮面试不要问，太早暴露态度 |
| 「SharePoint 是干什么的？」 | 你可以不精通，但不能问出这么基础的问题 |
| 「我什么都不会可以吗？」 | …… |
| 「薪资多少？」 | 等 HR 面或 offer 阶段再谈 |

### 万能收尾话术

> 「最后我想说，虽然我对 SAP 和 SharePoint 还没有深入的项目经验，但从我做 ABP 框架 Docker 部署的经历来看，我对快速学习新技术栈、解决集成联调中的问题是有信心的。岗位描述中提到的 .NET、SQL Server、Docker、Azure DevOps 这些是我比较熟悉的，我相信这些能力可以在这个岗位上发挥价值，而 SharePoint 和 SAP 相关的部分，我也很愿意在工作中学习和深入。」

---

### 怎么问实习转正标准

#### ❌ 不好的问法

| 问法 | 问题 |
|------|------|
| 「实习能转正吗？」 | 太直白，像在问"你要不要我"，给人压力 |
| 「转正率高吗？」 | 暗示你在赌概率，而不是靠实力 |
| 「我要做到什么才能转正？」 | 方向对但措辞太生硬，像在要 KPI 指标 |
| 「实习多久可以转正？」 | 还没进来就在算什么时候转正，显得急功近利 |

#### ✅ 推荐问法（选一个就行）

**问法 1：目标导向型（最推荐）**
> 「我想了解一下，如果我有幸加入团队，在实习期间您期望我在哪些方面有比较明显的成长或产出？或者说，一个达到转正标准的实习生，通常在哪些维度上表现比较突出？」

**好在哪**：
- 「您期望我在哪些方面成长」→ 暗示"我想按你的标准去努力"，主动权交给面试官
- 「哪些维度上表现突出」→ 在问标准，但切入角度是"优秀的人是什么样的"，不是"底线在哪"
- 传递的信号是：**我不是在问能不能过关，而是在问怎么做到优秀**

**问法 2：学习路径型**
> 「对于一个刚加入的实习生，您觉得前三个月最重要的学习重点是什么？团队会怎样帮助新人快速上手？」

**好在哪**：
- 不直接问转正，而是问"怎么快速上手"，但面试官心里清楚你在问什么
- 顺便了解团队的 onboarding 流程和带教文化
- 显得你更关心"怎么做好"而不是"什么时候转正"

**问法 3：直接但得体型（如果面试氛围比较轻松）**
> 「最后想确认一下，这个岗位的实习期一般是多久？实习结束后的考核标准主要看哪些方面？我希望一进来就能有针对性地去努力。」

**好在哪**：
- 加了一句"我希望一进来就能有针对性地去努力"，把功利性转化为积极性
- 适合面试氛围比较开放的场景

#### 面试官听到这类问题时的心理

面试官其实**很欢迎**你问这个问题，因为：

1. **说明你是认真想来的** —— 不关心转正的人不会问这个
2. **说明你有目标感** —— 你不是来混日子的，你想知道方向
3. **给了面试官管理预期的机会** —— 他可以提前告诉你重点，避免入职后的预期落差

所以**完全不用觉得问这个不好意思**，关键是措辞要展示积极性而不是功利性。

#### 如果面试官反问「你觉得你能留下来吗？」

> 「我当然希望能留下来。从目前了解到的岗位内容来看，.NET 开发、数据库和 Docker 这些是我有基础的方向，SharePoint 和 SAP 集成是我想深入学习的方向。如果能有机会在实习中把这些串起来做一个完整的项目，我相信自己能达到团队的要求。」
---

## Docker 四大模块详解

本项目通过 `docker-compose.yml` 编排了 4 个容器，各司其职，协同运行整个 ABP TodoList 应用。

### 架构总览

```
用户浏览器 (localhost:80)
    │
    ▼
┌──────────────────────────────────┐
│  todolist-web (Nginx)            │  ← 前端容器，端口 80
│  ├─ 静态资源 → Angular SPA       │
│  └─ /api/* 等 → 反向代理 ────────┼──┐
└──────────────────────────────────┘  │
                                      ▼
┌──────────────────────────────────┐
│  todolist-api (.NET 8)           │  ← 后端容器，端口 8080
│  ABP HttpApi.Host                │
│  OpenIddict 认证服务器            │
└───────────┬──────────────────────┘
            │
            ▼
┌──────────────────────────────────┐
│  todolist-mysql (MySQL 8)        │  ← 数据库容器，端口 3306
│  持久化卷: mysql_data             │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  todolist-migrator (一次性)       │  ← 迁移容器，运行完自动退出
│  EF Core 数据库迁移 + 数据种子    │
└──────────────────────────────────┘
```

---

### 模块 1：todolist-mysql — 数据库

| 属性 | 值 |
|------|----|
| **镜像** | `mysql:8` (官方 MySQL 8.x 镜像) |
| **容器名** | `todolist-mysql` |
| **端口映射** | `3306:3306` (宿主机:容器) |
| **数据持久化** | Docker Volume `mysql_data` 挂载到 `/var/lib/mysql` |
| **运行状态** | 常驻运行 (绿色) |

**作用**：
- 存储所有业务数据（TodoItem 表）和 ABP 框架数据（用户、权限、OpenIddict 配置等）
- 通过 `healthcheck` 确保数据库完全就绪后，才允许 migrator 启动
- 使用 Docker Volume 持久化数据，`docker compose down` 不会丢数据，`down -v` 才会清除

**健康检查机制**：
```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p1234"]
  interval: 10s      # 每 10 秒检查一次
  timeout: 5s        # 超时 5 秒算失败
  retries: 10        # 最多重试 10 次
  start_period: 60s  # 启动后 60 秒内不算失败（给 MySQL 初始化时间）
```

---

### 模块 2：todolist-migrator — 数据库迁移（一次性任务）

| 属性 | 值 |
|------|----|
| **构建来源** | `aspnet-core/Dockerfile` 的 `migrator` 阶段 |
| **容器名** | `todolist-migrator` |
| **端口映射** | 无（不对外暴露端口） |
| **运行状态** | 执行完毕后自动退出 (Exited，灰色圆圈) |

**作用**：
- 运行 EF Core 数据库迁移（`DbMigrator`），自动创建/更新数据库表结构
- 播种初始数据（ABP 框架的默认权限、admin 用户、OpenIddict 应用配置等）
- **一次性任务**：执行完毕后容器退出，不会持续占用资源

**启动依赖**：
```yaml
depends_on:
  mysql:
    condition: service_healthy  # 等 MySQL 健康检查通过才启动
restart: on-failure:5           # 失败最多重试 5 次
```

**为什么单独做成一个容器？**
- **职责分离**：迁移逻辑和 API 运行逻辑解耦，各自独立
- **启动顺序保证**：API 容器依赖 `migrator` 完成（`service_completed_successfully`），确保表结构就绪后才启动 API
- **幂等性**：重复运行不会破坏数据，EF Core 会跳过已执行的迁移

---

### 模块 3：todolist-api — 后端 API 服务

| 属性 | 值 |
|------|----|
| **构建来源** | `aspnet-core/Dockerfile` 的 `api` 阶段 |
| **容器名** | `todolist-api` |
| **端口映射** | 无直接映射（通过 Nginx 反向代理访问） |
| **运行状态** | 常驻运行 (绿色) |

**作用**：
- 运行 ABP 框架的 `HttpApi.Host`，提供 RESTful API（`/api/app/todo-item` 等）
- 充当 **OpenIddict 认证服务器**（处理 `/connect/token`、`/.well-known/openid-configuration` 等）
- 渲染 ABP 内置的 Razor Pages（如 `/Account/Login` 登录页面）
- 提供 Swagger API 文档（`/swagger`）

**关键环境变量**：
```yaml
# 容器内部通信地址（用服务名，不能用 localhost！）
App__SelfUrl: "http://todolist-api:8080"
AuthServer__Authority: "http://todolist-api:8080"
# 浏览器端地址（用户实际访问的地址）
App__ClientUrl: "http://localhost"
App__CorsOrigins: "http://localhost"
```

**启动依赖**：
```yaml
depends_on:
  migrator:
    condition: service_completed_successfully  # 等迁移完成才启动
```

**多阶段构建细节**（共用一个 Dockerfile）：
```dockerfile
# Build 阶段：编译 + 安装前端资源
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
# ... 还原依赖、npm install、发布

# API 运行阶段：仅包含运行时
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS api
COPY --from=build /app/api .
ENTRYPOINT ["dotnet", "TodoList.HttpApi.Host.dll"]
```

---

### 模块 4：todolist-web — 前端 + 反向代理

| 属性 | 值 |
|------|----|
| **构建来源** | `angular/Dockerfile` |
| **容器名** | `todolist-web` |
| **端口映射** | `80:80` (用户访问入口) |
| **运行状态** | 常驻运行 (绿色) |

**作用**：
- 托管 Angular SPA 编译后的静态文件（HTML/JS/CSS）
- 作为 **Nginx 反向代理**，将后端请求转发给 `todolist-api` 容器
- 实现前后端统一入口（用户只需访问 `localhost:80`）

**Nginx 双重职责**：
```nginx
# 职责 1：反向代理 — 后端路径转发到 API 容器
location ~ ^/(api|Account|connect|\.well-known|...) {
    proxy_pass http://api:8080;
}

# 职责 2：SPA 托管 — 前端路由 fallback
location / {
    try_files  / /index.html;
}
```

**多阶段构建**：
```dockerfile
# Stage 1: Node.js 编译 Angular
FROM node:20-alpine AS build
RUN npx ng build --configuration docker

# Stage 2: Nginx 运行（最终镜像非常小）
FROM nginx:alpine
COPY --from=build /app/dist/TodoList /usr/share/nginx/html
```

---

### 四个容器的启动顺序和依赖关系

```
mysql (先启动，等待健康检查通过)
  │
  ▼
migrator (MySQL 健康后启动，执行迁移，完成后退出)
  │
  ▼
api (migrator 成功退出后启动)
  │
  ▼
web (api 启动后启动，反向代理到 api)
```

```yaml
# docker-compose.yml 中的依赖链
mysql        ← healthcheck
migrator     ← depends_on: mysql (service_healthy)
api          ← depends_on: migrator (service_completed_successfully)
web          ← depends_on: api
```

### 资源占用对比

| 容器 | CPU | 内存 | 说明 |
|------|-----|------|------|
| todolist-mysql | ~1.12% | 较多 | 数据库引擎常驻内存 |
| todolist-api | ~0.03% | 中等 | .NET 运行时，空闲时占用极低 |
| todolist-web | ~0% | 极少 | Nginx 静态文件服务，几乎不占资源 |
| todolist-migrator | 0% | 0 | 已退出，不占用任何资源 |


---

## 面试回答：前后端分模块详细讲解

### 一句话总览

这个项目本质上是一个 **ABP 标准分层单体应用**，后端按 DDD 和分层架构拆成 `Domain.Shared`、`Domain`、`Application.Contracts`、`Application`、`HttpApi`、`HttpApi.Host`、`EntityFrameworkCore`、`DbMigrator` 等模块，前端是一个 Angular SPA，再把账号、身份、租户、设置这些后台能力通过 ABP 的 Angular 模块接进来。  
如果面试官让我讲模块，我会先讲“分层职责”，再讲“每层依赖什么”，最后再讲“一个 TodoItem 请求是怎么从前端走到数据库的”。

### 后端模块怎么讲

#### 1. `TodoList.Domain.Shared`

**它是干嘛的**

- 这是最底层的“共享领域定义层”，放所有层都能依赖、但不涉及具体实现的东西。
- 这里通常放常量、错误码、权限名、本地化资源、模块扩展配置、全局功能开关。
- 这个项目里就有 `TodoItemConsts`、错误码、本地化资源和模块扩展配置。

**安装了哪些依赖**

- `Volo.Abp.Identity.Domain.Shared`
- `Volo.Abp.BackgroundJobs.Domain.Shared`
- `Volo.Abp.AuditLogging.Domain.Shared`
- `Volo.Abp.TenantManagement.Domain.Shared`
- `Volo.Abp.FeatureManagement.Domain.Shared`
- `Volo.Abp.PermissionManagement.Domain.Shared`
- `Volo.Abp.SettingManagement.Domain.Shared`
- `Volo.Abp.OpenIddict.Domain.Shared`
- `Microsoft.Extensions.FileProviders.Embedded`

**面试怎么说**

“`Domain.Shared` 我把它理解成全项目的公共领域契约层。它不写数据库、不写应用服务，只负责定义统一语言，比如错误码、权限、常量和多语言资源。这样上层都能复用，而且不会产生实现层反向依赖。”

#### 2. `TodoList.Domain`

**它是干嘛的**

- 这是核心业务层，真正放业务规则和领域对象。
- 这个项目的核心实体是 `TodoItem`，它继承 `AggregateRoot<int>`，把标题不能为空、标题长度限制、用户 ID 必须大于 0 这些规则收在实体内部。
- 数据种子、数据库迁移协调服务、设置定义、多租户开关等也在这一层。

**安装了哪些依赖**

- `Volo.Abp.Emailing`
- `Volo.Abp.Identity.Domain`
- `Volo.Abp.PermissionManagement.Domain.Identity`
- `Volo.Abp.BackgroundJobs.Domain`
- `Volo.Abp.AuditLogging.Domain`
- `Volo.Abp.TenantManagement.Domain`
- `Volo.Abp.FeatureManagement.Domain`
- `Volo.Abp.SettingManagement.Domain`
- `Volo.Abp.OpenIddict.Domain`
- `Volo.Abp.PermissionManagement.Domain.OpenIddict`

**面试怎么说**

“`Domain` 层我主要放真正的业务规则。比如 `TodoItem` 不是一个纯 DTO，它自己就能保证标题不能为空、长度不能超限、用户 ID 合法。这样规则不会散落在 Controller 或前端里，而是统一收口在领域模型中。”

#### 3. `TodoList.Application.Contracts`

**它是干嘛的**

- 这是应用层对外暴露的契约层。
- 这里定义 DTO、应用服务接口、权限定义，核心目的是让前后端、Swagger、动态代理都能围绕一套统一契约工作。
- 这个项目里 `ITodoItemAppService`、`CreateTodoItemDto`、`TodoItemDto`、`UpdateTodoItemStatusDto` 都在这里。

**安装了哪些依赖**

- `Volo.Abp.ObjectExtending`
- `Volo.Abp.Account.Application.Contracts`
- `Volo.Abp.Identity.Application.Contracts`
- `Volo.Abp.PermissionManagement.Application.Contracts`
- `Volo.Abp.TenantManagement.Application.Contracts`
- `Volo.Abp.FeatureManagement.Application.Contracts`
- `Volo.Abp.SettingManagement.Application.Contracts`

**面试怎么说**

“`Application.Contracts` 的作用是把接口定义和实现解耦。这样前端、Swagger、或者远程客户端只依赖契约，不依赖实现。ABP 的动态 API 和代理能力也是建立在这一层契约之上的。”

#### 4. `TodoList.Application`

**它是干嘛的**

- 这是应用服务层，负责组织用例流程。
- 它不保存底层基础设施细节，而是调用仓储、领域对象、对象映射，把业务流程串起来。
- 这个项目里 `TodoItemAppService` 通过 `IRepository<TodoItem, int>` 完成查询、创建、更新状态和删除。
- `TodoListApplicationAutoMapperProfile` 负责实体和 DTO 的映射。

**安装了哪些依赖**

- `Volo.Abp.Account.Application`
- `Volo.Abp.Identity.Application`
- `Volo.Abp.PermissionManagement.Application`
- `Volo.Abp.TenantManagement.Application`
- `Volo.Abp.FeatureManagement.Application`
- `Volo.Abp.SettingManagement.Application`

**面试怎么说**

“`Application` 层我理解成用例编排层。它拿到 DTO 后，去调领域对象和仓储，把业务动作拼起来，再把结果映射成 DTO 返回。像这个项目里的 `TodoItemAppService`，其实就是典型的 CRUD 用例编排。”

#### 5. `TodoList.HttpApi`

**它是干嘛的**

- 这是 HTTP API 定义层。
- 它主要负责把应用契约通过 HTTP 方式对外暴露，并配置 API 层本地化。
- 在 ABP 里，很多应用服务接口可以通过约定自动生成 API，所以这一层往往比较薄。

**安装了哪些依赖**

- `Volo.Abp.Account.HttpApi`
- `Volo.Abp.Identity.HttpApi`
- `Volo.Abp.PermissionManagement.HttpApi`
- `Volo.Abp.TenantManagement.HttpApi`
- `Volo.Abp.FeatureManagement.HttpApi`
- `Volo.Abp.SettingManagement.HttpApi`

**面试怎么说**

“`HttpApi` 层是把应用服务发布成 Web API 的那一层。因为 ABP 支持约定式控制器，所以我自己的 Controller 很薄，更多是让应用服务自动暴露成 `/api/app/...` 接口，同时继承 ABP 的统一返回、异常处理和本地化机制。”

#### 6. `TodoList.HttpApi.Host`

**它是干嘛的**

- 这是后端真正的启动宿主，也就是 Web 入口。
- 它负责依赖注入容器、认证鉴权、中间件管道、Swagger、CORS、静态资源、OpenIddict 验证、主题配置。
- `Program.cs` 和 `TodoListHttpApiHostModule` 都在这一层。

**安装了哪些依赖**

- `Serilog.AspNetCore`
- `Serilog.Sinks.Async`
- `Volo.Abp.AspNetCore.MultiTenancy`
- `Volo.Abp.Autofac`
- `Volo.Abp.AspNetCore.Serilog`
- `Volo.Abp.Swashbuckle`
- `Volo.Abp.Account.Web.OpenIddict`
- `Volo.Abp.AspNetCore.Mvc.UI.Theme.LeptonXLite`

**面试怎么说**

“`HttpApi.Host` 就是整个后端的组合根。前面的 Domain、Application、EF Core 都是能力模块，但真正把这些模块装配起来、启动 ASP.NET Core、配置中间件和 Swagger 的，是 Host 层。”

#### 7. `TodoList.EntityFrameworkCore`

**它是干嘛的**

- 这是数据访问层。
- 负责 `DbContext`、实体映射、迁移、数据库提供程序选择。
- 项目里 `TodoListDbContext` 既映射了自己的 `TodoItems` 表，也映射了 ABP 自带的身份、租户、权限、OpenIddict 等表。
- 当前数据库实现是 MySQL，版本按代码配置为 `8.0.31`。

**安装了哪些依赖**

- `Volo.Abp.EntityFrameworkCore.MySQL`
- `Volo.Abp.PermissionManagement.EntityFrameworkCore`
- `Volo.Abp.SettingManagement.EntityFrameworkCore`
- `Volo.Abp.Identity.EntityFrameworkCore`
- `Volo.Abp.BackgroundJobs.EntityFrameworkCore`
- `Volo.Abp.AuditLogging.EntityFrameworkCore`
- `Volo.Abp.TenantManagement.EntityFrameworkCore`
- `Volo.Abp.FeatureManagement.EntityFrameworkCore`
- `Volo.Abp.OpenIddict.EntityFrameworkCore`
- `Microsoft.EntityFrameworkCore.Tools`

**面试怎么说**

“`EntityFrameworkCore` 层解决的是数据持久化。它不是只存我自己的业务表，还把 ABP 各模块的表统一放进同一个 `DbContext` 里，所以身份、权限、租户、OpenIddict 和我自己的 Todo 表能在一个数据库里协同工作。”

#### 8. `TodoList.DbMigrator`

**它是干嘛的**

- 这是独立的数据库迁移程序。
- 主要职责是执行迁移、初始化数据库、跑数据种子。
- 这样做的好处是 Web 宿主和数据库初始化职责分离，部署时更稳，也更适合 Docker 场景。

**安装了哪些依赖**

- `Serilog.Extensions.Logging`
- `Serilog.Sinks.Async`
- `Serilog.Sinks.File`
- `Serilog.Sinks.Console`
- `Microsoft.EntityFrameworkCore.Design`
- `Microsoft.Extensions.Hosting`
- `Volo.Abp.Autofac`

**面试怎么说**

“我把数据库初始化单独拆成 `DbMigrator`，因为这符合生产部署习惯。应用启动不一定要顺带建库建表，但部署时可以先跑 migrator，把迁移和种子数据处理好，再启动 API 宿主。”

#### 9. `TodoList.HttpApi.Client`

**它是干嘛的**

- 这是 HTTP API 客户端代理层。
- 它不是 Web 宿主必须依赖的运行模块，而是给其他 .NET 客户端或测试程序调用接口时用的。
- 它通过 `AddHttpClientProxies` 基于契约生成远程调用代理。

**安装了哪些依赖**

- `AbpAccountHttpApiClientModule`
- `AbpIdentityHttpApiClientModule`
- `AbpPermissionManagementHttpApiClientModule`
- `AbpTenantManagementHttpApiClientModule`
- `AbpFeatureManagementHttpApiClientModule`
- `AbpSettingManagementHttpApiClientModule`

**面试怎么说**

“这个模块更像 SDK 层。它让其他 .NET 程序可以像调本地接口一样调远程 API，这在微服务或者集成测试场景里很常见。”

### 前端模块怎么讲

#### 1. `AppModule`

**它是干嘛的**

- 前端根模块，负责启动 Angular 应用。
- 它把 ABP Angular 生态需要的核心能力都装进来，包括环境配置、OAuth、主题、账号、身份、租户、设置和功能管理。

**安装了哪些核心依赖**

- `@abp/ng.core`
- `@abp/ng.oauth`
- `@abp/ng.account`
- `@abp/ng.identity`
- `@abp/ng.tenant-management`
- `@abp/ng.setting-management`
- `@abp/ng.theme.shared`
- `@abp/ng.theme.lepton-x`
- `@angular/core`
- `@angular/router`
- `@angular/forms`
- `@angular/platform-browser`
- `@angular/platform-browser-dynamic`

**面试怎么说**

“`AppModule` 是前端的组合根，对应后端的 Host 层。它负责把 ABP 的认证、主题、后台管理模块和 Angular 基础模块统一装配起来。”

#### 2. `AppRoutingModule`

**它是干嘛的**

- 前端总路由模块。
- 负责首页模块以及 ABP 自带后台模块的懒加载。
- 当前路由里已经接了 `account`、`identity`、`tenant-management`、`setting-management`。

**面试怎么说**

“路由层我做成了懒加载，首页业务模块走自己的 `HomeModule`，ABP 自带的账号、身份、租户、设置也通过懒加载方式挂进来，这样结构比较清晰，也更利于后续扩展。”

#### 3. `SharedModule`

**它是干嘛的**

- 公共 UI 和公共依赖复用层。
- 把多个功能模块都会用到的模块统一收口，避免每个业务模块都重复导入。

**目前封装了哪些依赖**

- `@abp/ng.core`
- `@abp/ng.theme.shared`
- `@ng-bootstrap/ng-bootstrap`
- `@ngx-validate/core`

**面试怎么说**

“`SharedModule` 的作用就是复用。像主题能力、下拉组件、校验组件这些横切依赖，我统一放这里，业务模块只管导入 `SharedModule` 就行。”

#### 4. `HomeModule`

**它是干嘛的**

- 这是当前项目最核心的业务前端模块。
- 它包含首页路由、首页组件、表单和 TodoItem 的交互逻辑。
- 现在 Todo 的 CRUD 基本都在这个模块闭环完成。

**依赖**

- `SharedModule`
- `ReactiveFormsModule`
- `HomeRoutingModule`

**面试怎么说**

“这个项目当前的自定义业务主要集中在 `HomeModule`。我把它当成一个独立功能模块来做，这样将来如果再拆出用户模块、统计模块、报表模块，模式是一样的。”

#### 5. `TodoApiService`

**它是干嘛的**

- 这是前端业务 API 服务层。
- 它通过 `RestService` 去调用后端 `/api/app/todo-item` 相关接口。
- 负责把 GET、POST、PUT、DELETE 这些请求封装起来，不让组件直接拼接口地址。

**依赖**

- `@abp/ng.core` 里的 `RestService`
- `rxjs`

**面试怎么说**

“我在前端也做了一层服务抽象，组件只关心业务动作，比如获取列表、创建待办、更新状态、删除待办，具体 HTTP 请求放到 `TodoApiService` 里，这样组件会更干净。”

#### 6. `HomeComponent`

**它是干嘛的**

- 负责页面展示和交互。
- 用响应式表单新增 Todo，用 `ToasterService` 做反馈，用 `ConfirmationService` 做删除确认。
- 这里属于典型的表现层逻辑，不放业务规则本身。

**依赖**

- `FormBuilder`
- `Validators`
- `ConfirmationService`
- `ToasterService`
- `TodoApiService`

**面试怎么说**

“组件层我尽量只保留 UI 交互和状态管理，比如表单校验、加载状态、删除确认、成功提示。真正的业务规则还是在后端实体和应用服务里。”

#### 7. `route.provider.ts`

**它是干嘛的**

- 负责往 ABP 的菜单系统里动态注册首页菜单。
- 也就是说，除了路由本身，左侧菜单项也是通过 ABP 提供的 `RoutesService` 配进去的。

**面试怎么说**

“ABP 前端不是只管页面跳转，还自带菜单体系。`route.provider.ts` 就是把首页菜单注册到应用布局里，让它出现在侧边栏。”

### 前端依赖怎么分类说

#### 1. ABP Angular 套件

- `@abp/ng.core`：ABP 前端核心能力，比如环境配置、路由、HTTP、国际化。
- `@abp/ng.oauth`：和后端 OpenIddict 对接的认证模块。
- `@abp/ng.account`：登录、账号相关页面和配置。
- `@abp/ng.identity`：用户、角色、身份管理页面。
- `@abp/ng.tenant-management`：多租户管理。
- `@abp/ng.setting-management`：系统设置管理。
- `@abp/ng.theme.shared`、`@abp/ng.theme.lepton-x`：ABP 官方主题和布局系统。
- `@abp/ng.components`：ABP 通用组件基础能力。

#### 2. Angular 基础依赖

- `@angular/core`、`@angular/common`、`@angular/router`：应用和路由基础。
- `@angular/forms`：响应式表单。
- `@angular/animations`：动画能力。
- `rxjs`：异步流和订阅模型。
- `zone.js`：Angular 变更检测运行时依赖。
- `tslib`：TypeScript 运行时辅助库。

#### 3. UI 和体验类依赖

- `bootstrap-icons`：图标。
- `@ng-bootstrap/ng-bootstrap`：Bootstrap 风格组件。
- `@ngx-validate/core`：校验辅助。

#### 4. 工程化依赖

- `@angular/cli`
- `@angular-devkit/build-angular`
- `@angular-eslint/*`
- `eslint`
- `karma`
- `jasmine`
- `typescript`

**面试怎么说**

“前端依赖我会分成四类讲：第一类是 ABP 套件，解决后台系统通用能力；第二类是 Angular 基础依赖；第三类是 UI 和交互；第四类是构建、测试和规范化工具。这样面试官会觉得你的依赖不是乱装的，而是按职责分层的。”

### 一个请求链路怎么讲

如果面试官让你串一次完整链路，可以这样说：

1. 前端 `HomeComponent` 触发新增待办。
2. `TodoApiService` 通过 `RestService` 调用 `/api/app/todo-item`。
3. ABP 把请求转到 `ITodoItemAppService` 对应的应用服务实现 `TodoItemAppService`。
4. 应用服务创建 `TodoItem` 领域对象，领域对象自己校验标题和用户 ID。
5. 应用服务通过 `IRepository<TodoItem, int>` 持久化。
6. `EntityFrameworkCore` 的 `TodoListDbContext` 把实体映射到 MySQL 的 `AppTodoItems` 表。
7. 返回结果后用 AutoMapper 映射成 `TodoItemDto`，再回到前端展示。

### 面试时可以直接说的一段完整版

“这个项目后端我采用的是 ABP 标准分层架构。最底层是 `Domain.Shared`，主要放常量、错误码、本地化资源、权限这些公共领域定义；再往上是 `Domain`，这里放真正的业务规则和实体，比如 `TodoItem` 会自己保证标题不能为空、长度不能超限；`Application.Contracts` 定义 DTO 和应用服务接口；`Application` 负责把具体用例串起来，比如增删改查 Todo；`HttpApi` 负责把应用服务暴露成接口；`HttpApi.Host` 是真正的 ASP.NET Core 启动入口，里面处理认证、Swagger、CORS 和中间件；`EntityFrameworkCore` 负责 MySQL 持久化、DbContext 和迁移；`DbMigrator` 则单独负责数据库初始化和种子数据。前端这边是 Angular SPA，`AppModule` 是根模块，负责把 ABP 的认证、主题、身份、租户、设置模块装起来；`AppRoutingModule` 负责路由和懒加载；`SharedModule` 负责公共组件复用；`HomeModule` 是当前项目的核心业务模块，页面通过 `TodoApiService` 去调后端 Todo API。整体上，这个项目业务不复杂，但它很适合展示 ABP 的模块化、分层职责和前后端解耦方式。” 

### 高频追问时的补充说法

#### 为什么要拆 `Application.Contracts` 和 `Application`

“因为契约和实现分离后，前端、Swagger、远程客户端都只依赖契约，不依赖实现，模块边界更清晰。”

#### 为什么要单独有 `HttpApi.Host`

“因为 `HttpApi` 只是接口能力模块，`Host` 才是组合根。把宿主单独拆出来，启动配置、部署、Docker 化都会更清晰。”

#### 为什么要单独有 `DbMigrator`

“这样数据库迁移和 Web 服务启动解耦，部署时可以先迁移再起服务，失败定位也更容易。”

#### 这个项目的自定义业务为什么看起来不多

“因为它本身是一个 ABP 模板上扩展出来的 TodoList 示例，重点不是复杂业务，而是展示如何在 ABP 提供的身份、权限、租户、OpenIddict、设置这些基础设施上叠加自定义业务模块。”