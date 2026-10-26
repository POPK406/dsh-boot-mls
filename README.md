# dsh-boot-mls · DSH NEXT 冷启动动画装配插件

把「透明冷启动 + 全屏鲸鱼揭幕 + 色块擦除进入界面」这套启动动画装到任一台 **DSH NEXT**（dsh-desktop-next 2.0.19-next 已校验）上，并把启动器、桌面快捷方式、还原链路一起配好。

> 动画不是本仓库原创。**出处见下节「来源与致谢」**——图形与引擎来自 MLS 主题包，本仓库只做「装配 / 落位 / 一键还原」这层壳。

## 来源与致谢

这套动画的**图形、时间轴与两段引擎代码**来自作者 **ALPDM00** 的两个 MIT 主题包：

| 用途 | 仓库 | 版本 / 许可 | 本包用到的文件 |
| --- | --- | --- | --- |
| **原 Web 版**（`web` profile 的 MLS 主题） | [ALPDM00/dsh-theme-mls](https://github.com/ALPDM00/dsh-theme-mls) | v0.2.0 · MIT | `src/boot/engine-intro.js`、`src/boot/boot.css`、`assets/boot/*` |
| **Harness 马拉松 UI 包**（`desktop` profile 专版，本动画的直接来源） | [ALPDM00/dsh-theme-mls-desktop](https://github.com/ALPDM00/dsh-theme-mls-desktop) | v0.5.1 · MIT | `src/boot/engine-marathon.js`（马拉松点阵/红波引擎）、`src/boot/engine-intro.js`（鲸鱼 → 五帧 HUI → 蓝板放大）、`src/boot/boot.css`（时间轴自定义属性）、`src/boot/done.{css,html}`、`assets/boot/{green-logo,blue-pixel,invert-blue-pixel}.png` |

进一步说明：

- 两段引擎最早来自一份独立页面 **`启动动画.html`**（作者原话「Extracted from the standalone boot animation (启动动画.html)」），主题包把它改成「作用域收敛到 `#dshMarBootHost`、去掉空格/点击重播、由宿主 driver 调用」的注入形态。本仓库内嵌的 `MLS_BOOT_HTML` 就是这一形态的产物（`dsh-theme-marathon` + `dsh-theme-mls-desktop` 两段脚本 + 配套 CSS/DOM/base64 图）。
- 派生关系已按字节核对：`payload/main.js` 与 `ALPDM00/dsh-theme-mls-desktop@main` 的 `src/boot/engine-marathon.js`（46,976 字符）、`src/boot/engine-intro.js`（11,766 字符）存在多段 100+ 字符的逐字相同代码行，且共享 `dshMarBootHost`、`mb-hui-*`、`__mbIntroStart`、`SOLID_COVER_AT` 等全部内部标识。
- 另有一个同内容的镜像仓库 [Oblivion-Ice/dsh-theme-mls-desktop](https://github.com/Oblivion-Ice/dsh-theme-mls-desktop)，内容与 ALPDM00 版一致；请以 ALPDM00 上游为准。
- 主题包声明「全部图形由插件在运行时程序化生成，不含任何 Bungie / Marathon 的版权素材」。本仓库同样不含此类素材，仅转载 MIT 许可下的代码与程序化图形。
- 若你是上游作者并希望调整署名或移除派生内容，提 issue 即可，会尽快处理。

## 本仓库做了什么（与主题包的分工）

主题包能在**已装好主题**的环境里播放动画；但 DSH NEXT 的启动首帧写死在壳子（`app.asar`）里，插件层拿不到首帧，所以必须改壳。本仓库负责这一层：

```
bin/asar.cjs            asar 读写（0x20 头部填充、条目对齐）
payload/main.js         打过补丁的 lib/main.js（含 mlsBootOverlay 覆盖层控制器）
payload/web-document.js 打过补丁的 lib/web-document.js（首帧 + 抑制主题二次动画）
payload/manifest.json   期望的原版文件摘要（版本校验）
payload/Launcher.cs     原生冷启动器源码（C# / WinForms）
payload/DSH-Boot-MLS.exe 编译好的启动器
payload/proxy-ca-*.pem  本机 TLS 中间代理根证书（可选，测网时用）
```

装配逻辑：

1. 只读校验 `resources/app.asar` 里 `lib/main.js` 与 `lib/web-document.js` 的 SHA-256 是否与 `payload/manifest.json` 一致（版本不符则拒绝，需 `--force` 或重新生成清单）；
2. 用 `payload/*` 替换这两个文件，重建出 `resources/app.asar.mls-transparent`（**不碰正在运行的原版**），其余条目逐字节校验一致；
3. 首次把原版备份为 `resources/app.asar.stock-mls`；
4. 原生启动器 `DSH-Boot-MLS.exe` 负责：关掉残留进程 → 换补丁包 → 启动 → 45 秒内检测到窗口即保留，否则自动回滚并弹窗说明、此后不再尝试；日志 `%LOCALAPPDATA%\mls-boot\launcher.log`。

## 手动装配（不装插件）

```powershell
# 1) 生成补丁包（只写 app.asar.mls-transparent，不动 app.asar）
node bin/install.cjs --check        # 只校验，不写文件
node bin/install.cjs                # 生成补丁包 + 备份原版

# 2) 冷启动：完全退出 DSH NEXT（含托盘），双击
payload\DSH-Boot-MLS.exe            # 或装到 %LOCALAPPDATA%\mls-boot\ 后建桌面快捷方式
```

还原：`payload\DSH-Boot-MLS.exe` 失败会自动回滚；手动还原把 `resources\app.asar.stock-mls` 覆盖回 `resources\app.asar` 即可，或删掉 `%LOCALAPPDATA%\mls-boot\state.json` 让启动器下次重试。

## 已知边界

- 只改壳内 `lib/main.js` 与 `lib/web-document.js`，**不碰主题插件、不碰 profile、不碰 DSH 配置**。
- 原生标题栏按钮在动画期间不隐藏（上游桌面版靠主题的壳补丁做这块，本包没做）。
- 每次冷启动播一次；刷新页面、从托盘再打开不重播。
- DSH NEXT 升级会覆盖 `app.asar`，届时需重跑 `bin/install.cjs`。

## Git 推送（本机已就绪）

本机已装 MinGit 2.56（`C:\Program Files\Git`），全局身份 `POPK406 <POPK406@users.noreply.github.com>`，`origin` 已带凭据，直接：

```powershell
cd <仓库目录>
& 'C:\Program Files\Git\cmd\git.exe' add -A
& 'C:\Program Files\Git\cmd\git.exe' commit -m "update"
& 'C:\Program Files\Git\cmd\git.exe' push
```

## 许可

本仓库装配层代码 MIT。`payload/main.js` 内嵌的引擎与图形来自 [ALPDM00/dsh-theme-mls-desktop](https://github.com/ALPDM00/dsh-theme-mls-desktop)（MIT）与 [ALPDM00/dsh-theme-mls](https://github.com/ALPDM00/dsh-theme-mls)（MIT），版权归原作者。
