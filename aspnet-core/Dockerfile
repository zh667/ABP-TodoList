# ===========================
# Stage 1: Build
# ===========================
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# 安装 Node.js（ABP 前端资源安装需要 npm）
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 先复制 props 和 NuGet 配置以利用 Docker 缓存
COPY common.props NuGet.Config ./

# 复制所有项目文件以还原依赖
COPY src/TodoList.Domain.Shared/TodoList.Domain.Shared.csproj src/TodoList.Domain.Shared/
COPY src/TodoList.Domain/TodoList.Domain.csproj src/TodoList.Domain/
COPY src/TodoList.Application.Contracts/TodoList.Application.Contracts.csproj src/TodoList.Application.Contracts/
COPY src/TodoList.Application/TodoList.Application.csproj src/TodoList.Application/
COPY src/TodoList.EntityFrameworkCore/TodoList.EntityFrameworkCore.csproj src/TodoList.EntityFrameworkCore/
COPY src/TodoList.HttpApi/TodoList.HttpApi.csproj src/TodoList.HttpApi/
COPY src/TodoList.HttpApi.Client/TodoList.HttpApi.Client.csproj src/TodoList.HttpApi.Client/
COPY src/TodoList.HttpApi.Host/TodoList.HttpApi.Host.csproj src/TodoList.HttpApi.Host/
COPY src/TodoList.DbMigrator/TodoList.DbMigrator.csproj src/TodoList.DbMigrator/

RUN dotnet restore src/TodoList.HttpApi.Host/TodoList.HttpApi.Host.csproj
RUN dotnet restore src/TodoList.DbMigrator/TodoList.DbMigrator.csproj

# 复制全部源代码
COPY . .

# 安装 ABP 前端静态库到 wwwroot/libs（不依赖 ABP CLI）
# 1. npm install 下载前端依赖
# 2. 自定义脚本读取 abp.resourcemapping.js 并复制文件到 wwwroot/libs
RUN cd src/TodoList.HttpApi.Host \
    && npm install \
    && node ../../scripts/copy-abp-libs.js

# 发布
RUN dotnet publish src/TodoList.HttpApi.Host/TodoList.HttpApi.Host.csproj \
    -c Release -o /app/api --no-restore
RUN dotnet publish src/TodoList.DbMigrator/TodoList.DbMigrator.csproj \
    -c Release -o /app/migrator --no-restore

# ===========================
# Stage 2: API Runtime
# ===========================
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS api
WORKDIR /app
COPY --from=build /app/api .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "TodoList.HttpApi.Host.dll"]

# ===========================
# Stage 3: DbMigrator Runtime
# ===========================
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS migrator
WORKDIR /app
COPY --from=build /app/migrator .
ENTRYPOINT ["dotnet", "TodoList.DbMigrator.dll"]
