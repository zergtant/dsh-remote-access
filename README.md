# dsh-remote-access（dsh 远程访问）

update： **dsh 0.2.1** 改动了插件 API，最新已适配，并且可以让Desktop进行远程访问。

历史版本：

- dsh-0.1.5：未改 API，只修了自签证书有效期（见下「安全模型」）。
- dsh-0.1.3-alpha.2：验证流程与 API 对齐（登录门禁 + 凭据库 + 设置命名空间）。
- dsh-0.1.2-alpha.1：更新了验证流程和API，最新修改已经兼容。
- 原v1.0 对应[dsh-v0.1.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.2) 

给 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的 web GUI 增加一个**自包含的 TLS 远程入口**：独立端口 + 自签证书 + 登录页 + 会话 cookie，之后透明代理到本机的 dsh web 服务器（默认 `127.0.0.1:3080`）。

> 把只在 `127.0.0.1` 上监听的 dsh GUI或者dsh Desktop ，安全地暴露给局域网 / frp 



![](screenshot.png)

## 功能

- **TLS edge**：独立端口（默认 `3081`）监听，自签证书（首次自动生成、自动续期）
- **登录门禁**：用户名 + 密码，登录后下发会话 cookie（`HttpOnly`/`SameSite=Lax`/`Secure`），按 IP 限速防爆破
- **透明代理**：HTTP 请求 + WebSocket 全部转发到回环 dsh，`Host`/`Origin` 改写为回环，dsh 的信任围栏照常把请求当作本地请求
- **设置面板**：GUI「设置 → 远程访问」一级菜单：「启动/停止」按钮（即时生效）+ 实时状态行 + TLS / 端口 / 监听地址 / 账号 / 密码（保存后热生效，改端口即时迁移，无需重启 dsh）
- **浏览器零改写**：GUI 原样加载；edge 仅在转发的 index.html 注入一行标记，让 dsh 客户端识别"本页 /api 由可信 edge 服务"


## 安装

> 前提：已有一个运行中的 dsh（桌面应用，或 `dsh web` 起的 Web 部署）。本插件是它的 **profile 插件**，装进哪个 profile 就服务于那个实例。

### 方式一：在 GUI 里装（推荐，桌面应用 / Web GUI 通用）

桌面应用和 Web GUI 用的是同一套客户端，界面完全一样：

1. 左侧「**插件**」页 → 右上「**添加插件**」
2. 在「**安装源**」里填下面之一，点「**安装**」：
   - **GitHub 仓库**：`github:zergtant/dsh-remote-access`（也可以填 `https://github.com/zergtant/dsh-remote-access`）
   - **本地源码目录**（绝对路径）：`D:\git\dsh-remote-access`、`/home/you/dsh-remote-access` —— 给已经有这份代码的人用
3. **完全重启 dsh**：桌面应用 = 退出并重开整个应用；`dsh web` = 重启那个进程
4. 设置 →「**远程访问**」→ 填密码 → 点「启动」

对话框接受的形式与 `pnpm add` 一致：**包名 / GitHub 地址 / 本地目录路径**。本地路径必须是**绝对路径**（管理器会拒绝相对路径：它不知道你的工作目录，相对路径还会被解析到 profile 里去）。

### 方式二：命令行安装

```bash
dsh plugin --profile web add github:zergtant/dsh-remote-access   # GitHub 源
dsh plugin --profile web add .                                   # 本地目录（先 cd 进去）
```

把 `--profile web` 换成 `--profile desktop` 就是装进桌面应用用的 profile。`dsh plugin` 就是 `pnpm add` 的转发 + bundles 登记，所以 `github:` / 本地目录 / 压缩包都行。

> **本地目录安装 = pnpm 的 `link:`**，profile 只拿到一个符号链接，**不会**代装被链接目录的依赖，所以要先在那个目录里跑一次 `pnpm install`（或 `npm install`）。本插件的 `selfsigned`（自签证书）与 `@deepseek-ai/schemastery`（Config 校验器）必须能在插件目录里解析到，否则宿主加载时会报 `failed to import`。GitHub / 压缩包安装不存在这个问题（pnpm 会一并装依赖）。
>
> 可能出现的问题：插件导入失败时 dsh 控制台只打印一行 `failed to import`，原因可能是 `$DSH_HOME/logs/startup-*.log`。
>
> Windows 上如果 `dsh` 不在 PATH（桌面应用只随包提供 `dsh.cmd`，且没有把它写进 PATH 的入口），用完整路径，例如 `<桌面安装目录>\resources\runtime\cli\bin\dsh.cmd`，或把该 `bin` 目录加进用户 PATH。

### 方式三：npm 安装

暂不支持

### 升级 / 卸载

```bash
dsh plugin --profile web update dsh-remote-access   # 升级（git 源重新拉取；本地 link 源请直接改代码后重启）
dsh plugin --profile web remove dsh-remote-access   # 卸载（bundles 登记自动移除）
```

GUI 里同样可以卸载：「插件」页 → 找到 `dsh-remote-access` → 卸载。

> 安装完都必须**重启 dsh** 生效。插件默认 `enabled: false`，不会自动监听任何端口，需在 GUI 里显式开启。

> **安装时 pnpm 会报一条 peer 提示，这是预期的**：
> `Issues with peer dependencies found ... missing peer @deepseek-ai/dsh-credentials`。
> 凭据 seam 由 dsh 安装闭包在 `$DSH_HOME/profiles/node_modules` 提供，不由 profile 自己安装，所以 pnpm 看不见它。装完 `pnpm peers check` 会一直显示这条，插件实际运行正常。本插件把两个 dsh 依赖按 dsh 自己的约定分开声明：`@deepseek-ai/dsh-credentials`（宿主 seam，必须共用宿主实例）放 `peerDependencies`；`@deepseek-ai/schemastery`（运行时校验器，可以自带一份）放 `dependencies`。
>
> 另外，0.2.x 会先做一次**版本兼容预检**：插件 `peerDependencies` 里的 `@deepseek-ai/dsh-*` 范围必须能覆盖当前运行的 dsh 版本，否则 `dsh plugin add`（GUI 的「安装」按钮同理）会直接拒绝安装（可用 `dsh plugin allow-version ... --accept-risk` 强行放行，但不建议）。本插件声明的是 `^0.2.1-alpha.1`。

## 使用

1. 装完**重启 dsh**（桌面端 = 重开整个应用；`dsh web` = 重启进程），然后打开 GUI：**设置 → 远程访问**
   （桌面应用里这张卡片同样可编辑——它是"本机窗口"，不算远程页）
2. 设置**密码**（必填，公网暴露时的唯一口令）、用户名（默认 `admin`）
3. 点页面顶部的**「启动」**按钮（即时生效，不用点保存）→ 立即在 `0.0.0.0:3081` 监听，按钮旁显示"运行中 · https://…"
4. 访问：
   - 本机：`https://127.0.0.1:3081`
   - 局域网：`https://<主机IP>:3081`
   - 公网：把 frp 隧道指向 `127.0.0.1:3081`
5. 浏览器首次访问会提示**自签证书不受信任**——点"高级 → 继续访问"即可（或用 `curl -k` 验证）。
   如果不想看这个提示，可以取消 **TLS** 复选框改用明文 http（但dsh有个小bug，所以这个方式是为cf反代使用）

### 配置项（设置卡片）

| 字段 | 默认 | 说明 |
|---|---|---|
| 启动/停止 | — | 页面顶部操作区：点「启动」立即拉起、点「停止」立即停止（均无需保存）；按钮旁实时显示 `运行中 · https://host:port` / `未启用` |
| TLS（https） | 开 | 自签 https；**关闭 = 明文 http**（内网/调试用，省掉浏览器证书告警），保存后生效 |
| 端口 | `3081` | 1–65535，保存后即时迁移监听 |
| 监听地址 | `0.0.0.0` | `0.0.0.0`（对外）/ `127.0.0.1`（仅本机，例如只给 frp 用） |
| 用户名 | `admin` | 登录用户名 |
| 密码 | — | 存 dsh 凭据库（`~/.dsh/.credentials.yaml`，0600），设置里留空=保持不变 |

**启动/停止永远用**已保存的配置**；TLS/端口/监听地址/用户名/密码改完都处于"未保存草稿"状态，点「保存」才应用——运行中保存 = 立即热迁移，停止中保存 = 下次启动生效。有未保存更改时页面显示琥珀色横幅提示，避免误以为服务已按新配置运行。

## 安全模型

- **主服务零暴露**：dsh 主 web 服务器仍只绑 `127.0.0.1`；对外只有本插件的 `3081`。
- **唯一门禁 = 登录口令**：edge 之后的 /api（含特权设置面）都由登录 cookie 保护。公网暴露时**务必使用强密码**。
- **证书**：自签（`localhost`/`127.0.0.1` SAN，10 年有效期，<30 天自动续期）。浏览器会告警；如需消除告警，可把 frp 终结 TLS 或用可信域名证书替换 `~/.dsh/dsh-remote-access/*.pem`。
- **http 模式（TLS 关闭）**：登录口令与会话 cookie **明文过网**，仅可用于受信任的内网或调试；公网暴露请保持 TLS 开启。

> 公网部署建议：配合 frp 的 `tls_enable`、SSH 跳板、或在更外层（frp/nginx/Caddy）再套一层可信证书与 IP 白名单。本插件只负责"TLS + 登录"，不替代网络层防护。

## 开发

```bash
# 改浏览器端后重新打包
npm install            # 装 esbuild（devDependency）
npm run build:client   # src/client.tsx → lib/client.js
# 宿主端是纯 JS，改完直接同步
npm run build:host     # src/index.js → lib/index.js
# 或一次全构建
npm run build
# 静态兼容性自检（不需要 dsh 或浏览器）
npm test。
```

本地调试（debug profile）

```bash
dsh --profile debug --from-default-profile web   # 建一个独立 profile
dsh plugin --profile debug add /path/to/dsh-remote-access
dsh --profile debug --port 3099 --no-open        # 换端口，避免和现有实例冲突
```

设置卡片写入的是 `$DSH_HOME/profiles/debug/cordis.patch.yml`（用户层），宿主端 `Config` 的 volatile 字段由它落盘。

## 卸载

两种方式任选：GUI「插件」页里找到 `dsh-remote-access` → 卸载；或命令行：

```bash
dsh plugin --profile web remove dsh-remote-access   # 移除依赖 + bundles 登记，并 pnpm install
```

装到桌面应用就换成 `--profile desktop`。然后重启 dsh；可选删除残留：`~/.dsh/dsh-remote-access/`（自签证书）与凭据库里的 `DSH_REMOTE_ACCESS_PASSWORD`（`~/.dsh/.credentials.yaml`，建议先在卡片里停用再卸载）。

## 已知限制

- 自签证书会触发浏览器告警（见上"安全模型"）。
- 会话为内存态，dsh 重启后需重新登录。
- 单进程单 edge：一个 dsh 实例对应一个 3081；本地要跑多实例要自行修改端口。
- **远程页面只读自己的卡片**：从 edge 打开的页面里「远程访问」卡片不可编辑（改了会断掉当前连接），要改配置请回到本机 GUI：web 端的 `127.0.0.1` 或桌面端窗口本身（两者都算本地）。
- **桌面端（dsh desktop）**：桌面应用就是"桌面 profile + Electron 外壳"，web 服务绑随机回环端口，宿主半边与 web 端是同一套代码；「插件 → 添加插件」安装已实测可用。浏览器半边的本地/远程判别按桌面端窗口（`dsh-app://app/`）口径对齐，桌面窗口里这张卡片保持可编辑。
- edge 监听失败（例如端口被占）只写日志，卡片状态行仍按配置显示"运行中"——状态行反映的是配置，不是监听结果。

## License

[MIT](./LICENSE)
