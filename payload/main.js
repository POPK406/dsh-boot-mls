import { i as readPrivateFile, r as privateDirectory, t as atomicJson } from "./private-files-BEfKAzcX.js";
import { a as maskSecrets } from "./log-record-Bjy6LjKi.js";
import { desktopKeybindings } from "./keybindings.js";
import { r as NATIVE_ACCESS_HEADER } from "./desktop-contract-Djnia2On.js";
import { _ as cleanupDisposableTree, d as parseFeatures, f as profileName, g as unpackedPath, o as NEXT_PACKAGE } from "./recovery-DYZd7b10.js";
import { n as IPC, r as SHELL_URL, t as APP_URL } from "./ipc-Cfin-W5Q.js";
import { DesktopBrowserGuests } from "./browser-guests.js";
import { desktopPermission } from "./permissions.js";
import { a as PNPM_IGNORE_MINIMUM_RELEASE_AGE, i as PNPM_DISABLE_UPDATE_NOTIFIER, n as bundledPnpmEntry, o as applyDesktopPackageManagerPolicy, t as ELECTRON_HEADERS_URL } from "./bundled-pnpm-oLjAQIHR.js";
import { t as NextDesktopRuntime } from "./desktop-runtime-jm_KDubT.js";
import { i as notificationEnabled, r as notificationCopy } from "./notifications-Byu3rRfH.js";
import { o as parsePreferences, r as probeSystemProxy, s as portsChanged } from "./system-proxy-DXciMFpz.js";
import { appRequestHeaders, forwardWebRequest, serveWebDocument } from "./web-document.js";
import { installAppDownloads } from "./app-downloads.js";
import { n as createPackageRunner } from "./extensions-BihKgtgo.js";
import { createRequire } from "node:module";
import { chmodSync, constants, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { X509Certificate, createHash, createPrivateKey, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { bindingKey, effectiveShortcuts, parseShortcutDefinitions, parseShortcutEdit, presentBinding } from "@deepseek-ai/dsh-client-shortcuts/protocol";
import { parseDocument } from "yaml";
import { BrowserWindow, screen, Menu, Notification, Tray, app, clipboard, desktopCapturer, dialog, ipcMain, nativeImage, nativeTheme, net, protocol, safeStorage, session, shell, systemPreferences } from "electron";
import { execFile, spawn } from "node:child_process";
import { Readable } from "node:stream";
import { homedir, networkInterfaces, userInfo } from "node:os";
import { DSH_ENV_PREFIX, SENSITIVE_ENV_PATTERN, scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { generate } from "selfsigned";
import { promisify } from "node:util";
//#region src/keyboard.ts
/** Product-window preference IPC and native menu interception during physical-key dispatch/recording. */
/**
* Install application-owned configuration handlers and attach each product window's input lifecycle.
* @param getWindow - current product window.
* @param userData - Electron-resolved device preference directory.
* @param platform - local device platform.
* @param updateMenu - rebuild the application menu when the close accelerator or availability changes.
* @param overlayInput - Current shell-owned input blocking state for the product window.
* @returns menu construction, editor key delivery, window attachment, and teardown operations.
*/
function installDesktopShortcuts(getWindow, userData, platform, updateMenu, overlayInput) {
	let definitions = [];
	let recording = false;
	let revision;
	let closeBinding = null;
	let editingInput;
	const scopedDesktop = platform === "windows" || platform === "macos";
	const disposers = /* @__PURE__ */ new Set();
	const guestInputs = /* @__PURE__ */ new Map();
	const closeAccelerator = () => presentBinding(closeBinding, platform).aria?.replace("Meta+", "Command+").replace(/Arrow(Up|Down|Left|Right)$/u, "$1");
	const sendMenuClose = () => {
		const window = getWindow();
		if (window === void 0 || window.isDestroyed() || !window.isFocused() || !window.isEnabled() || revision === void 0 || recording || overlayInput(window).blocked) return;
		window.webContents.send(IPC.shortcutsInput, {
			kind: "menu",
			commandId: "page.close",
			revision
		});
	};
	let keys = /* @__PURE__ */ new Set();
	const publish = (snapshot) => {
		const wasEnabled = revision !== void 0;
		const previousAccelerator = closeAccelerator();
		revision = definitions.length === 0 || snapshot.status === "loading" ? void 0 : snapshot.revision;
		const rows = snapshot.status === "loading" ? [] : effectiveShortcuts(definitions, snapshot.document, "desktop", platform);
		keys = new Set(rows.flatMap((row) => row.binding !== null && row.issue === null && row.conflicts.length === 0 ? [bindingKey(row.binding)] : []));
		const close = rows.find((row) => row.id === "page.close");
		closeBinding = close?.issue === null && close.conflicts.length === 0 ? close.binding : null;
		if (wasEnabled !== (revision !== void 0) || previousAccelerator !== closeAccelerator()) updateMenu();
		const window = getWindow();
		if (window !== void 0 && !window.isDestroyed() && window.webContents.mainFrame.url.startsWith("dsh-app://app/")) window.webContents.send(IPC.shortcutsChanged, snapshot);
	};
	const persistence = desktopKeybindings(userData, platform, publish);
	const assertSender = (event) => {
		const window = getWindow();
		if (window === void 0 || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error("desktop shortcuts: rejected sender");
		if (!event.senderFrame.url.startsWith("dsh-app://app/")) throw new Error("desktop shortcuts: rejected origin");
		return window;
	};
	ipcMain.handle(IPC.shortcutsGet, async (event, input) => {
		assertSender(event);
		definitions = parseShortcutDefinitions(input);
		persistence.setDefinitions(definitions);
		return persistence.readCurrent();
	});
	ipcMain.handle(IPC.shortcutsEdit, async (event, input, expectedRevision) => {
		assertSender(event);
		if (typeof expectedRevision !== "string") throw new Error("desktop shortcuts: invalid revision");
		return persistence.edit(parseShortcutEdit(input), expectedRevision);
	});
	ipcMain.handle(IPC.shortcutsRecording, (event, active) => {
		const window = assertSender(event);
		if (typeof active !== "boolean") throw new Error("desktop shortcuts: invalid recording state");
		recording = active;
		window.webContents.setIgnoreMenuShortcuts(active);
	});
	ipcMain.handle(IPC.shortcutsCloseWindow, (event, expected) => {
		const window = assertSender(event);
		if (expected !== revision || revision === void 0 || recording || !window.isFocused() || !window.isEnabled() || overlayInput(window).blocked) return;
		window.close();
	});
	function attachInput(window, contents, guestName) {
		let deadKey = false;
		const held = /* @__PURE__ */ new Set();
		const consumed = /* @__PURE__ */ new Map();
		let inputFrame = null;
		let inputRevision;
		let overlayRevision = overlayInput(window).revision;
		const resetInput = () => {
			deadKey = false;
			held.clear();
			consumed.clear();
			inputFrame = null;
			inputRevision = void 0;
			if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(false);
		};
		if (guestName !== void 0) guestInputs.set(contents, {
			window,
			reset: resetInput
		});
		const resetWindow = () => {
			resetInput();
			for (const guest of guestInputs.values()) if (guest.window === window) guest.reset();
		};
		const clear = () => {
			resetInput();
			if (guestName !== void 0) return;
			definitions = [];
			keys.clear();
			recording = false;
			persistence.setDefinitions(null);
		};
		const navigation = (event) => {
			if (event.isMainFrame && !event.isSameDocument) clear();
		};
		const beforeInput = (event, input) => {
			const overlay = overlayInput(window);
			if (overlay.revision !== overlayRevision) {
				resetInput();
				overlayRevision = overlay.revision;
			}
			if (overlay.blocked) {
				event.preventDefault();
				return;
			}
			if (event.defaultPrevented) {
				resetInput();
				return;
			}
			if (editingInput === contents) {
				held.clear();
				consumed.clear();
				contents.setIgnoreMenuShortcuts(true);
				return;
			}
			if (window !== getWindow() || !window.isFocused() || !window.isEnabled() || revision === void 0 || guestName !== void 0 && !contents.isFocused()) {
				contents.setIgnoreMenuShortcuts(false);
				held.clear();
				consumed.clear();
				return;
			}
			const modifiers = [
				"control",
				"alt",
				"shift",
				"meta"
			].filter((modifier) => input[modifier]);
			const key = bindingKey({
				code: input.code,
				modifiers
			});
			const match = keys.has(key);
			const menuMatch = closeBinding !== null && closeBinding.secondCode === void 0 && modifiers.join("+") === closeBinding.modifiers.join("+") && input.key.toUpperCase() === (closeBinding.code.startsWith("Key") ? closeBinding.code.slice(3) : input.code === closeBinding.code ? input.key.toUpperCase() : "");
			contents.setIgnoreMenuShortcuts(recording || match || menuMatch);
			const frame = contents.focusedFrame;
			const composing = input.isComposing || input.key === "Dead" || deadKey || input.modifiers.includes("altgr");
			if (input.type === "keyDown") deadKey = input.key === "Dead";
			if (recording || composing || frame === null) {
				held.clear();
				consumed.clear();
				return;
			}
			let binding = {
				code: input.code,
				modifiers
			};
			let priority = false;
			if (scopedDesktop) {
				if (frame !== inputFrame || inputRevision !== revision) {
					held.clear();
					inputFrame = frame;
					inputRevision = revision;
				}
				const modifierKey = /^(Control|Alt|Shift|Meta)(Left|Right)$/u.test(input.code);
				if (input.type === "keyUp") {
					if (consumed.get(input.code) === "press") event.preventDefault();
					consumed.delete(input.code);
					held.delete(input.code);
					if (modifierKey) held.clear();
					return;
				}
				if (!input.isAutoRepeat) consumed.delete(input.code);
				if (modifierKey) {
					held.clear();
					return;
				}
				if (input.isAutoRepeat && consumed.has(input.code) && !match) {
					event.preventDefault();
					return;
				}
				if (input.isAutoRepeat && !held.has(input.code) && !match) return;
				held.add(input.code);
				const codes = [input.code, ...[...held].filter((value) => value !== input.code)];
				codes.sort();
				const pair = {
					code: codes[0],
					...codes[1] === void 0 ? {} : { secondCode: codes[1] },
					modifiers
				};
				priority = keys.has(key);
				if (codes.length === 2 && keys.has(bindingKey(pair))) {
					binding = pair;
					priority = true;
				}
			}
			const main = guestName === void 0 && frame === contents.mainFrame;
			if (!priority && (main || !match)) return;
			event.preventDefault();
			if (input.type !== "keyDown") return;
			if (scopedDesktop) {
				if (!input.isAutoRepeat) {
					if (binding.secondCode !== void 0) {
						consumed.set(binding.code, "repeat");
						consumed.set(binding.secondCode, "repeat");
					}
					consumed.set(input.code, "press");
				}
				held.clear();
			}
			let embedding = frame;
			while (guestName === void 0 && !main && embedding.parent !== null && embedding.parent !== contents.mainFrame) embedding = embedding.parent;
			window.webContents.send(IPC.shortcutsInput, {
				kind: guestName === void 0 ? main ? "keyboard" : "iframe" : "webview",
				revision,
				frameName: guestName ?? (main ? "" : embedding.name),
				code: binding.code,
				...binding.secondCode === void 0 ? {} : { secondCode: binding.secondCode },
				repeat: input.isAutoRepeat,
				control: input.control,
				alt: input.alt,
				shift: input.shift,
				meta: input.meta
			});
		};
		const dispose = () => {
			contents.off("did-start-navigation", navigation);
			contents.off("before-input-event", beforeInput);
			contents.off("blur", resetInput);
			contents.off("destroyed", dispose);
			if (guestName === void 0) {
				window.off("blur", resetWindow);
				window.off("closed", closed);
			}
			disposers.delete(dispose);
			guestInputs.delete(contents);
			if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(false);
		};
		const closed = () => {
			clear();
			dispose();
		};
		contents.on("did-start-navigation", navigation);
		contents.on("before-input-event", beforeInput);
		contents.on("blur", resetInput);
		contents.once("destroyed", dispose);
		if (guestName === void 0) {
			window.on("closed", closed);
			window.on("blur", resetWindow);
		}
		disposers.add(dispose);
		return dispose;
	}
	return {
		sendEditingKey(keyCode, modifiers) {
			const window = getWindow();
			if (window === void 0 || window.isDestroyed() || overlayInput(window).blocked) return;
			const contents = [...guestInputs].find(([guest, owner]) => owner.window === window && !guest.isDestroyed() && guest.isFocused())?.[0] ?? window.webContents;
			contents.focus();
			const previous = editingInput;
			editingInput = contents;
			try {
				contents.sendInputEvent({
					type: "keyDown",
					keyCode,
					modifiers
				});
				contents.sendInputEvent({
					type: "keyUp",
					keyCode,
					modifiers
				});
			} finally {
				editingInput = previous;
				if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(recording);
			}
		},
		fileMenu: (labels) => {
			const accelerator = closeAccelerator();
			return {
				label: labels.fileMenu,
				submenu: [{
					id: "dsh-page-close",
					label: labels.closePage,
					enabled: revision !== void 0,
					...accelerator === void 0 ? {} : { accelerator },
					click: sendMenuClose
				}]
			};
		},
		attach(window) {
			attachInput(window, window.webContents);
		},
		attachGuest: attachInput,
		dispose() {
			for (const dispose of disposers) dispose();
			persistence.dispose();
			for (const channel of [
				IPC.shortcutsGet,
				IPC.shortcutsEdit,
				IPC.shortcutsRecording,
				IPC.shortcutsCloseWindow
			]) ipcMain.removeHandler(channel);
		}
	};
}
/** Return whether one process invocation belongs to the installer quit handoff. */
function isDesktopInstallerQuitRequest(argv, platform) {
	return platform === "win32" && argv.includes("--dsh-installer-quit");
}
//#endregion
//#region src/single-instance.ts
/** Electron single-instance ownership before any Desktop profile lifecycle begins. */
/**
* Claim the process-lifetime Desktop lock and route later launches to the owner.
* @param application - Electron application singleton.
* @param focusOwner - focus or recreate the primary window after a later launch.
* @returns true only in the process that may access the Desktop profile.
*/
function claimDesktopSingleInstance(application, focusOwner, invocation = {
	platform: process.platform,
	argv: process.argv
}) {
	if (!application.requestSingleInstanceLock()) {
		application.quit();
		return false;
	}
	if (isDesktopInstallerQuitRequest(invocation.argv, invocation.platform)) {
		application.quit();
		return false;
	}
	application.on("second-instance", (_event, argv = []) => {
		if (isDesktopInstallerQuitRequest(argv, invocation.platform)) application.quit();
		else focusOwner();
	});
	return true;
}
//#endregion
//#region src/menu-locale.ts
/** Built-in Desktop languages and the native-menu copy. */
const en = {
	application: "Application",
	edit: "Edit",
	menuBar: "Application menu",
	undo: "Undo",
	redo: "Redo",
	cut: "Cut",
	copy: "Copy",
	paste: "Paste",
	delete: "Delete",
	selectAll: "Select All"
};
const zh = {
	application: "应用",
	edit: "编辑",
	menuBar: "应用菜单",
	undo: "撤销",
	redo: "重做",
	cut: "剪切",
	copy: "复制",
	paste: "粘贴",
	delete: "删除",
	selectAll: "全选"
};
/** Follow the OS preference order, using the same primary-language match as the official frontend. */
function preferredDesktopLocale(languages) {
	for (const language of languages) {
		const primary = language.toLowerCase().replaceAll("_", "-").split("-")[0];
		if (primary === "zh" || primary === "en") return primary;
	}
	return "en";
}
function resolveDesktopLocale(language) {
	return { messages: language.toLowerCase().startsWith("zh") ? zh : en };
}
//#endregion
//#region src/native-locale.ts
/** Recovery must not depend on a running Host to recover the UI language. */
function supported(value) {
	if (typeof value !== "string" || !/^(zh|en)(?:[-_][a-zA-Z0-9]+)*$/iu.test(value)) return void 0;
	return preferredDesktopLocale([value]);
}
var NativeLocaleStore = class {
	home;
	constructor(home) {
		this.home = home;
	}
	get file() {
		return join(this.home, "desktop-locale.json");
	}
	read() {
		try {
			const value = JSON.parse(readPrivateFile(this.file, 64 * 1024) ?? "{}");
			if (!value || typeof value !== "object" || Array.isArray(value)) return {};
			return Object.fromEntries(Object.entries(value).filter(([, locale]) => supported(locale) !== void 0));
		} catch {
			return {};
		}
	}
	resolve(profile, fallback) {
		try {
			const document = parseDocument(readPrivateFile(join(this.home, "profiles", profile, "cordis.patch.yml")) ?? "[]", { logLevel: "silent" });
			if (document.errors.length === 0) {
				const rows = document.toJS({ maxAliasCount: 100 });
				if (Array.isArray(rows)) {
					let preference;
					for (const row of rows) if (row?.id === "locale" && row.disabled !== true && row.config && Object.hasOwn(row.config, "preference")) preference = supported(row.config.preference);
					if (preference) return preference;
				}
			}
		} catch {}
		return supported(this.read()[profile]) ?? preferredDesktopLocale([fallback]);
	}
	remember(profile, language) {
		const locale = supported(language);
		if (!locale) return;
		const saved = this.read();
		if (saved[profile] === locale) return;
		atomicJson(this.file, {
			...saved,
			[profile]: locale
		});
	}
};
//#endregion
//#region src/shell-environment.ts
/** Recover selected login-shell exports for packaged Unix desktop launches. */
const DEFAULT_CAPTURE_TIMEOUT_MS = 2e3;
const MAX_CAPTURE_BYTES = 1024 * 1024;
const SUPPORTED_SHELL_ARGUMENTS = /* @__PURE__ */ new Map([
	["bash", ["-ilc"]],
	["fish", [
		"--login",
		"--interactive",
		"--command"
	]],
	["zsh", ["-ilc"]]
]);
/**
* Exported rc variables that Desktop may recover in addition to PATH.
*
* Keep this list deliberately narrow: shell startup files are trusted user
* code, but their complete exported environment is not an appropriate ambient
* API for Electron or model-facing subprocesses.
*/
const DESKTOP_SHELL_ENVIRONMENT_KEYS = /* @__PURE__ */ new Set([
	"ANDROID_HOME",
	"ANDROID_SDK_ROOT",
	"ASDF_DATA_DIR",
	"ASDF_DIR",
	"BUN_INSTALL",
	"CARGO_HOME",
	"CONDA_DEFAULT_ENV",
	"CONDA_PREFIX",
	"DENO_INSTALL",
	"DOTNET_ROOT",
	"FLUTTER_ROOT",
	"GEM_HOME",
	"GEM_PATH",
	"GOBIN",
	"GOMODCACHE",
	"GOPATH",
	"GOROOT",
	"HOMEBREW_CELLAR",
	"HOMEBREW_PREFIX",
	"HOMEBREW_REPOSITORY",
	"JAVA_HOME",
	"LANG",
	"LANGUAGE",
	"MISE_CACHE_DIR",
	"MISE_CONFIG_DIR",
	"MISE_DATA_DIR",
	"MISE_STATE_DIR",
	"NVM_BIN",
	"NVM_DIR",
	"NVM_INC",
	"PNPM_HOME",
	"PYENV_ROOT",
	"RBENV_ROOT",
	"RUSTUP_HOME",
	"SDKMAN_DIR",
	"SDKROOT",
	"TZ",
	"VIRTUAL_ENV",
	"VOLTA_HOME"
]);
/**
* Parse the NUL-delimited payload emitted by the shell capture command.
* @param payload - Captured bytes from the command's private file descriptor.
* @param startMarker - Random record that begins the environment payload.
* @param endMarker - Random record that ends the environment payload.
* @returns Environment entries found between the markers.
*/
function parseShellEnvironment(payload, startMarker, endMarker) {
	const start = `${startMarker}\0`;
	const end = `${endMarker}\0`;
	const text = payload.toString("utf8");
	const startIndex = text.indexOf(start);
	if (startIndex < 0) throw new Error("desktop shell environment did not emit its start marker");
	const bodyStart = startIndex + start.length;
	const endIndex = text.indexOf(end, bodyStart);
	if (endIndex < 0) throw new Error("desktop shell environment did not emit its end marker");
	const environment = {};
	for (const record of text.slice(bodyStart, endIndex).split("\0")) {
		if (record === "") continue;
		const separator = record.indexOf("=");
		if (separator <= 0) throw new Error("desktop shell environment emitted an invalid record");
		environment[record.slice(0, separator)] = record.slice(separator + 1);
	}
	return environment;
}
/**
* Capture one interactive login shell's exported environment without accepting
* startup-file stdout or stderr as environment records.
* @param shell - Absolute zsh, bash, or fish executable.
* @param home - Working directory for shell startup.
* @param environment - Already-scrubbed environment inherited by the shell.
* @param timeoutMs - Hard deadline before the shell is killed.
* @returns Environment printed after the shell startup files finish.
*/
async function captureLoginShellEnvironment(shell, home, environment, timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS) {
	if (!isAbsolute(shell)) throw new Error("desktop shell environment requires an absolute shell path");
	const shellArguments = SUPPORTED_SHELL_ARGUMENTS.get(basename(shell).toLowerCase());
	if (shellArguments === void 0) throw new Error("desktop shell environment does not support this shell");
	const nonce = randomBytes(16).toString("hex");
	const startMarker = `dsh-shell-env-start-${nonce}`;
	const endMarker = `dsh-shell-env-end-${nonce}`;
	const command = `/usr/bin/printf '%s\\0' '${startMarker}'; /usr/bin/env -0; /usr/bin/printf '%s\\0' '${endMarker}'`;
	const child = spawn(shell, [...shellArguments, command], {
		cwd: home,
		detached: true,
		env: environment,
		stdio: [
			"ignore",
			"pipe",
			"ignore"
		],
		windowsHide: true
	});
	const killShellTree = () => {
		try {
			if (child.pid === void 0) child.kill("SIGKILL");
			else process.kill(-child.pid, "SIGKILL");
		} catch {
			try {
				child.kill("SIGKILL");
			} catch {}
		}
	};
	const output = child.stdout;
	if (output === null) {
		const closed = new Promise((resolve) => {
			child.once("error", () => {});
			child.once("close", () => {
				resolve();
			});
		});
		killShellTree();
		await closed;
		throw new Error("desktop shell environment has no capture stream");
	}
	return await new Promise((resolve, reject) => {
		const chunks = [];
		let byteLength = 0;
		let failure;
		let reading = true;
		const stopReading = () => {
			if (!reading) return;
			reading = false;
			output.off("data", accept);
		};
		const failAndKill = (error) => {
			if (failure !== void 0) return;
			failure = error;
			stopReading();
			output.destroy();
			killShellTree();
		};
		const accept = (chunk) => {
			try {
				const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				byteLength += buffer.byteLength;
				if (byteLength > MAX_CAPTURE_BYTES) {
					failAndKill(/* @__PURE__ */ new Error(`desktop shell environment exceeded ${String(MAX_CAPTURE_BYTES)} bytes`));
					return;
				}
				chunks.push(buffer);
			} catch (error) {
				failAndKill(error instanceof Error ? error : new Error(String(error)));
			}
		};
		output.on("data", accept);
		child.once("error", failAndKill);
		const timer = setTimeout(() => {
			failAndKill(/* @__PURE__ */ new Error(`desktop shell environment timed out after ${String(timeoutMs)}ms`));
		}, timeoutMs);
		child.once("close", () => {
			clearTimeout(timer);
			stopReading();
			if (failure !== void 0) {
				reject(failure);
				return;
			}
			try {
				resolve(parseShellEnvironment(Buffer.concat(chunks), startMarker, endMarker));
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	});
}
function inheritedEnvironment(fallbackReason) {
	return {
		updates: {},
		source: "process",
		fallbackReason
	};
}
function isOfficiallyScrubbedName(name) {
	return !SENSITIVE_ENV_PATTERN.test(name) && !name.toUpperCase().startsWith(DSH_ENV_PREFIX);
}
function isSelectedShellEnvironmentName(name) {
	return name === "PATH" || name.startsWith("LC_") || DESKTOP_SHELL_ENVIRONMENT_KEYS.has(name);
}
/**
* Select safe, useful login-shell exports without overriding an explicit app
* launch environment. PATH is the sole exception: its login-shell value wins.
*/
function selectDesktopShellEnvironment(captured, inherited) {
	const updates = {};
	for (const [name, value] of Object.entries(captured)) {
		if (value === void 0 || !isOfficiallyScrubbedName(name) || !isSelectedShellEnvironmentName(name)) continue;
		if (name === "PATH") {
			if (value !== "") updates.PATH = value;
			continue;
		}
		if (inherited[name] === void 0) updates[name] = value;
	}
	return updates;
}
function resolveUserShell(options) {
	if (options.shell !== void 0) return options.shell;
	try {
		const accountShell = userInfo().shell;
		if (accountShell !== "" && accountShell !== null) return accountShell;
	} catch {}
	return options.environment.SHELL;
}
/**
* Resolve selected login-shell exports for a desktop Host launch.
* @param options - Platform, launch environment and optional capture seams.
* @returns Updates for packaged Unix desktops, otherwise an empty update set.
*/
async function resolveDesktopShellEnvironment(options) {
	if (!options.isPackaged) return inheritedEnvironment("not-packaged");
	if (options.platform === "win32") return inheritedEnvironment("windows");
	if (options.platform !== "darwin" && options.platform !== "linux") return inheritedEnvironment("unsupported-platform");
	const shell = resolveUserShell(options);
	if (shell === void 0 || shell === "") return inheritedEnvironment("missing-shell");
	if (!isAbsolute(shell) || !SUPPORTED_SHELL_ARGUMENTS.has(basename(shell).toLowerCase())) return inheritedEnvironment("unsupported-shell");
	try {
		const captureEnvironment = {
			...(options.scrubParent ?? scrubbedParentEnv)(),
			HOME: options.home,
			SHELL: shell
		};
		const updates = selectDesktopShellEnvironment(await (options.capture ?? captureLoginShellEnvironment)(shell, options.home, captureEnvironment, options.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS), options.environment);
		if (updates.PATH === void 0) return inheritedEnvironment("missing-path");
		return {
			updates,
			source: "login-shell"
		};
	} catch {
		return inheritedEnvironment("capture-failed");
	}
}
//#endregion
//#region src/shell-locale.ts
/** Give GUI launches a UTF-8 locale when neither the launch environment nor the login shell names one, as Terminal.app does for its shells. */
/** Where macOS installs its locale definitions. */
const LOCALE_DIRECTORY = "/usr/share/locale";
/** The variables POSIX programs consult for their character set; any one of them keeps the environment as it is. */
const LOCALE_VARIABLES = [
	"LC_ALL",
	"LC_CTYPE",
	"LANG"
];
/**
* UTF-8 locale names for the system languages, most preferred first, ending with the English and
* language-neutral names every macOS installs.
* @param languages - BCP 47 tags as `app.getPreferredSystemLanguages()` lists them.
* @returns Candidate names such as `zh_CN.UTF-8`.
*/
function utf8LocaleCandidates(languages) {
	const candidates = [];
	for (const tag of languages) {
		const [language, ...rest] = tag.split("-");
		if (language === void 0 || !/^[A-Za-z]{2,3}$/u.test(language)) continue;
		const region = rest.find((part) => /^[A-Za-z]{2}$/u.test(part));
		const script = rest.find((part) => /^[A-Za-z]{4}$/u.test(part));
		const resolved = region ?? (language.toLowerCase() === "zh" ? script?.toLowerCase() === "hant" ? "TW" : "CN" : void 0);
		if (resolved !== void 0) candidates.push(`${language.toLowerCase()}_${resolved.toUpperCase()}.UTF-8`);
	}
	candidates.push("en_US.UTF-8", "C.UTF-8");
	return [...new Set(candidates)];
}
/**
* Set `LANG` to the first installed candidate when the environment names no locale at all.
*
* Finder and Dock launches carry no locale variables, and many shell startup files export none
* because Terminal.app sets `LANG` for the shells it opens. Without one, the Host's terminals and
* tool subprocesses run in the C locale, where `ls` prints `?` for every non-ASCII file name. The
* fallback never overrides a value the launch environment or the login shell provided.
* @param environment - Environment the Host will inherit; `LANG` is set in place.
* @param platform - Only macOS keeps its locales in one fixed directory and omits `LANG` from GUI launches.
* @param languages - System languages in preference order.
* @param installed - Whether a locale name is installed; defaults to the system locale directory.
* @returns The locale set, or undefined when the environment already had one or none is installed.
*/
function ensureUtf8Locale(environment, platform, languages, installed = (name) => existsSync(join(LOCALE_DIRECTORY, name))) {
	if (platform !== "darwin" || LOCALE_VARIABLES.some((name) => environment[name])) return void 0;
	const locale = utf8LocaleCandidates(languages).find(installed);
	if (locale !== void 0) environment.LANG = locale;
	return locale;
}
//#endregion
//#region src/update-state.ts
function updateLabel(state, language) {
	const t = (zh, en) => language.toLowerCase().startsWith("zh") ? zh : en;
	switch (state.phase) {
		case "checking": return t("正在检查更新…", "Checking for updates…");
		case "current": return t("已是最新版本", "Up to date");
		case "available": return t(`发现新版本 ${state.version}`, `Update available: ${state.version}`);
		case "downloading": {
			const progress = state.total ? `${Math.min(100, Math.floor((state.received ?? 0) / state.total * 100))}%` : `${Math.floor((state.received ?? 0) / 1048576)} MB`;
			return t(`正在下载更新 ${progress}`, `Downloading update ${progress}`);
		}
		case "preparing": return t("正在准备安装…", "Preparing update…");
		case "ready": return t(`${state.version} 已下载，安装并重启`, `${state.version} downloaded — Install and restart`);
		case "installing": return t("正在安装并重启…", "Installing and restarting…");
		case "error":
			if (state.error === "development") return t("开发环境可检查更新，请使用安装版进行更新。", "Updates can be checked in development. Install a packaged build to update.");
			if (state.error === "unsupported") return t("当前平台暂不支持应用内更新。", "In-app updates are unavailable on this platform.");
			if (state.error === "service") return t("暂时无法获取 Next 更新，请稍后重试。", "Next updates are temporarily unavailable. Try again later.");
			return t("更新未完成，请重试。", "The update could not be completed. Please retry.");
		default: return t("检查更新", "Check for updates");
	}
}
function updateAction(state) {
	if (state.phase === "ready") return "install-update";
	if (state.phase === "available" || state.phase === "error" && state.version && state.error !== "service") return "download-update";
	if ([
		"idle",
		"current",
		"error"
	].includes(state.phase)) return "check-updates";
}
//#endregion
//#region src/desktop-menu.ts
function desktopMenu(state, language, show, run) {
	const t = (zh, en) => language.toLowerCase().startsWith("zh") ? zh : en;
	const action = (label, type, enabled = true) => ({
		label,
		enabled: enabled && (!state.busy || type === "controls"),
		click: () => run({ type }),
		...type === "controls" ? { accelerator: "CmdOrCtrl+," } : {}
	});
	return [
		{
			label: t("打开 DSH NEXT", "Open DSH NEXT"),
			click: show
		},
		action(t("重新加载界面", "Reload Interface"), "reload", state.phase === "ready"),
		action(t("退出并重启", "Quit and Restart"), "restart-app"),
		{ type: "separator" },
		...["darwin", "win32"].includes(state.platform) ? [action(t("打开 DSH 终端", "Open DSH Terminal"), "terminal")] : [],
		action(t("导出诊断信息…", "Export Diagnostics…"), "diagnostics"),
		action(state.safeMode ? t("退出安全模式并重启…", "Exit Safe Mode and Restart…") : t("进入安全模式…", "Enter Safe Mode…"), state.safeMode ? "normal-mode" : "safe-mode"),
		{ type: "separator" },
		{
			label: `${t("Profile：", "Profile: ")}${state.selected}`,
			submenu: [
				...state.profiles.map((name) => ({
					label: state.unavailableProfiles.includes(name) ? `${name}${t("（不可用于桌面端）", " (Unavailable for Desktop)")}` : name,
					type: "radio",
					checked: name === state.selected,
					enabled: !state.busy && !state.unavailableProfiles.includes(name),
					click: () => {
						if (name !== state.selected || state.safeMode || state.phase !== "ready") run({
							type: "switch",
							name
						});
					}
				})),
				{ type: "separator" },
				{
					label: t("新建 Profile…", "New Profile…"),
					enabled: !state.busy,
					click: () => run({
						type: "controls",
						page: "create-profile"
					})
				},
				{
					label: t("管理 Profile…", "Manage Profiles…"),
					click: () => run({
						type: "controls",
						page: "profiles"
					})
				}
			]
		},
		{ type: "separator" },
		action(t("设置…", "Settings…"), "controls"),
		...["darwin", "win32"].includes(state.platform) && state.updates ? [action(updateLabel(state.updates, language), updateAction(state.updates) ?? "check-updates", !!updateAction(state.updates))] : [],
		...state.browserUrl ? [action(t("在浏览器中打开", "Open in Browser"), "open-browser")] : [],
		{
			label: t("恢复助手…", "Recovery Assistant…"),
			click: () => run({
				type: "controls",
				page: "recovery"
			})
		},
		{ type: "separator" },
		{
			label: t("退出", "Quit"),
			accelerator: "CmdOrCtrl+Q",
			click: () => run({ type: "quit" })
		}
	];
}
//#endregion
//#region src/window-material.ts
function windowMaterial(preferences, platform = process.platform) {
	if (platform === "darwin") return preferences.macosMaterial;
	return "off";
}
//#endregion
//#region src/native-desktop.ts
/** Electron-only tray, materials, and user-turn notifications. */
function applyWindowMaterial(window, preferences) {
	const material = windowMaterial(preferences);
	if (process.platform === "darwin") window.setVibrancy(material === "transparent" ? "sidebar" : null);
	window.setBackgroundColor(material === "off" ? nativeTheme.shouldUseDarkColors ? "#1b1b1c" : "#f9fafb" : "#00000000");
	window.webContents.send(IPC.material, material);
}
var NativeDesktop = class {
	options;
	tray;
	notifications = /* @__PURE__ */ new Set();
	constructor(options) {
		this.options = options;
	}
	get available() {
		return !!this.tray && !this.tray.isDestroyed();
	}
	createTray() {
		try {
			const icon = nativeImage.createFromPath(unpackedPath(join(this.options.root, "assets", process.platform === "darwin" ? "tray-iconTemplate.png" : "tray-icon-blue.png")));
			if (icon.isEmpty()) throw new Error("Tray icon is unavailable");
			if (process.platform === "darwin") icon.setTemplateImage(true);
			this.tray = new Tray(icon);
			this.tray.on("click", this.options.show);
			this.tray.on("double-click", this.options.show);
			this.refresh();
		} catch (error) {
			this.options.warn(error);
		}
	}
	items() {
		return desktopMenu(this.options.state(), this.options.language(), this.options.show, this.options.run);
	}
	refresh() {
		if (process.platform !== "win32") Menu.setApplicationMenu(Menu.buildFromTemplate([
			{
				label: "DSH NEXT",
				submenu: this.items()
			},
			{ role: "editMenu" },
			{ role: "viewMenu" },
			{ role: "windowMenu" }
		]));
		if (!this.available) return;
		const state = this.options.state();
		this.tray.setToolTip(`DSH NEXT · ${state.selected} · ${state.phase}${state.updates && state.updates.phase !== "idle" ? ` · ${updateLabel(state.updates, this.options.language())}` : ""}`);
		if (process.platform === "darwin") {
			const progress = state.updates;
			this.tray.setTitle(progress?.phase === "downloading" ? progress.total ? `${Math.min(100, Math.floor((progress.received ?? 0) / progress.total * 100))}%` : `${Math.floor((progress.received ?? 0) / 1048576)} MB` : progress?.phase === "ready" ? "✓" : "");
		}
		this.tray.setContextMenu(Menu.buildFromTemplate(this.items()));
	}
	notify(message) {
		const state = this.options.state();
		const window = this.options.window();
		if (!Notification.isSupported() || !notificationEnabled(state.preferences, message.outcome) || window?.isFocused()) return;
		const notification = new Notification(notificationCopy(message, this.options.language()));
		this.notifications.add(notification);
		notification.once("click", this.options.show);
		notification.once("close", () => this.notifications.delete(notification));
		notification.once("failed", (_event, error) => {
			this.notifications.delete(notification);
			this.options.warn(error);
		});
		notification.show();
		if (this.notifications.size > 10) {
			const oldest = this.notifications.values().next().value;
			oldest.close();
			this.notifications.delete(oldest);
		}
	}
	notifyUpdate(version, onSelect) {
		if (!Notification.isSupported()) {
			onSelect();
			return;
		}
		const notification = new Notification({
			title: "DSH NEXT",
			body: this.options.language().toLowerCase().startsWith("zh") ? `发现新版本 v${version}，点击下载更新。` : `DSH NEXT v${version} is available. Click to download the update.`
		});
		this.notifications.add(notification);
		notification.once("click", () => {
			this.options.show();
			onSelect();
		});
		notification.once("close", () => this.notifications.delete(notification));
		notification.once("failed", (_event, error) => {
			this.notifications.delete(notification);
			this.options.warn(error);
		});
		notification.show();
		if (this.notifications.size > 10) {
			const oldest = this.notifications.values().next().value;
			oldest.close();
			this.notifications.delete(oldest);
		}
	}
	close() {
		this.tray?.destroy();
		this.tray = void 0;
		for (const item of this.notifications) item.close();
		this.notifications.clear();
	}
};
//#endregion
//#region src/lan-addresses.ts
/** Startup-sampled IPv4 authorities admitted by the Desktop LAN HTTPS edge. */
function canonicalIpv4(address) {
	const parts = address.split(".");
	return parts.length === 4 && parts.every((part) => /^\d{1,3}$/u.test(part) && String(Number(part)) === part && Number(part) <= 255);
}
/** Return a stable, duplicate-free snapshot of non-loopback LAN IPv4 literals. */
function desktopLanAddresses(interfaces = networkInterfaces()) {
	const addresses = Object.values(interfaces).flatMap((values) => values ?? []).filter((value) => value.family === "IPv4" && !value.internal && canonicalIpv4(value.address)).map((value) => value.address);
	return Object.freeze([...new Set(addresses)].sort((left, right) => left.localeCompare(right)));
}
//#endregion
//#region src/lan-https-certificate.ts
/** Private local CA and short-lived certificates for Desktop LAN HTTPS. */
const STATE_DIRECTORY_NAME = "lan-https";
const STATE_FILENAME = "ca.json";
const STATE_VERSION = 1;
const PRIVATE_DIRECTORY_MODE$1 = 448;
const PRIVATE_FILE_MODE$3 = 384;
const MAX_STATE_BYTES = 128 * 1024;
const MAX_ADDRESSES = 64;
const CA_COMMON_NAME = "DeepSeek Harness Desktop Local CA";
const CA_VALIDITY_DAYS = 3650;
const LEAF_VALIDITY_DAYS = 30;
const RSA_KEY_SIZE = 2048;
const SERVER_AUTH_OID = "1.3.6.1.5.5.7.3.1";
const CHECK_POSIX_MODE = process.platform !== "win32";
const SHA256_WITH_RSA_OID = Buffer.from("06092a864886f70d01010b", "hex");
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
/** Stable, non-secret failure surfaced by the LAN HTTPS certificate boundary. */
var DesktopLanHttpsCertificateError = class extends Error {
	code;
	constructor(code, message, options = {}) {
		super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
		this.name = "DesktopLanHttpsCertificateError";
		this.code = code;
	}
};
/** Log only the certificate boundary's controlled description, never a raw OS error or key material. */
function lanHttpsCertificateDiagnostic(error) {
	if (!(error instanceof DesktopLanHttpsCertificateError)) return "LAN HTTPS certificate setup failed (unexpected error)";
	return `LAN HTTPS certificate setup failed (${error.code}): ${error.message}`;
}
function certificateError(code, message, cause) {
	return new DesktopLanHttpsCertificateError(code, `dsh-desktop-next: ${message}`, cause === void 0 ? {} : { cause });
}
/** Exact state path below one Electron userData directory. */
function desktopLanHttpsCertificateStatePath(userDataDir) {
	if (typeof userDataDir !== "string" || userDataDir.length === 0 || /[\0\r\n]/u.test(userDataDir) || !isAbsolute(userDataDir)) throw certificateError("certificate-state", "LAN HTTPS userData must be an absolute path without control characters.");
	return join(resolve(userDataDir), STATE_DIRECTORY_NAME, STATE_FILENAME);
}
/**
* Load or create the installation-local CA, then issue a fresh RSA leaf for
* the exact canonical IPv4 addresses supplied by the ingress boundary.
*/
async function createLanHttpsCertificate(userDataDir, addresses, protector) {
	const statePath = desktopLanHttpsCertificateStatePath(userDataDir);
	const validatedAddresses = validateAddresses(addresses);
	const usableProtector = await requireAvailableProtector(protector);
	await prepareStateDirectory$1(resolve(userDataDir), join(resolve(userDataDir), STATE_DIRECTORY_NAME));
	let ca;
	try {
		ca = await withFileLock(statePath, async () => {
			const stateText = await readPrivateStateFile(statePath);
			if (stateText !== void 0) return openPersistedCa(parsePersistedState(stateText), usableProtector);
			const created = await generateCa();
			await persistCa(statePath, created, usableProtector);
			return created;
		}, { waitMs: 1e4 });
	} catch (cause) {
		if (cause instanceof DesktopLanHttpsCertificateError) throw cause;
		throw certificateError("certificate-state", "LAN HTTPS CA state could not be accessed safely.", cause);
	}
	const leaf = await generateLeaf(ca, validatedAddresses);
	return Object.freeze({
		key: leaf.privateKey,
		cert: `${leaf.certificate}${ca.certificate}`,
		caCertificate: ca.certificate,
		caFingerprint: createHash("sha256").update(ca.x509.raw).digest("hex"),
		addresses: validatedAddresses
	});
}
function validateAddresses(addresses) {
	if (!Array.isArray(addresses) || addresses.length === 0) throw certificateError("no-address", "LAN HTTPS needs at least one IPv4 address.");
	if (addresses.length > MAX_ADDRESSES) throw certificateError("invalid-address", `LAN HTTPS accepts at most ${String(MAX_ADDRESSES)} addresses.`);
	const copy = Array.from(addresses);
	for (const address of copy) if (!isCanonicalIpv4(address)) throw certificateError("invalid-address", `LAN HTTPS address is not canonical IPv4: ${String(address)}`);
	return Object.freeze(copy);
}
function isCanonicalIpv4(value) {
	if (typeof value !== "string") return false;
	const parts = value.split(".");
	return parts.length === 4 && parts.every((part) => {
		if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) return false;
		const octet = Number(part);
		return octet >= 0 && octet <= 255;
	});
}
async function requireAvailableProtector(protector) {
	if (protector === void 0 || typeof protector.seal !== "function" || typeof protector.open !== "function") throw certificateError("certificate-unavailable", "LAN HTTPS private-key protection is unavailable.");
	try {
		if ((typeof protector.available === "function" ? await protector.available() : protector.available) !== true) throw certificateError("certificate-unavailable", "LAN HTTPS private-key protection is unavailable.");
	} catch (cause) {
		if (cause instanceof DesktopLanHttpsCertificateError) throw cause;
		throw certificateError("certificate-unavailable", "LAN HTTPS private-key protection check failed.", cause);
	}
	return protector;
}
async function prepareStateDirectory$1(userDataDir, stateDirectory) {
	try {
		const userDataInfo = await lstat(userDataDir);
		if (!userDataInfo.isDirectory() || userDataInfo.isSymbolicLink()) throw certificateError("certificate-state", "LAN HTTPS userData must be an ordinary directory.");
		try {
			await mkdir(stateDirectory, { mode: PRIVATE_DIRECTORY_MODE$1 });
			await chmod(stateDirectory, PRIVATE_DIRECTORY_MODE$1);
		} catch (cause) {
			if (cause.code !== "EEXIST") throw cause;
		}
		const stateInfo = await lstat(stateDirectory);
		if (!stateInfo.isDirectory() || stateInfo.isSymbolicLink()) throw certificateError("certificate-state", "LAN HTTPS state directory must be an ordinary directory.");
		if (CHECK_POSIX_MODE && (stateInfo.mode & 511) !== PRIVATE_DIRECTORY_MODE$1) throw certificateError("certificate-state", "LAN HTTPS state directory permissions must be 700.");
	} catch (cause) {
		if (cause instanceof DesktopLanHttpsCertificateError) throw cause;
		throw certificateError("certificate-state", "LAN HTTPS state directory is unavailable.", cause);
	}
}
async function readPrivateStateFile(statePath) {
	let pathInfo;
	try {
		pathInfo = await lstat(statePath);
	} catch (cause) {
		if (cause.code === "ENOENT") return void 0;
		throw certificateError("certificate-state", "LAN HTTPS CA state could not be inspected.", cause);
	}
	if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) throw certificateError("certificate-state", "LAN HTTPS CA state must be an ordinary file.");
	assertPrivateFile(pathInfo.mode, pathInfo.size);
	let handle;
	try {
		handle = await open(statePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
	} catch (cause) {
		throw certificateError("certificate-state", "LAN HTTPS CA state could not be opened safely.", cause);
	}
	try {
		const openedInfo = await handle.stat();
		if (!openedInfo.isFile() || openedInfo.dev !== pathInfo.dev || openedInfo.ino !== pathInfo.ino) throw certificateError("certificate-state", "LAN HTTPS CA state changed while it was being opened.");
		assertPrivateFile(openedInfo.mode, openedInfo.size);
		const bytes = Buffer.alloc(131073);
		let offset = 0;
		while (offset < bytes.byteLength) {
			const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, null);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		if (offset > MAX_STATE_BYTES) throw certificateError("certificate-state", `LAN HTTPS CA state exceeds ${String(MAX_STATE_BYTES)} bytes.`);
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, offset));
		} catch (cause) {
			throw certificateError("certificate-state", "LAN HTTPS CA state must contain valid UTF-8.", cause);
		}
	} finally {
		await handle.close();
	}
}
function assertPrivateFile(mode, size) {
	if (size > MAX_STATE_BYTES) throw certificateError("certificate-state", `LAN HTTPS CA state exceeds ${String(MAX_STATE_BYTES)} bytes.`);
	if (CHECK_POSIX_MODE && (mode & 511) !== PRIVATE_FILE_MODE$3) throw certificateError("certificate-state", "LAN HTTPS CA state permissions must be 600.");
}
function parsePersistedState(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch (cause) {
		throw certificateError("certificate-state", "LAN HTTPS CA state must contain valid JSON.", cause);
	}
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw certificateError("certificate-state", "LAN HTTPS CA state root must be an object.");
	const object = value;
	const keys = Object.keys(object).sort();
	if (keys.length !== 3 || keys[0] !== "certificate" || keys[1] !== "sealedPrivateKey" || keys[2] !== "version") throw certificateError("certificate-state", "LAN HTTPS CA state contains unexpected fields.");
	if (object.version !== STATE_VERSION) throw certificateError("certificate-state", "LAN HTTPS CA state has an unsupported version.");
	if (typeof object.certificate !== "string") throw certificateError("certificate-state", "LAN HTTPS CA certificate must be PEM text.");
	if (typeof object.sealedPrivateKey !== "string" || !isCanonicalBase64(object.sealedPrivateKey)) throw certificateError("certificate-state", "LAN HTTPS sealed CA private key must be canonical base64.");
	return Object.freeze({
		version: STATE_VERSION,
		certificate: object.certificate,
		sealedPrivateKey: object.sealedPrivateKey
	});
}
function isCanonicalBase64(value) {
	if (value.length === 0 || value.length > MAX_STATE_BYTES || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return false;
	return Buffer.from(value, "base64").toString("base64") === value;
}
async function openPersistedCa(state, protector) {
	const sealed = Buffer.from(state.sealedPrivateKey, "base64");
	let opened;
	try {
		const output = await protector.open(sealed);
		if (!(output instanceof Uint8Array) || output.byteLength === 0 || output.byteLength > MAX_STATE_BYTES) throw new TypeError("protector returned invalid plaintext");
		opened = Buffer.from(output);
	} catch (cause) {
		throw certificateError("certificate-unavailable", "LAN HTTPS CA private key could not be opened.", cause);
	} finally {
		sealed.fill(0);
	}
	try {
		let privateKey;
		try {
			privateKey = new TextDecoder("utf-8", { fatal: true }).decode(opened);
		} catch (cause) {
			throw certificateError("certificate-state", "LAN HTTPS CA private key plaintext is not valid UTF-8.", cause);
		}
		return validateCa(state.certificate, privateKey, true);
	} finally {
		opened.fill(0);
	}
}
async function generateCa() {
	const notBeforeDate = /* @__PURE__ */ new Date(Date.now() - 1440 * 60 * 1e3);
	const notAfterDate = new Date(notBeforeDate.getTime() + CA_VALIDITY_DAYS * 24 * 60 * 60 * 1e3);
	try {
		const generated = await generate([{
			name: "commonName",
			value: CA_COMMON_NAME
		}], {
			algorithm: "sha256",
			keyType: "rsa",
			keySize: RSA_KEY_SIZE,
			notBeforeDate,
			notAfterDate,
			extensions: [{
				name: "basicConstraints",
				cA: true,
				pathLenConstraint: 0,
				critical: true
			}, {
				name: "keyUsage",
				keyCertSign: true,
				cRLSign: true,
				critical: true
			}]
		});
		return validateCa(generated.cert, generated.private);
	} catch (cause) {
		if (cause instanceof DesktopLanHttpsCertificateError) throw cause;
		throw certificateError("certificate-unavailable", "LAN HTTPS local CA could not be generated.", cause);
	}
}
function validateCa(certificate, privateKey, requireCanonical = false) {
	try {
		const x509 = new X509Certificate(certificate);
		const canonicalCertificate = x509.toString();
		const keyObject = createPrivateKey(privateKey);
		const canonicalPrivateKey = exportPrivateKey(keyObject);
		if (requireCanonical && (certificate !== canonicalCertificate || privateKey !== canonicalPrivateKey)) throw new TypeError("CA material is not canonical PEM");
		if (!x509.ca || x509.subject !== `CN=${CA_COMMON_NAME}` || x509.issuer !== x509.subject || keyObject.asymmetricKeyType !== "rsa" || !x509.checkPrivateKey(keyObject) || !x509.verify(x509.publicKey) || !usesSha256WithRsa(x509)) throw new TypeError("CA certificate invariants are not satisfied");
		const now = Date.now();
		if (x509.validFromDate.getTime() > now || x509.validToDate.getTime() <= now) throw new TypeError("CA certificate is outside its validity period");
		return Object.freeze({
			certificate: canonicalCertificate,
			privateKey: canonicalPrivateKey,
			x509
		});
	} catch (cause) {
		throw certificateError("certificate-state", "LAN HTTPS CA state does not contain a valid matching CA keypair.", cause);
	}
}
function exportPrivateKey(key) {
	const exported = key.export({
		type: "pkcs8",
		format: "pem"
	});
	return typeof exported === "string" ? exported : exported.toString("utf8");
}
async function persistCa(statePath, ca, protector) {
	const plaintext = Buffer.from(ca.privateKey, "utf8");
	let sealed;
	try {
		const output = await protector.seal(plaintext);
		if (!(output instanceof Uint8Array) || output.byteLength === 0 || output.byteLength > MAX_STATE_BYTES) throw new TypeError("protector returned invalid sealed bytes");
		sealed = Buffer.from(output);
		if (sealed.equals(plaintext) || sealed.includes(Buffer.from("PRIVATE KEY", "utf8"))) throw new TypeError("protector did not conceal the private key");
	} catch (cause) {
		throw certificateError("certificate-unavailable", "LAN HTTPS CA private key could not be sealed.", cause);
	} finally {
		plaintext.fill(0);
	}
	try {
		const state = Object.freeze({
			version: STATE_VERSION,
			certificate: ca.certificate,
			sealedPrivateKey: sealed.toString("base64")
		});
		await writeFileAtomic(statePath, `${JSON.stringify(state, void 0, 2)}\n`, {
			mode: PRIVATE_FILE_MODE$3,
			dirMode: PRIVATE_DIRECTORY_MODE$1
		});
		if (CHECK_POSIX_MODE) await chmod(statePath, PRIVATE_FILE_MODE$3);
	} catch (cause) {
		throw certificateError("certificate-state", "LAN HTTPS CA state could not be persisted safely.", cause);
	} finally {
		sealed.fill(0);
	}
}
async function generateLeaf(ca, addresses) {
	const primaryAddress = addresses[0];
	if (primaryAddress === void 0) throw certificateError("no-address", "LAN HTTPS needs at least one IPv4 address.");
	const notBeforeDate = /* @__PURE__ */ new Date(Date.now() - 300 * 1e3);
	const notAfterDate = new Date(notBeforeDate.getTime() + LEAF_VALIDITY_DAYS * 24 * 60 * 60 * 1e3);
	try {
		const generated = await generate([{
			name: "commonName",
			value: primaryAddress
		}], {
			algorithm: "sha256",
			keyType: "rsa",
			keySize: RSA_KEY_SIZE,
			notBeforeDate,
			notAfterDate,
			ca: {
				key: ca.privateKey,
				cert: ca.certificate
			},
			extensions: [
				{
					name: "basicConstraints",
					cA: false,
					critical: true
				},
				{
					name: "keyUsage",
					digitalSignature: true,
					keyEncipherment: true,
					critical: true
				},
				{
					name: "extKeyUsage",
					serverAuth: true,
					critical: true
				},
				{
					name: "subjectAltName",
					critical: true,
					altNames: addresses.map((address) => ({
						type: 7,
						ip: address
					}))
				}
			]
		});
		const x509 = new X509Certificate(generated.cert);
		const keyObject = createPrivateKey(generated.private);
		const privateKey = exportPrivateKey(keyObject);
		const certificate = x509.toString();
		if (x509.ca || keyObject.asymmetricKeyType !== "rsa" || !x509.checkPrivateKey(keyObject) || !x509.verify(ca.x509.publicKey) || !usesSha256WithRsa(x509) || !x509.keyUsage?.includes(SERVER_AUTH_OID) || addresses.some((address) => x509.checkIP(address) !== address)) throw new TypeError("issued leaf certificate invariants are not satisfied");
		return Object.freeze({
			privateKey,
			certificate
		});
	} catch (cause) {
		throw certificateError("certificate-unavailable", "LAN HTTPS server certificate could not be generated.", cause);
	}
}
function usesSha256WithRsa(certificate) {
	return certificate.raw.indexOf(SHA256_WITH_RSA_OID) >= 0;
}
Object.freeze({
	stateDirectoryName: STATE_DIRECTORY_NAME,
	stateFilename: STATE_FILENAME,
	stateVersion: STATE_VERSION,
	directoryMode: PRIVATE_DIRECTORY_MODE$1,
	fileMode: PRIVATE_FILE_MODE$3,
	maxStateBytes: MAX_STATE_BYTES,
	maxAddresses: MAX_ADDRESSES,
	caValidityDays: CA_VALIDITY_DAYS,
	leafValidityDays: LEAF_VALIDITY_DAYS,
	rsaKeySize: RSA_KEY_SIZE
});
//#endregion
//#region src/desktop-terminal.ts
const RUN_AS_NODE = "ELECTRON_RUN_AS_NODE";
const DEFAULT_PROFILE = "DSH_DESKTOP_DEFAULT_PROFILE";
const DSH_HOME = "DSH_HOME";
const PATH = "PATH";
const WINDOWS_APP_EXECUTABLE = "DSH_DESKTOP_APP_EXECUTABLE";
const WINDOWS_DSH_BOOTSTRAP = "DSH_DESKTOP_DSH_BOOTSTRAP";
const WINDOWS_ELECTRON_VERSION = "DSH_DESKTOP_ELECTRON_VERSION";
const WINDOWS_PNPM_ENTRY = "DSH_DESKTOP_PNPM_ENTRY";
const WINDOWS_PROFILE_DIRECTORY = "DSH_DESKTOP_PROFILE_DIRECTORY";
const WINDOWS_TERMINAL_MODE = "DSH_DESKTOP_TERMINAL_MODE";
const WINDOWS_PRODUCT_VERSION = "DSH_DESKTOP_PRODUCT_VERSION";
const WINDOWS_SHIM_DIRECTORY = "DSH_DESKTOP_SHIM_DIRECTORY";
const WINDOWS_POWERSHELL_WELCOME = "DSH_DESKTOP_POWERSHELL_WELCOME";
const WINDOWS_CMD_WELCOME = "DSH_DESKTOP_CMD_WELCOME";
const WINDOWS_SHELL_EXECUTABLE = "DSH_DESKTOP_SHELL_EXECUTABLE";
const WINDOWS_GENERATED_ENVIRONMENT_KEYS = /* @__PURE__ */ new Set([
	DEFAULT_PROFILE,
	WINDOWS_APP_EXECUTABLE,
	WINDOWS_DSH_BOOTSTRAP,
	WINDOWS_ELECTRON_VERSION,
	WINDOWS_PNPM_ENTRY,
	WINDOWS_PROFILE_DIRECTORY,
	WINDOWS_PRODUCT_VERSION,
	WINDOWS_TERMINAL_MODE,
	WINDOWS_SHIM_DIRECTORY,
	WINDOWS_POWERSHELL_WELCOME,
	WINDOWS_CMD_WELCOME,
	WINDOWS_SHELL_EXECUTABLE
]);
const STATE_DIRECTORY_MODE = 448;
const EXECUTABLE_FILE_MODE = 448;
const PRIVATE_FILE_MODE$2 = 384;
const WINDOWS_SHELL_COMMANDS = [
	"pwsh.exe",
	"powershell.exe",
	"cmd.exe"
];
/**
* Keep generated command shims stable for one selected profile.
* @param userDataDir - Electron-owned persistent data directory.
* @param profileName - profile embedded in the generated DSH shim.
* @returns private per-profile terminal state directory.
*/
function desktopTerminalStateDirectory(userDataDir, profileName$1) {
	assertScriptValue("user data directory", userDataDir);
	profileName(profileName$1);
	return join(userDataDir, "cli", createHash("sha256").update(profileName$1, "utf8").digest("hex"));
}
/** Reject values that cannot be represented safely in generated command files. */
function assertScriptValue(label, value) {
	if (value.length === 0) throw new Error(`dsh-desktop-next: terminal ${label} must not be empty`);
	if (/[\0\r\n]/.test(value)) throw new Error(`dsh-desktop-next: terminal ${label} must not contain NUL or newlines`);
}
/** Quote one arbitrary value as a POSIX shell word. */
function quoteSh(value) {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}
/** Escape printable text following an `echo(` batch builtin. */
function escapeBatchText(value) {
	if (/\r|\n/.test(value)) throw new Error("dsh-desktop-next: terminal Windows welcome text must not contain newlines");
	return value.replaceAll("^", "^^").replaceAll("%", "%%").replaceAll("&", "^&").replaceAll("|", "^|").replaceAll("<", "^<").replaceAll(">", "^>").replaceAll("(", "^(").replaceAll(")", "^)");
}
/** Remove a temporary file while preserving every error except absence. */
function unlinkTemporaryFile(filename) {
	try {
		unlinkSync(filename);
	} catch (cause) {
		if (cause.code !== "ENOENT") throw cause;
	}
}
/** Replace one generated file without following a pre-existing target symlink. */
function replacePrivateFile(filename, contents, mode) {
	const temporary = join(dirname(filename), `.${basename(filename)}.${process.pid}.${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, contents, {
			encoding: "utf8",
			flag: "wx",
			mode
		});
		chmodSync(temporary, mode);
		renameSync(temporary, filename);
	} finally {
		unlinkTemporaryFile(temporary);
	}
}
/** Create and verify the private directory holding terminal launch files. */
function prepareStateDirectory(stateDir) {
	mkdirSync(stateDir, {
		recursive: true,
		mode: STATE_DIRECTORY_MODE
	});
	const stat = lstatSync(stateDir);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`dsh-desktop-next: terminal state path is not a private directory: ${stateDir}`);
	chmodSync(stateDir, STATE_DIRECTORY_MODE);
}
/** Build a command shim that enables Electron's Node mode only for its child. */
function macShim(appExecutable, binPath) {
	const entry = binPath === void 0 ? "" : ` ${quoteSh(binPath)}`;
	return [
		"#!/bin/sh",
		`${RUN_AS_NODE}=1 exec ${quoteSh(appExecutable)}${entry} "$@"`,
		""
	].join("\n");
}
/** Build a command shim that enables Electron's Node mode only for its child. */
function windowsShim() {
	return [
		"@echo off",
		"setlocal DisableDelayedExpansion",
		`set "${RUN_AS_NODE}=1"`,
		`"%${WINDOWS_APP_EXECUTABLE}%" %*`,
		"exit /b %errorlevel%",
		""
	].join("\r\n");
}
/** Build the DSH shim with Loader internals and one process-local default profile. */
function macDshShim(options) {
	return [
		"#!/bin/sh",
		[
			`${DEFAULT_PROFILE}=${quoteSh(options.profileName)}`,
			`${RUN_AS_NODE}=1`,
			`exec ${quoteSh(options.appExecutable)} --expose-internals ${quoteSh(options.dshBootstrapPath)} "$@"`
		].join(" "),
		""
	].join("\n");
}
/** Build the Windows DSH shim with Loader internals and one local default profile. */
function windowsDshShim() {
	return [
		"@echo off",
		"setlocal DisableDelayedExpansion",
		`set "${RUN_AS_NODE}=1"`,
		`"%${WINDOWS_APP_EXECUTABLE}%" --expose-internals "%${WINDOWS_DSH_BOOTSTRAP}%" %*`,
		"exit /b %errorlevel%",
		""
	].join("\r\n");
}
/** Build a pnpm shim with Electron native-module settings scoped to its process tree. */
function macPnpmShim(options) {
	return [
		"#!/bin/sh",
		[
			`${RUN_AS_NODE}=1`,
			"npm_config_runtime=electron",
			`npm_config_target=${quoteSh(options.electronVersion)}`,
			`npm_config_disturl=${quoteSh(ELECTRON_HEADERS_URL)}`,
			`exec ${quoteSh(options.appExecutable)} ${quoteSh(options.pnpmBinPath)} ${PNPM_DISABLE_UPDATE_NOTIFIER} ${PNPM_IGNORE_MINIMUM_RELEASE_AGE} "$@"`
		].join(" "),
		""
	].join("\n");
}
/** Build a pnpm batch shim with Electron settings local to its `setlocal` child tree. */
function windowsPnpmShim() {
	return [
		"@echo off",
		"setlocal DisableDelayedExpansion",
		`set "${RUN_AS_NODE}=1"`,
		"set \"npm_config_runtime=electron\"",
		`set "npm_config_target=%${WINDOWS_ELECTRON_VERSION}%"`,
		`set "npm_config_disturl=${ELECTRON_HEADERS_URL}"`,
		`"%${WINDOWS_APP_EXECUTABLE}%" "%${WINDOWS_PNPM_ENTRY}%" ${PNPM_DISABLE_UPDATE_NOTIFIER} ${PNPM_IGNORE_MINIMUM_RELEASE_AGE} %*`,
		"exit /b %errorlevel%",
		""
	].join("\r\n");
}
/** Build a zsh startup file that preserves the user's rc and then restores desktop variables. */
function macZshRc(options, shimDir) {
	return [
		"if [[ -n \"${DSH_DESKTOP_USER_ZDOTDIR:-}\" && -r \"${DSH_DESKTOP_USER_ZDOTDIR}/.zshrc\" ]]; then",
		"  ZDOTDIR=\"${DSH_DESKTOP_USER_ZDOTDIR}\"",
		"  source \"${DSH_DESKTOP_USER_ZDOTDIR}/.zshrc\"",
		"fi",
		`unset ${RUN_AS_NODE}`,
		`export ${DSH_HOME}=${quoteSh(options.homeDir)}`,
		"typeset -U path",
		`path=(${quoteSh(shimDir)} $path)`,
		"export PATH",
		`unset DSH_DESKTOP_USER_ZDOTDIR`,
		""
	].join("\n");
}
/** Build a bash startup file that preserves the user's rc and then restores desktop variables. */
function macBashRc(options, shimDir) {
	return [
		"if [ -n \"${DSH_DESKTOP_USER_BASHRC:-}\" ] && [ -r \"${DSH_DESKTOP_USER_BASHRC}\" ]; then",
		"  . \"${DSH_DESKTOP_USER_BASHRC}\"",
		"fi",
		`unset ${RUN_AS_NODE}`,
		`export ${DSH_HOME}=${quoteSh(options.homeDir)}`,
		"case \":${PATH:-}:\" in",
		`  *:${quoteSh(shimDir)}:*) ;;`,
		`  *) export PATH=${quoteSh(shimDir)}:"\${PATH:-}" ;;`,
		"esac",
		"unset DSH_DESKTOP_USER_BASHRC",
		""
	].join("\n");
}
function terminalModeLabel(mode) {
	if (mode === "safe") return "安全模式临时环境 / Safe mode: temporary environment";
	if (mode === "recovery") return "恢复修复终端：原 Profile / Recovery terminal: original Profile";
	return "正常环境 / Normal environment";
}
/** Build the macOS script opened by LaunchServices in the user's terminal. */
function macWelcome(options, shimDir, bashRcPath) {
	return [
		"#!/bin/sh",
		`unset ${RUN_AS_NODE}`,
		`export ${DSH_HOME}=${quoteSh(options.homeDir)}`,
		`export PATH=${quoteSh(shimDir)}:"\${PATH:-}"`,
		`cd ${quoteSh(options.profileDir)}`,
		"printf '\\033[2J\\033[3J\\033[H'",
		`printf '%s\\n' ${quoteSh(`DSH Desktop ${options.productVersion} terminal`)}`,
		`printf '%s\\n' ${quoteSh(terminalModeLabel(options.mode))}`,
		`printf '%s\\n' ${quoteSh(`Profile: ${options.profileName}`)}`,
		`printf '%s\\n' ${quoteSh(`Profile directory: ${options.profileDir}`)}`,
		`printf '%s\\n' ${quoteSh(`Harness home: ${options.homeDir}`)}`,
		`printf '%s\\n' ${quoteSh(`Plugin commands without --profile modify the ${options.profileName} profile.`)}`,
		`printf '%s\\n' ${quoteSh("Commands:")}`,
		`printf '  %s\\n' ${quoteSh("dsh --dump-config")}`,
		`printf '  %s\\n' ${quoteSh("dsh plugin add <third-party-plugin>")}`,
		`printf '  %s\\n' ${quoteSh("dsh plugin remove <third-party-plugin>")}`,
		`printf '  %s\\n' ${quoteSh("dsh plugin update")}`,
		`printf '%s\\n' ${quoteSh("Restart DSH Desktop after plugin changes.")}`,
		"case \"${SHELL:-/bin/zsh}\" in",
		"  */bash)",
		"    export DSH_DESKTOP_USER_BASHRC=\"${HOME:-}/.bashrc\"",
		`    exec "\${SHELL}" --noprofile --rcfile ${quoteSh(bashRcPath)} -i`,
		"    ;;",
		"  */zsh)",
		"    export DSH_DESKTOP_USER_ZDOTDIR=\"${ZDOTDIR:-${HOME:-}}\"",
		`    export ZDOTDIR=${quoteSh(options.stateDir)}`,
		"    exec \"${SHELL}\" -i",
		"    ;;",
		"  *)",
		"    export DSH_DESKTOP_USER_ZDOTDIR=\"${ZDOTDIR:-${HOME:-}}\"",
		`    export ZDOTDIR=${quoteSh(options.stateDir)}`,
		"    exec /bin/zsh -i",
		"    ;;",
		"esac",
		""
	].join("\n");
}
/** Build the PowerShell script that remains active in the new console. */
function windowsWelcome() {
	return [
		`Remove-Item Env:${RUN_AS_NODE} -ErrorAction SilentlyContinue`,
		`$dshDesktopShimDir = $env:${WINDOWS_SHIM_DIRECTORY}`,
		`$dshDesktopPath = @($env:${PATH} -split ';' | Where-Object { -not [string]::Equals($_, $dshDesktopShimDir, [StringComparison]::OrdinalIgnoreCase) })`,
		`$env:${PATH} = (@($dshDesktopShimDir) + $dshDesktopPath) -join ';'`,
		`Set-Location -LiteralPath $env:${WINDOWS_PROFILE_DIRECTORY}`,
		`Write-Host ("DSH Desktop {0} terminal" -f $env:${WINDOWS_PRODUCT_VERSION})`,
		`Write-Host $env:${WINDOWS_TERMINAL_MODE}`,
		`Write-Host ("Profile: {0}" -f $env:${DEFAULT_PROFILE})`,
		`Write-Host ("Profile directory: {0}" -f $env:${WINDOWS_PROFILE_DIRECTORY})`,
		`Write-Host ("Harness home: {0}" -f $env:${DSH_HOME})`,
		`Write-Host ("Plugin commands without --profile modify the {0} profile." -f $env:${DEFAULT_PROFILE})`,
		`Write-Host 'Commands:'`,
		`Write-Host '  dsh --dump-config'`,
		`Write-Host '  dsh plugin add <third-party-plugin>'`,
		`Write-Host '  dsh plugin remove <third-party-plugin>'`,
		`Write-Host '  dsh plugin update'`,
		`Write-Host 'Restart DSH Desktop after plugin changes.'`,
		""
	].join("\r\n");
}
/** Build the fallback batch welcome script used when PowerShell is unavailable. */
function windowsCmdWelcome() {
	return [
		"@echo off",
		"setlocal EnableDelayedExpansion",
		`set "${RUN_AS_NODE}="`,
		`cd /d "!${WINDOWS_PROFILE_DIRECTORY}!"`,
		`echo(DSH Desktop !${WINDOWS_PRODUCT_VERSION}! terminal`,
		`echo(!${WINDOWS_TERMINAL_MODE}!`,
		`echo(Profile: !${DEFAULT_PROFILE}!`,
		`echo(Profile directory: !${WINDOWS_PROFILE_DIRECTORY}!`,
		`echo(Harness home: !${DSH_HOME}!`,
		`echo(Plugin commands without --profile modify the !${DEFAULT_PROFILE}! profile.`,
		"echo(Commands:",
		`echo(  ${escapeBatchText("dsh --dump-config")}`,
		`echo(  ${escapeBatchText("dsh plugin add <third-party-plugin>")}`,
		`echo(  ${escapeBatchText("dsh plugin remove <third-party-plugin>")}`,
		`echo(  ${escapeBatchText("dsh plugin update")}`,
		`echo(${escapeBatchText("Restart DSH Desktop after plugin changes.")}`,
		"endlocal & set \"ELECTRON_RUN_AS_NODE=\"",
		""
	].join("\r\n");
}
/** Create command shims and the interactive welcome script. */
function prepareDesktopTerminalFiles(options) {
	if (options.platform !== "darwin" && options.platform !== "win32") throw new Error(`dsh-desktop-next: terminal is unsupported on ${options.platform}`);
	profileName(options.profileName);
	for (const [label, value] of [
		["application executable", options.appExecutable],
		["dsh bootstrap", options.dshBootstrapPath],
		["pnpm entry", options.pnpmBinPath],
		["Electron version", options.electronVersion],
		["profile directory", options.profileDir],
		["Harness home", options.homeDir],
		["state directory", options.stateDir],
		["product version", options.productVersion]
	]) assertScriptValue(label, value);
	prepareStateDirectory(options.stateDir);
	const shimDir = join(options.stateDir, "bin");
	prepareStateDirectory(shimDir);
	if (options.platform === "darwin") {
		const files = {
			shimDir,
			dshShimPath: join(shimDir, "dsh"),
			pnpmShimPath: join(shimDir, "pnpm"),
			nodeShimPath: join(shimDir, "node"),
			welcomePath: join(options.stateDir, "welcome.command")
		};
		const bashRcPath = join(options.stateDir, "bashrc");
		replacePrivateFile(files.dshShimPath, macDshShim(options), EXECUTABLE_FILE_MODE);
		replacePrivateFile(files.pnpmShimPath, macPnpmShim(options), EXECUTABLE_FILE_MODE);
		replacePrivateFile(files.nodeShimPath, macShim(options.appExecutable), EXECUTABLE_FILE_MODE);
		replacePrivateFile(join(options.stateDir, ".zshrc"), macZshRc(options, shimDir), PRIVATE_FILE_MODE$2);
		replacePrivateFile(bashRcPath, macBashRc(options, shimDir), PRIVATE_FILE_MODE$2);
		replacePrivateFile(files.welcomePath, macWelcome(options, shimDir, bashRcPath), EXECUTABLE_FILE_MODE);
		return files;
	}
	if (options.platform === "win32") {
		const windowsCmdWelcomePath = join(options.stateDir, "welcome.cmd");
		const files = {
			shimDir,
			dshShimPath: join(shimDir, "dsh.cmd"),
			pnpmShimPath: join(shimDir, "pnpm.cmd"),
			nodeShimPath: join(shimDir, "node.cmd"),
			welcomePath: join(options.stateDir, "welcome.ps1"),
			windowsCmdWelcomePath
		};
		replacePrivateFile(files.dshShimPath, windowsDshShim(), PRIVATE_FILE_MODE$2);
		replacePrivateFile(files.pnpmShimPath, windowsPnpmShim(), PRIVATE_FILE_MODE$2);
		replacePrivateFile(files.nodeShimPath, windowsShim(), PRIVATE_FILE_MODE$2);
		replacePrivateFile(files.welcomePath, windowsWelcome(), PRIVATE_FILE_MODE$2);
		replacePrivateFile(windowsCmdWelcomePath, windowsCmdWelcome(), PRIVATE_FILE_MODE$2);
		return files;
	}
	throw new Error(`dsh-desktop-next: terminal is unsupported on ${options.platform}`);
}
/** Copy the Host environment and scope desktop command discovery to one terminal child. */
function terminalEnvironment(options, files) {
	const source = options.environment ?? process.env;
	const env = {};
	let inheritedPath;
	for (const [key, value] of Object.entries(source)) {
		const normalized = key.toUpperCase();
		if (normalized === RUN_AS_NODE || normalized === DSH_HOME) continue;
		if (options.platform === "win32" && WINDOWS_GENERATED_ENVIRONMENT_KEYS.has(normalized)) continue;
		if (normalized === PATH) {
			inheritedPath ??= value;
			continue;
		}
		env[key] = value;
	}
	const delimiter = options.platform === "win32" ? ";" : ":";
	env[PATH] = inheritedPath === void 0 || inheritedPath.length === 0 ? files.shimDir : `${files.shimDir}${delimiter}${inheritedPath}`;
	env[DSH_HOME] = options.homeDir;
	if (options.platform === "win32") {
		env[DEFAULT_PROFILE] = options.profileName;
		env[WINDOWS_APP_EXECUTABLE] = options.appExecutable;
		env[WINDOWS_DSH_BOOTSTRAP] = options.dshBootstrapPath;
		env[WINDOWS_ELECTRON_VERSION] = options.electronVersion;
		env[WINDOWS_PNPM_ENTRY] = options.pnpmBinPath;
		env[WINDOWS_PROFILE_DIRECTORY] = options.profileDir;
		env[WINDOWS_PRODUCT_VERSION] = options.productVersion;
		env[WINDOWS_TERMINAL_MODE] = terminalModeLabel(options.mode);
		env[WINDOWS_SHIM_DIRECTORY] = files.shimDir;
		env[WINDOWS_POWERSHELL_WELCOME] = files.welcomePath;
		if (files.windowsCmdWelcomePath !== void 0) env[WINDOWS_CMD_WELCOME] = files.windowsCmdWelcomePath;
	}
	return env;
}
/** Read one Windows environment value without trusting its key casing. */
function windowsEnvironmentValue(environment, name) {
	const normalized = name.toUpperCase();
	for (const [key, value] of Object.entries(environment)) if (key.toUpperCase() === normalized) return value;
}
/** Resolve known Windows shells from explicit system paths and then the inherited PATH. */
function defaultWindowsExecutableResolver(command, environment, exists) {
	const candidates = [];
	const systemRoot = windowsEnvironmentValue(environment, "SystemRoot");
	if (command.toLowerCase() === "powershell.exe" && systemRoot !== void 0) candidates.push(win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
	if (command.toLowerCase() === "cmd.exe") {
		const comSpec = windowsEnvironmentValue(environment, "ComSpec");
		if (comSpec !== void 0) candidates.push(comSpec);
		if (systemRoot !== void 0) candidates.push(win32.join(systemRoot, "System32", "cmd.exe"));
	}
	const inheritedPath = windowsEnvironmentValue(environment, PATH);
	if (inheritedPath !== void 0) for (const rawDir of inheritedPath.split(";")) {
		const dir = rawDir.startsWith("\"") && rawDir.endsWith("\"") ? rawDir.slice(1, -1) : rawDir;
		if (dir.length > 0) candidates.push(win32.join(dir, command));
	}
	return candidates.find((candidate) => exists(candidate));
}
/** Resolve the preferred Windows Terminal host, preserving an explicit adapter. */
function resolveWindowsTerminal(options, _environment) {
	return options.windowsTerminal;
}
/** Select PowerShell 7, Windows PowerShell, or the built-in command prompt. */
function resolveWindowsShell(options, environment) {
	const exists = options.windowsExecutableExists ?? existsSync;
	const resolveExecutable = options.windowsExecutableResolver ?? defaultWindowsExecutableResolver;
	for (const command of WINDOWS_SHELL_COMMANDS) {
		const executable = resolveExecutable(command, environment, exists);
		if (executable === void 0) continue;
		assertScriptValue(`${command} executable`, executable);
		return {
			kind: command === "cmd.exe" ? "cmd" : "powershell",
			executable
		};
	}
	throw new Error("dsh-desktop-next: terminal requires pwsh.exe, powershell.exe, or cmd.exe on Windows");
}
/** Convert one selected Windows shell into an argv-only launch. */
function windowsShellArgv(shell, files) {
	if (shell.kind === "cmd") {
		const welcome = files.windowsCmdWelcomePath;
		if (welcome === void 0) throw new Error("dsh-desktop-next: terminal did not generate the Windows command prompt welcome script");
		return [
			"/D",
			"/K",
			"call",
			welcome
		];
	}
	return [
		"-NoLogo",
		"-NoExit",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		files.welcomePath
	];
}
/** Resolve the trusted command processor used only to invoke the `start` broker. */
function resolveWindowsCommandProcessor(options, environment, shell) {
	if (shell.kind === "cmd") return shell.executable;
	const exists = options.windowsExecutableExists ?? existsSync;
	const executable = (options.windowsExecutableResolver ?? defaultWindowsExecutableResolver)("cmd.exe", environment, exists);
	if (executable === void 0) throw new Error("dsh-desktop-next: terminal requires cmd.exe to create a visible Windows console");
	assertScriptValue("cmd.exe executable", executable);
	return executable;
}
/** Build the trusted batch broker whose `start` command owns the visible console. */
function windowsLaunchBroker(shell) {
	const target = shell.kind === "cmd" ? `"!${WINDOWS_SHELL_EXECUTABLE}!" /D /K call "!${WINDOWS_CMD_WELCOME}!"` : `"!${WINDOWS_SHELL_EXECUTABLE}!" -NoLogo -NoExit -ExecutionPolicy Bypass -File "!${WINDOWS_POWERSHELL_WELCOME}!"`;
	return [
		"@echo off",
		"setlocal EnableDelayedExpansion",
		`start "DSH NEXT" /D "!${WINDOWS_PROFILE_DIRECTORY}!" ${target}`,
		"exit /b %errorlevel%",
		""
	].join("\r\n");
}
/** Report a launcher error without leaving an unhandled EventEmitter error. */
function reportLaunchError(options, cause) {
	if (options.onLaunchError !== void 0) try {
		options.onLaunchError(cause);
		return;
	} catch (reportCause) {
		const detail = reportCause instanceof Error ? reportCause.message : String(reportCause);
		process.stderr.write(`dsh-desktop-next: terminal error reporter failed: ${detail}\n`);
		return;
	}
	process.stderr.write(`dsh-desktop-next: failed to open terminal: ${cause.message}\n`);
}
/**
* Generate a private desktop CLI environment and open it in a native terminal.
* @param options - packaged CLI paths, profile identity, private state, and process adapter.
* @returns generated file paths and the platform launcher process.
*/
function openDesktopTerminal(options) {
	const files = prepareDesktopTerminalFiles(options);
	const env = terminalEnvironment(options, files);
	let command;
	let args;
	let detached = true;
	let windowsHide = false;
	let launcherCwd = options.profileDir;
	let windowsLauncherPath;
	if (options.platform === "darwin") {
		command = "/usr/bin/open";
		args = [
			"-a",
			"Terminal",
			files.welcomePath
		];
	} else {
		const shell = resolveWindowsShell(options, env);
		const shellArgs = windowsShellArgv(shell, files);
		const windowsTerminal = resolveWindowsTerminal(options, env);
		if (windowsTerminal !== void 0) {
			command = windowsTerminal.executable;
			args = [
				...windowsTerminal.arguments ?? [],
				shell.executable,
				...shellArgs
			];
		} else {
			command = resolveWindowsCommandProcessor(options, env, shell);
			env[WINDOWS_SHELL_EXECUTABLE] = shell.executable;
			windowsLauncherPath = join(options.stateDir, "launch.cmd");
			replacePrivateFile(windowsLauncherPath, windowsLaunchBroker(shell), PRIVATE_FILE_MODE$2);
			args = [
				"/D",
				"/S",
				"/C",
				basename(windowsLauncherPath)
			];
			detached = false;
			windowsHide = true;
			launcherCwd = options.stateDir;
		}
	}
	const spawnOptions = {
		cwd: launcherCwd,
		detached,
		env,
		shell: false,
		stdio: "ignore",
		windowsHide
	};
	const child = options.spawn(command, args, spawnOptions);
	let launchFailureReported = false;
	const reportLaunchFailure = (cause) => {
		if (launchFailureReported) return;
		launchFailureReported = true;
		reportLaunchError(options, cause);
	};
	child.once("error", reportLaunchFailure);
	child.once("exit", (code, signal) => {
		if (code === 0) return;
		const outcome = code === null ? `signal ${signal ?? "unknown"}` : `code ${String(code)}`;
		reportLaunchFailure(/* @__PURE__ */ new Error(`terminal launcher exited with ${outcome}`));
	});
	child.unref();
	return {
		shimDir: files.shimDir,
		dshShimPath: files.dshShimPath,
		pnpmShimPath: files.pnpmShimPath,
		nodeShimPath: files.nodeShimPath,
		welcomePath: files.welcomePath,
		...windowsLauncherPath === void 0 ? {} : { windowsLauncherPath },
		child
	};
}
//#endregion
//#region ../dsh-plugin-desktop/src/auxiliary-window-options.ts
/** Whether a renderer-owned frame is needed below visible native controls. */
function auxiliaryWindowHasCustomFrame(platform = process.platform, windowControls = true) {
	return windowControls && (platform === "darwin" || platform === "win32");
}
/** Hide the ordinary OS title row while retaining native window controls. */
function auxiliaryWindowChromeOptions(platform = process.platform, windowControls = true) {
	if (!windowControls) return {
		frame: false,
		closable: false,
		minimizable: false,
		maximizable: false
	};
	if (platform === "darwin") return {
		titleBarStyle: "hiddenInset",
		trafficLightPosition: {
			x: 16,
			y: 12
		}
	};
	if (platform === "win32") return {
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#00000000",
			symbolColor: "#7f858f",
			height: 36
		},
		hasShadow: true,
		roundedCorners: true,
		thickFrame: true
	};
	return {};
}
//#endregion
//#region ../dsh-plugin-desktop/src/context-menu.ts
/**
* Build the official editing template. Editable targets get the full editing
* set, selected read-only text gets Copy alone, and anything else gets no menu.
* Availability comes from Chromium's edit flags. Empty accelerators suppress
* Electron's default shortcut labels for native roles; Windows additionally
* needs explicit labels because its native roles are not localized.
*/
function editingContextMenuTemplate(params, platform, labels) {
	const { isEditable, selectionText, editFlags } = params;
	const items = [];
	if (isEditable) items.push({
		role: "undo",
		enabled: editFlags.canUndo
	}, {
		role: "redo",
		enabled: editFlags.canRedo
	}, { type: "separator" }, {
		role: "cut",
		enabled: editFlags.canCut
	}, {
		role: "copy",
		enabled: editFlags.canCopy
	}, {
		role: "paste",
		enabled: editFlags.canPaste
	}, { type: "separator" }, {
		role: "selectAll",
		enabled: editFlags.canSelectAll
	});
	else if (selectionText.length > 0) items.push({
		role: "copy",
		enabled: editFlags.canCopy
	});
	return items.map((item) => ({
		...item,
		...platform === "win32" && item.role !== void 0 && item.role in labels ? { label: labels[item.role] } : {},
		accelerator: ""
	}));
}
/** Pop the editing menu over `window` on every `context-menu` event; returns the listener remover. */
function installEditingContextMenu(webContents, window, options) {
	const listener = (_event, params) => {
		if (window.isDestroyed()) return;
		const template = editingContextMenuTemplate(params, options.platform, options.labels());
		if (template.length === 0) return;
		options.menu().buildFromTemplate(template).popup({ window });
	};
	webContents.on("context-menu", listener);
	return () => {
		webContents.off("context-menu", listener);
	};
}
//#endregion
//#region src/relaunch.ts
/** Explicit launch modes survive a native relaunch without leaking into later restarts. */
const RECOVERY_ARGUMENT = "--next-recovery";
const SAFE_ARGUMENT = "--next-safe-mode";
const ONBOARDING_ARGUMENT = "--next-onboarding";
/** Marks the instance an elevated Windows launch restarted with the user's normal token; never carried forward. */
const DE_ELEVATED_ARGUMENT = "--next-de-elevated";
function relaunchArguments(argv, recovery, safe, onboarding = false) {
	return [...argv.filter((value) => value !== "--next-recovery" && value !== "--next-safe-mode" && value !== "--next-onboarding" && value !== "--next-de-elevated"), ...recovery ? [RECOVERY_ARGUMENT] : safe ? [SAFE_ARGUMENT] : onboarding ? [ONBOARDING_ARGUMENT] : []];
}
/**
* Pid of the AppImage runtime that extracted this run, when there is one.
*
* With `--appimage-extract-and-run` (or `APPIMAGE_EXTRACT_AND_RUN=1`) the
* runtime unpacks the image into a directory named after its hash, stays
* behind as this process's parent, and deletes that directory once the app
* exits. A FUSE-mounted run replaces the runtime with the app instead.
*/
function appImageExtractingRuntimePid(appImage, parentPid = process.ppid, resolve = realpathSync) {
	try {
		return resolve(`/proc/${parentPid}/exe`) === resolve(appImage) ? parentPid : void 0;
	} catch {
		return;
	}
}
/**
* Bash handoff run as `bash -c SCRIPT '<pid>...' <AppImage> [args...]`.
*
* It closes every inherited descriptor above stderr first (`child_process`
* passes on whatever the main process left without close-on-exec: files in
* the old mount, the old crash handler's socket, listening sockets), then
* waits for every listed pid: the old app, so the new one gets the
* single-instance lock, and an extracting runtime, so it has finished deleting
* the directory the new runtime extracts into again. POSIX `sh` cannot close
* descriptors above 9; `AppRun` needs bash anyway.
*/
const APPIMAGE_RELAUNCH_SCRIPT = [
	"for fd in /proc/$$/fd/*; do fd=${fd##*/}; if [ \"$fd\" -gt 2 ]; then eval \"exec $fd>&-\"; fi; done",
	"for pid in $0; do while kill -0 \"$pid\" 2>/dev/null; do sleep 0.1; done; done",
	"exec \"$@\""
].join("\n");
/** Drop this run's mount from the search paths `AppRun` prefixed, so restarts do not pile them up. */
function appImageRelaunchEnvironment(env) {
	const next = { ...env };
	const appDir = env.APPDIR;
	if (!appDir) return next;
	for (const name of [
		"PATH",
		"LD_LIBRARY_PATH",
		"XDG_DATA_DIRS",
		"GSETTINGS_SCHEMA_DIR"
	]) {
		const value = next[name];
		if (value === void 0) continue;
		const kept = value.split(":").filter((entry) => entry !== appDir && !entry.startsWith(`${appDir}/`));
		if (kept.length === 0) delete next[name];
		else next[name] = kept.join(":");
	}
	return next;
}
/**
* Schedule a new app process with `args` once this one exits.
*
* Outside an AppImage this is `app.relaunch({ args })`. Inside one, Electron's
* relauncher cannot restart the app: its default target lives in this run's
* `/tmp/.mount_*` FUSE mount, which is torn down with this process, and
* targeting `$APPIMAGE` instead fails because Chromium starts the relauncher
* helper with `no_new_privs`, so the new runtime's setuid `fusermount` cannot
* mount the image. A detached shell spawned from the main process keeps normal
* privileges, waits for this pid to exit, then execs the AppImage file. An
* extracted run restarts extracted, since the runtime consumes
* `--appimage-extract-and-run` and FUSE is usually why it was used.
*/
function relaunchApp(app, args, environment = {}) {
	const platform = environment.platform ?? process.platform;
	const env = environment.env ?? process.env;
	const appImage = platform === "linux" ? env.APPIMAGE : void 0;
	if (!appImage) {
		app.relaunch({ args: [...args] });
		return;
	}
	const reportError = environment.reportError ?? ((cause) => {
		console.error(`AppImage relaunch failed: ${cause.message}`);
	});
	const runtimePid = "runtimePid" in environment ? environment.runtimePid : appImageExtractingRuntimePid(appImage);
	const pids = [environment.pid ?? process.pid, ...runtimePid === void 0 ? [] : [runtimePid]];
	const childEnv = appImageRelaunchEnvironment(env);
	if (runtimePid !== void 0) childEnv.APPIMAGE_EXTRACT_AND_RUN = "1";
	const child = (environment.spawn ?? spawn)("/usr/bin/env", [
		"bash",
		"-c",
		APPIMAGE_RELAUNCH_SCRIPT,
		pids.join(" "),
		appImage,
		...args
	], {
		detached: true,
		stdio: "ignore",
		env: childEnv
	});
	child.on("error", reportError);
	child.unref();
}
//#endregion
//#region src/runtime-tree.ts
/** Descriptor sealed at the payload root; a packaged application carries it inside `app.asar`. */
const DESKTOP_RUNTIME_FILE = "desktop-runtime.json";
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Resolve one portable resource path without permitting traversal or absolute paths.
* @param root - Runtime root.
* @param path - Slash-separated relative path from durable metadata.
* @returns Absolute resource path.
*/
function runtimePath(root, path) {
	if (path === "" || isAbsolute(path) || path.includes("\\") || path.includes(":") || path.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error(`desktop runtime: invalid relative path ${JSON.stringify(path)}`);
	return join(root, ...path.split("/"));
}
/**
* Validate release facts read from a packaged or generated descriptor.
* @param value - Parsed `release` field.
* @returns The release facts.
*/
function parseNextRelease(value) {
	if (!record(value) || value.schemaVersion !== 1) throw new Error("desktop runtime: unsupported release schema");
	for (const field of [
		"version",
		"dshVersion",
		"electronVersion",
		"pnpmVersion"
	]) if (typeof value[field] !== "string" || !VERSION.test(value[field])) throw new Error(`desktop runtime: invalid release ${field}`);
	return {
		schemaVersion: 1,
		version: value.version,
		dshVersion: value.dshVersion,
		electronVersion: value.electronVersion,
		pnpmVersion: value.pnpmVersion
	};
}
function parseTarget(platform, archs) {
	if (typeof platform !== "string" || platform === "" || !Array.isArray(archs) || archs.length === 0 || archs.some((arch) => typeof arch !== "string" || arch === "")) throw new Error("desktop runtime: invalid target");
	const unique = [...new Set(archs)].sort();
	if (unique.length !== archs.length) throw new Error("desktop runtime: duplicate target architecture");
	return {
		platform,
		archs: unique
	};
}
/**
* Validate packaged metadata and check the shared package records.
* @param value - Parsed descriptor document.
* @returns Runtime metadata whose file inventory is verified only during packaging.
*/
function parseDesktopRuntime(value) {
	if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.sharedPackages) || !Array.isArray(value.files)) throw new Error("desktop runtime: invalid descriptor");
	const release = parseNextRelease(value.release);
	const { platform, archs } = parseTarget(value.platform, value.archs);
	const sharedPackages = value.sharedPackages.map((entry) => {
		if (!record(entry) || typeof entry.name !== "string" || !PACKAGE_NAME.test(entry.name) || typeof entry.version !== "string" || !VERSION.test(entry.version) || entry.path !== `node_modules/${entry.name}`) throw new Error("desktop runtime: invalid shared package record");
		return {
			name: entry.name,
			version: entry.version,
			path: entry.path
		};
	});
	if (new Set(sharedPackages.map((entry) => entry.name)).size !== sharedPackages.length) throw new Error("desktop runtime: duplicate shared package");
	if (sharedPackages.find((entry) => entry.name === "@deepseek-ai/dsh")?.version !== release.dshVersion) throw new Error("desktop runtime: missing or mismatched @deepseek-ai/dsh");
	return {
		schemaVersion: 1,
		release,
		platform,
		archs,
		sharedPackages,
		files: value.files
	};
}
/**
* Read packaged metadata from the descriptor file and check the shared package records.
* @param descriptorFile - Descriptor at the application root; inside Electron, `app.asar` reads like a directory.
* @returns Runtime metadata whose file inventory is verified only during packaging.
*/
function readDesktopRuntime(descriptorFile) {
	return parseDesktopRuntime(JSON.parse(readFileSync(descriptorFile, "utf8")));
}
/**
* Read the version of one package installed at the application root.
* @param appRoot - Application directory; inside Electron, `app.asar` reads like a directory.
* @param name - Package name.
* @returns The installed version.
*/
function readInstalledPackageVersion(appRoot, name) {
	const manifest = JSON.parse(readFileSync(join(runtimePath(appRoot, `node_modules/${name}`), "package.json"), "utf8"));
	if (!record(manifest) || typeof manifest.version !== "string") throw new Error(`desktop runtime: ${name} has no version`);
	return manifest.version;
}
/**
* Check at startup that the installed payload is the one this application was released with.
* File bytes are verified only during packaging; here the descriptor must exist, parse, and
* name the running shell, dsh runtime, platform and architecture.
* @param descriptorFile - Descriptor at the application root; inside Electron, `app.asar` reads like a directory.
* @param identity - Facts of the running application.
* @returns The sealed descriptor.
*/
function verifyPackagedRuntimeIdentity(descriptorFile, identity) {
	const descriptor = readDesktopRuntime(descriptorFile);
	if (descriptor.release.version !== identity.version) throw new Error(`desktop runtime: payload ${descriptor.release.version} does not belong to DSH NEXT ${identity.version}`);
	if (descriptor.release.dshVersion !== identity.dshVersion) throw new Error(`desktop runtime: payload declares dsh ${descriptor.release.dshVersion} but ${identity.dshVersion} is installed`);
	if (descriptor.platform !== identity.platform || !descriptor.archs.includes(identity.arch)) throw new Error(`desktop runtime: payload for ${descriptor.platform} ${descriptor.archs.join("/")} cannot run on ${identity.platform} ${identity.arch}`);
	return descriptor;
}
//#endregion
//#region src/native-permissions.ts
/** OS permission policy kept independent of Electron for headless validation. */
var NativePermissions = class {
	native;
	pending = /* @__PURE__ */ new Map();
	constructor(native) {
		this.native = native;
	}
	query(value) {
		const permission = desktopPermission(value);
		const status = this.native.platform === "darwin" || this.native.platform === "win32" ? this.native.status(permission) : "unknown";
		return {
			permission,
			status,
			canRequest: this.native.platform === "darwin" && (status === "not-determined" || permission !== "microphone" && status === "denied"),
			canOpenSettings: this.settingsUrl(permission) !== void 0
		};
	}
	request(value) {
		const permission = desktopPermission(value);
		const pending = this.pending.get(permission);
		if (pending) return pending;
		const current = this.query(permission);
		if (!current.canRequest) return Promise.resolve(current);
		const request = (async () => {
			if (permission === "microphone") await this.native.microphone();
			else if (permission === "screen") await this.native.screen();
			else await this.native.accessibility();
			return this.query(permission);
		})().finally(() => this.pending.delete(permission));
		this.pending.set(permission, request);
		return request;
	}
	async openSettings(value) {
		const url = this.settingsUrl(desktopPermission(value));
		if (!url) throw new Error("This platform has no Desktop permission settings shortcut");
		await this.native.openSettings(url);
	}
	settingsUrl(permission) {
		if (this.native.platform === "darwin") return `x-apple.systempreferences:com.apple.preference.security?${{
			microphone: "Privacy_Microphone",
			screen: "Privacy_ScreenCapture",
			accessibility: "Privacy_Accessibility"
		}[permission]}`;
		if (this.native.platform === "win32" && permission === "microphone") return "ms-settings:privacy-microphone";
	}
};
//#endregion
//#region src/electron-permissions.ts
/** Native controls for Computer Use and trusted renderer media access. */
function createNativePermissions() {
	return new NativePermissions({
		platform: process.platform,
		status: (permission) => permission === "accessibility" ? process.platform === "darwin" ? systemPreferences.isTrustedAccessibilityClient(false) ? "granted" : "denied" : "unknown" : systemPreferences.getMediaAccessStatus(permission),
		microphone: () => systemPreferences.askForMediaAccess("microphone"),
		screen: async () => {
			await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: {
					width: 0,
					height: 0
				}
			});
		},
		accessibility: async () => {
			systemPreferences.isTrustedAccessibilityClient(true);
		},
		openSettings: (url) => shell.openExternal(url)
	});
}
/** Use the existing native menu for systems without the macOS screen-sharing picker. */
async function chooseScreen(window, language) {
	const sources = await desktopCapturer.getSources({
		types: ["screen", "window"],
		thumbnailSize: {
			width: 0,
			height: 0
		}
	});
	if (window.isDestroyed() || sources.length === 0) return void 0;
	const zh = language.startsWith("zh");
	return new Promise((resolve) => {
		const menu = Menu.buildFromTemplate([
			{
				label: zh ? "选择共享的屏幕或窗口" : "Choose a screen or window to share",
				enabled: false
			},
			...sources.map((source) => ({
				label: source.name,
				click: () => resolve(source)
			})),
			{ type: "separator" },
			{
				label: zh ? "取消" : "Cancel",
				click: () => resolve(void 0)
			}
		]);
		const closed = () => {
			menu.closePopup(window);
			resolve(void 0);
		};
		window.once("closed", closed);
		menu.popup({
			window,
			callback: () => {
				window.removeListener("closed", closed);
				resolve(void 0);
			}
		});
	});
}
function appOrigin(value) {
	try {
		const url = new URL(value);
		return url.protocol === "dsh-app:" && url.host === "app";
	} catch {
		return false;
	}
}
/** A frame may close while native consent is open; settle its callback at most once. */
function replyOnce(callback, warn) {
	let replied = false;
	return (value) => {
		if (replied) return;
		replied = true;
		try {
			callback(value);
		} catch (error) {
			warn(error);
		}
	};
}
function installMediaPermissions(session, options) {
	const trusted = (contents, url, isMainFrame) => {
		const owner = options.window();
		return !!owner && !owner.isDestroyed() && owner.webContents === contents && !contents.isDestroyed() && isMainFrame && appOrigin(url) && contents.getURL().startsWith("dsh-app://app/");
	};
	session.setPermissionCheckHandler((contents, permission, origin, details) => {
		if (!trusted(contents, origin, details.isMainFrame)) return false;
		if (permission === "media") return details.mediaType === "audio";
		return true;
	});
	session.setPermissionRequestHandler((contents, permission, callback, details) => {
		const reply = replyOnce(callback, options.warn);
		const allowed = () => trusted(contents, details.requestingUrl, details.isMainFrame);
		if (!allowed()) return reply(false);
		if (permission !== "media") return reply(true);
		const mediaTypes = "mediaTypes" in details ? details.mediaTypes : void 0;
		reply(!!mediaTypes?.length && mediaTypes.every((type) => type === "audio"));
	});
	let picking = false;
	session.setDisplayMediaRequestHandler((request, callback) => {
		const reply = replyOnce(callback, options.warn);
		const owner = options.window();
		if (picking || !owner || owner.isDestroyed() || request.frame !== owner.webContents.mainFrame || !appOrigin(request.securityOrigin) || !owner.webContents.getURL().startsWith("dsh-app://app/") || !request.userGesture || !request.videoRequested || !owner.isFocused()) return reply({});
		picking = true;
		chooseScreen(owner, options.language()).then((source) => {
			if (!owner.isDestroyed() && request.frame === owner.webContents.mainFrame && owner.webContents.getURL().startsWith("dsh-app://app/")) reply(source ? { video: source } : {});
			else reply({});
		}).catch((error) => {
			options.warn(error);
			reply({});
		}).finally(() => {
			picking = false;
		});
	}, { useSystemPicker: true });
}
//#endregion
//#region src/data-directory.ts
/**
* Resolve the Next data directory: a directory chosen in the app wins, `DSH_DESKTOP_NEXT_HOME`
* applies only without one, and `~/.dsh` is the default. The choice and the record of the last
* launch live in one fixed directory, outside every data directory and independent of the
* environment, so neither moves when the variable is added, changed or lost.
*/
const DATA_DIRECTORY_VARIABLE = "DSH_DESKTOP_NEXT_HOME";
const LOCATION_FILE = "desktop-next-location.json";
const LAST_HOME_FILE = "desktop-next-last-home.json";
function defaultDataDirectory(userHome = homedir()) {
	return join(userHome, ".dsh");
}
function dataDirectoryLocationRoot(packaged, appData, packageRoot) {
	return packaged ? join(appData(), "DSH NEXT", "home") : join(packageRoot, ".desktop-next", "home");
}
function dataDirectoryLocationFile(locationRoot) {
	return join(locationRoot, LOCATION_FILE);
}
function readHome(path) {
	const value = JSON.parse(readPrivateFile(path) ?? "null");
	if (value === null) return void 0;
	if (typeof value !== "object" || !("home" in value) || typeof value.home !== "string" || !isAbsolute(value.home)) throw new Error("Invalid Next data directory");
	return resolve(value.home);
}
function fallbackDirectory(environmentHome, userHome) {
	return environmentHome ? resolve(environmentHome) : defaultDataDirectory(userHome);
}
function readDataDirectory(locationRoot, environmentHome, userHome) {
	const fallback = fallbackDirectory(environmentHome, userHome);
	const source = environmentHome ? "environment" : "default";
	try {
		const home = readHome(dataDirectoryLocationFile(locationRoot));
		if (home === void 0) return {
			home: fallback,
			source,
			fallback
		};
		privateDirectory(home);
		return {
			home,
			source: "desktop",
			fallback
		};
	} catch (error) {
		return {
			home: fallback,
			source,
			fallback,
			error: String(error)
		};
	}
}
/**
* The data directory of the last launch. Until one is recorded, the former rule answers: the
* variable used to move the choice into its own directory, so an upgrade cannot switch silently.
*/
function previousDataDirectory(locationRoot, environmentHome, userHome) {
	try {
		const recorded = readHome(join(locationRoot, LAST_HOME_FILE));
		if (recorded !== void 0) return {
			home: recorded,
			recorded: true
		};
	} catch {}
	const fallback = fallbackDirectory(environmentHome, userHome);
	let home = fallback;
	try {
		home = readHome(dataDirectoryLocationFile(environmentHome ? fallback : locationRoot)) ?? fallback;
	} catch {}
	return {
		home,
		recorded: false
	};
}
/**
* The last launch's directory when this launch would leave it for another one: it still holds
* Next data, or it was recorded and cannot be reached now, such as on a disconnected drive.
*/
function dataDirectoryChange(locationRoot, home, environmentHome, userHome) {
	const previous = previousDataDirectory(locationRoot, environmentHome, userHome);
	if (sameDirectory(previous.home, home)) return void 0;
	let reachable = false;
	try {
		reachable = lstatSync(previous.home, { throwIfNoEntry: false })?.isDirectory() === true;
	} catch {}
	if (reachable ? !holdsNextData(previous.home) : !previous.recorded) return void 0;
	return {
		previous: previous.home,
		reachable
	};
}
function rememberDataDirectory(locationRoot, home) {
	const path = join(locationRoot, LAST_HOME_FILE);
	try {
		if (readHome(path) === resolve(home)) return;
	} catch {}
	atomicJson(path, { home: resolve(home) });
}
/** Compare as the file system resolves both paths, ignoring case on Windows. */
function sameDirectory(left, right) {
	const canonical = (path) => {
		try {
			return realpathSync.native(path);
		} catch {
			return resolve(path);
		}
	};
	const [a, b] = [canonical(left), canonical(right)];
	return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
/** A directory that a Next launch has already set up. */
function holdsNextData(home) {
	const isFile = (path) => lstatSync(path, { throwIfNoEntry: false })?.isFile() === true;
	try {
		return isFile(join(home, "desktop-next.json")) || isFile(join(home, "profiles", "desktop", "package.json"));
	} catch {
		return false;
	}
}
/** The fallback directory may already hold data shared with Stable or the CLI. */
function validateDataDirectory(target, current, fallback) {
	if (!isAbsolute(target) || target.includes("\0")) throw new Error("Data directory must be an absolute path");
	const destination = resolve(target);
	const nested = relative(current, destination);
	if (nested && !nested.startsWith("..") && !isAbsolute(nested)) throw new Error("Choose a directory outside the current data directory");
	privateDirectory(destination);
	const entries = readdirSync(destination);
	if (destination !== fallback && destination !== current && entries.length > 0 && !holdsNextData(destination)) throw new Error("Choose an empty directory or an existing Next data directory");
	return destination;
}
//#endregion
//#region src/data-backup.ts
/** Copy a stopped Next data directory into a new folder that can later be selected as a data directory. */
/** Chromium keeps live, machine-bound state there and rebuilds it; a former choice file would redirect the copy. */
const SKIPPED = /* @__PURE__ */ new Set(["electron-user-data", "desktop-next-location.json"]);
/** Clone where the file system can (APFS, ReFS, btrfs); never replace an existing file. */
const COPY_MODE = constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE;
function contains(parent, child) {
	const path = relative(parent, child);
	return path === "" || path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
function backupDirectoryName(home, now = /* @__PURE__ */ new Date()) {
	const two = (value) => String(value).padStart(2, "0");
	const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
	return `${basename(home).replace(/^\.+/u, "") || "dsh"}-backup-${stamp}`;
}
function assertBackupLocation(home, destination) {
	if (contains(resolve(home), resolve(destination))) throw new Error("Choose a backup location outside the current data directory");
}
/**
* Copy files, directories and links without following links. Links into the data directory are
* retargeted into the copy, so the backup never depends on the original; on Windows, directory
* links become junctions, which need no privilege. The copy is written beside the destination
* under a `.partial` name and renamed only when complete, so an interrupted backup is never
* mistaken for a whole one; a failed copy removes it.
*/
async function copyDataDirectory(source, destination) {
	const from = resolve(source), to = resolve(destination);
	assertBackupLocation(from, to);
	if (await lstat(to).then(() => true, () => false)) throw new Error(`Backup destination already exists: ${to}`);
	const partial = `${to}.partial`;
	await mkdir(partial, { mode: 448 });
	try {
		await copyEntries(from, partial, to, from, to);
		await rename(partial, to);
	} catch (error) {
		await rm(partial, {
			recursive: true,
			force: true
		});
		throw error;
	}
}
/** `written` is where an entry is copied now; `final` is where it lives after the rename. */
async function copyEntries(directory, written, final, from, to) {
	for (const name of await readdir(directory)) {
		if (directory === from && SKIPPED.has(name)) continue;
		const path = join(directory, name), copy = join(written, name);
		const info = await lstat(path);
		if (info.isSymbolicLink()) await copyLink(path, copy, join(final, name), from, to);
		else if (info.isDirectory()) {
			await mkdir(copy, { mode: info.mode & 511 | 448 });
			await copyEntries(path, copy, join(final, name), from, to);
		} else if (info.isFile()) await copyFile(path, copy, COPY_MODE);
	}
}
async function copyLink(path, copy, final, from, to) {
	const link = await readlink(path);
	const resolved = resolve(dirname(path), link);
	const target = !contains(from, resolved) ? resolved : isAbsolute(link) ? join(to, relative(from, resolved)) : link;
	if (process.platform !== "win32") {
		await symlink(target, copy);
		return;
	}
	const directory = await stat(path).then((info) => info.isDirectory(), () => void 0);
	if (directory === true) {
		await symlink(resolve(dirname(final), target), copy, "junction");
		return;
	}
	try {
		await symlink(target, copy, "file");
	} catch {
		if (directory === false) await copyFile(path, copy, COPY_MODE);
	}
}
//#endregion
//#region src/platform-login-window.ts
/** Sign-in partition; no `persist:` prefix, so Platform cookies never reach disk. */
const PLATFORM_LOGIN_PARTITION = "dsh-platform-login";
const CALLBACK_PATH = "/oauth/callback";
/** The Host holds the callback response until the exchange settles; an attempt lasts at most minutes. */
const CALLBACK_TIMEOUT = 15 * 6e4;
const LOOPBACK = [
	"localhost",
	"127.0.0.1",
	"[::1]"
];
/**
* Decide one request made inside the sign-in window.
* @param value - request URL.
* @param resourceType - Electron `webRequest` resource type.
* @param hostOrigin - current Host origin, or `undefined` while the Host is down.
* @returns `callback` for the Host's OAuth callback navigation, `allow` for public Platform traffic, else `cancel`.
*/
function classifyPlatformLoginRequest(value, resourceType, hostOrigin) {
	if (!URL.canParse(value)) return "cancel";
	const url = new URL(value);
	if ([
		"about:",
		"data:",
		"blob:"
	].includes(url.protocol)) return resourceType === "mainFrame" ? "cancel" : "allow";
	if (url.username !== "" || url.password !== "") return "cancel";
	if (hostOrigin !== void 0 && url.origin === hostOrigin) return resourceType === "mainFrame" && url.pathname === CALLBACK_PATH ? "callback" : "cancel";
	if (LOOPBACK.includes(url.hostname) || url.hostname.startsWith("127.")) return "cancel";
	if (url.protocol === "https:") return "allow";
	return url.protocol === "wss:" && !["mainFrame", "subFrame"].includes(resourceType) ? "allow" : "cancel";
}
/**
* Replay an intercepted callback against the Host as the native renderer.
* @param callback - callback URL the Platform navigated to.
* @param host - native Host credentials.
* @param fetchImpl - HTTP client, replaceable in tests.
* @returns the Host's status: 302 after success, 204 after a failed exchange, 4xx for a stale or foreign callback.
*/
async function forwardPlatformLoginCallback(callback, host, fetchImpl = fetch) {
	const source = new URL(callback);
	const target = new URL(host.url);
	if (source.origin !== target.origin || source.pathname !== CALLBACK_PATH) throw new Error("Not a Host sign-in callback");
	target.pathname = source.pathname;
	target.search = source.search;
	target.hash = "";
	const response = await fetchImpl(target, {
		method: "GET",
		redirect: "manual",
		signal: AbortSignal.timeout(CALLBACK_TIMEOUT),
		headers: {
			cookie: host.cookie,
			[NATIVE_ACCESS_HEADER]: host.token
		}
	});
	await response.body?.cancel();
	return response.status;
}
/** Owns the single built-in sign-in window and its in-memory session. */
var PlatformLoginWindow = class {
	options;
	window;
	popups = /* @__PURE__ */ new Set();
	configured;
	clearing = Promise.resolve();
	constructor(options) {
		this.options = options;
	}
	/**
	* Show an attempt's authorization page, replacing any earlier sign-in window.
	* @param url - authorization URL validated by host-process.ts.
	*/
	open(url) {
		const loginSession = this.loginSession();
		const previous = this.window;
		this.window = void 0;
		for (const popup of [...this.popups]) if (!popup.isDestroyed()) popup.destroy();
		if (previous !== void 0 && !previous.isDestroyed()) previous.destroy();
		this.clear(loginSession);
		const parent = this.options.parent();
		const window = new this.options.BrowserWindow({
			width: 520,
			height: 720,
			minWidth: 400,
			minHeight: 560,
			show: false,
			title: this.options.title(),
			autoHideMenuBar: true,
			backgroundColor: this.options.dark() ? "#1f1f1f" : "#ffffff",
			...parent !== void 0 && !parent.isDestroyed() ? { parent } : {},
			webPreferences: popupPreferences(loginSession)
		});
		this.window = window;
		this.guard(window.webContents, loginSession);
		window.on("page-title-updated", (event) => {
			event.preventDefault();
		});
		window.once("ready-to-show", () => {
			if (!window.isDestroyed()) {
				window.show();
				window.focus();
			}
		});
		window.on("closed", () => {
			if (this.window !== window) return;
			this.window = void 0;
			this.clear(loginSession);
		});
		this.clearing.then(async () => {
			if (!window.isDestroyed()) await window.loadURL(url);
		}).catch((error) => {
			if (!String(error).includes("ERR_ABORTED")) this.options.warn(error);
		});
	}
	/** Close the sign-in window, if any, and forget its Platform cookies. */
	close() {
		const window = this.window;
		for (const popup of [...this.popups]) if (!popup.isDestroyed()) popup.destroy();
		if (window !== void 0 && !window.isDestroyed()) window.destroy();
	}
	loginSession() {
		const loginSession = this.options.session(PLATFORM_LOGIN_PARTITION);
		if (this.configured === loginSession) return loginSession;
		this.configured = loginSession;
		loginSession.setPermissionRequestHandler((_contents, _permission, callback) => {
			callback(false);
		});
		loginSession.setPermissionCheckHandler(() => false);
		loginSession.setDevicePermissionHandler(() => false);
		loginSession.setDisplayMediaRequestHandler((_request, callback) => {
			callback({});
		});
		loginSession.on("will-download", (event) => {
			event.preventDefault();
		});
		loginSession.webRequest.onBeforeRequest((details, callback) => {
			const host = this.options.host();
			const decision = classifyPlatformLoginRequest(details.url, details.resourceType, host === void 0 ? void 0 : new URL(host.url).origin);
			callback({ cancel: decision !== "allow" });
			if (decision === "callback" && host !== void 0) forwardPlatformLoginCallback(details.url, host).then((status) => {
				if (status !== 204 && status !== 302) this.options.warn(/* @__PURE__ */ new Error(`Platform sign-in callback returned HTTP ${status}`));
			}, (error) => {
				this.options.warn(error);
			});
		});
		return loginSession;
	}
	guard(contents, loginSession) {
		contents.setWindowOpenHandler(({ url }) => classifyPlatformLoginRequest(url, "mainFrame", void 0) === "allow" ? {
			action: "allow",
			overrideBrowserWindowOptions: {
				autoHideMenuBar: true,
				webPreferences: popupPreferences(loginSession)
			}
		} : { action: "deny" });
		contents.on("did-create-window", (child) => {
			this.popups.add(child);
			child.once("closed", () => {
				this.popups.delete(child);
			});
			this.guard(child.webContents, loginSession);
		});
		contents.on("will-attach-webview", (event) => {
			event.preventDefault();
		});
		contents.on("login", (event, _details, _authInfo, callback) => {
			event.preventDefault();
			callback();
		});
	}
	clear(loginSession) {
		this.clearing = this.clearing.then(() => loginSession.clearStorageData()).catch((error) => {
			this.options.warn(error);
		});
	}
};
function popupPreferences(loginSession) {
	return {
		session: loginSession,
		sandbox: true,
		contextIsolation: true,
		nodeIntegration: false,
		webviewTag: false,
		spellcheck: false
	};
}
//#endregion
//#region ../dsh-plugin-desktop/src/desktop-installation-id.ts
/** Private installation identity used only by DSH Desktop update checks. */
/** Header carrying the pseudonymous Desktop installation identity. */
const DESKTOP_INSTALLATION_ID_HEADER = "X-DSH-Desktop-Installation-Id";
/** Relative state location below Electron's userData directory. */
const DESKTOP_INSTALLATION_ID_RELATIVE_PATH = join("identity", "installation-id");
const PRIVATE_DIRECTORY_MODE = 448;
const PRIVATE_FILE_MODE$1 = 384;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
/** Failure raised when the identity state path is unsafe or cannot be persisted. */
var DesktopInstallationIdError = class extends Error {
	constructor(message, options = {}) {
		super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
		this.name = "DesktopInstallationIdError";
	}
};
/** Return the exact private state path for one Electron userData directory. */
function desktopInstallationIdPath(userDataDirectory) {
	if (userDataDirectory.length === 0 || /[\0\r\n]/u.test(userDataDirectory) || !isAbsolute(userDataDirectory)) throw new DesktopInstallationIdError("Desktop userData must be an absolute path without control characters.");
	return join(resolve(userDataDirectory), DESKTOP_INSTALLATION_ID_RELATIVE_PATH);
}
/** Parse one canonical lowercase UUID v4 without accepting surrounding text. */
function parseDesktopInstallationId(value) {
	return typeof value === "string" && UUID_V4_PATTERN.test(value) ? value : void 0;
}
/** Require one canonical UUID v4 before it can enter an outbound header. */
function assertDesktopInstallationId(value) {
	const parsed = parseDesktopInstallationId(value);
	if (parsed === void 0) throw new DesktopInstallationIdError("Desktop installation identity must be a canonical lowercase UUID v4.");
	return parsed;
}
/**
* Return the installation UUID for one Desktop userData tree.
*
* A missing or corrupt ordinary file is rebuilt atomically. Symbolic links,
* directories, and other special entries are rejected rather than followed or
* removed. Persistence failures are explicit: callers must not silently emit a
* fresh, process-local identifier on every update check.
*/
async function getOrCreateDesktopInstallationId(userDataDirectory, options = {}) {
	const statePath = desktopInstallationIdPath(userDataDirectory);
	await prepareIdentityDirectory(dirname(statePath));
	try {
		return await withFileLock(statePath, async () => {
			const persisted = await readPersistedInstallationId(statePath);
			if (persisted !== void 0) return persisted;
			const generated = assertDesktopInstallationId((options.randomUUID ?? randomUUID)());
			await writeFileAtomic(statePath, `${generated}\n`, {
				mode: PRIVATE_FILE_MODE$1,
				dirMode: PRIVATE_DIRECTORY_MODE
			});
			return generated;
		});
	} catch (cause) {
		if (cause instanceof DesktopInstallationIdError) throw cause;
		throw new DesktopInstallationIdError("Desktop installation identity could not be persisted safely.", { cause });
	}
}
async function prepareIdentityDirectory(directory) {
	try {
		await mkdir(directory, {
			recursive: true,
			mode: PRIVATE_DIRECTORY_MODE
		});
		const stat = await lstat(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw new DesktopInstallationIdError("Desktop identity state directory must be an ordinary directory.");
		await chmod(directory, PRIVATE_DIRECTORY_MODE);
	} catch (cause) {
		if (cause instanceof DesktopInstallationIdError) throw cause;
		throw new DesktopInstallationIdError("Desktop identity state directory is unavailable.", { cause });
	}
}
async function readPersistedInstallationId(statePath) {
	let stat;
	try {
		stat = await lstat(statePath);
	} catch (cause) {
		if (cause.code === "ENOENT") return void 0;
		throw new DesktopInstallationIdError("Desktop installation identity state could not be inspected.", { cause });
	}
	if (!stat.isFile() || stat.isSymbolicLink()) throw new DesktopInstallationIdError("Desktop installation identity state must be an ordinary file.");
	if (stat.size > 128) return void 0;
	const handle = await open(statePath, "r");
	try {
		const opened = await handle.stat();
		if (!opened.isFile() || opened.size > 128) return void 0;
		if (opened.dev !== stat.dev || opened.ino !== stat.ino) throw new DesktopInstallationIdError("Desktop installation identity state changed while it was being opened.");
		const buffer = Buffer.alloc(129);
		const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
		if (bytesRead > 128) return void 0;
		const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
		const match = /^([0-9a-f-]+)\n?$/u.exec(text);
		const parsed = match === null ? void 0 : parseDesktopInstallationId(match[1]);
		if (parsed === void 0) return void 0;
		await handle.chmod(PRIVATE_FILE_MODE$1);
		return parsed;
	} catch (cause) {
		if (cause instanceof TypeError) return void 0;
		if (cause instanceof DesktopInstallationIdError) throw cause;
		throw new DesktopInstallationIdError("Desktop installation identity state could not be read safely.", { cause });
	} finally {
		await handle.close();
	}
}
//#endregion
//#region ../dsh-plugin-desktop/src/update-checker.ts
/** Headless version checks against the public DSH Desktop release service. */
/** Public endpoint returning the latest DSH Desktop version for a requested channel. */
const DESKTOP_VERSION_ENDPOINT = "https://www.dshdesktop.cn/api/desktop/version";
/** Header carrying the installed Desktop version to the fixed version endpoint. */
const DESKTOP_CURRENT_VERSION_HEADER = "X-DSH-Desktop-Version";
/** Header selecting an isolated Desktop release stream. */
const DESKTOP_RELEASE_CHANNEL_HEADER = "X-DSH-Desktop-Channel";
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
/**
* Parse strict SemVer with an optional lowercase `v` prefix.
* @param input - complete version or release tag.
* @returns parsed identifiers, or null when the input is not valid SemVer.
*/
function parseSemVer(input) {
	const version = input.startsWith("v") ? input.slice(1) : input;
	const match = SEMVER_PATTERN.exec(version);
	if (match === null) return null;
	const prerelease = match[4]?.split(".") ?? [];
	if (prerelease.some((identifier) => isNumeric(identifier) && hasLeadingZero(identifier))) return null;
	return {
		version,
		major: match[1],
		minor: match[2],
		patch: match[3],
		prerelease,
		build: match[5]?.split(".") ?? []
	};
}
/**
* Check the fixed DSH Desktop version endpoint for a release in one channel.
* @param options - installed version, caller-owned signal, and optional request adapter.
* @returns a successful comparison, or null when any request or validation step fails.
*/
async function checkForDesktopUpdate(options) {
	const current = parseCanonicalChannelVersion(options.currentVersion, options.currentChannel ?? options.channel);
	if (current === null) return null;
	let headers;
	try {
		headers = desktopVersionRequestHeaders(options.installationId, current.version, options.channel);
	} catch {
		return null;
	}
	const init = {
		method: "GET",
		headers,
		cache: "no-store",
		redirect: "error",
		...options.signal === void 0 ? {} : { signal: options.signal }
	};
	const request = options.request ?? defaultRequest;
	let response;
	try {
		response = await request(DESKTOP_VERSION_ENDPOINT, init);
	} catch {
		return null;
	}
	if (response.status !== 200) return null;
	let body;
	try {
		body = await readLimitedBody(response);
	} catch {
		return null;
	}
	let digestInput;
	try {
		digestInput = JSON.parse(body);
	} catch {
		digestInput = void 0;
	}
	const latest = parseVersionResponse(body, options.channel);
	if (latest === null) return null;
	const comparison = compareParsedSemVer(latest, current);
	const digests = parseInstallerDigestResponse(digestInput);
	return {
		status: comparison > 0 || options.allowDowngrade === true && comparison !== 0 ? "update-available" : "up-to-date",
		currentVersion: current.version,
		latestVersion: latest.version,
		...digests === void 0 ? {} : { installerSha256: digests }
	};
}
/** Build the complete header set for the fixed version-check request only. */
function desktopVersionRequestHeaders(installationId, currentVersion, channel) {
	const headers = { Accept: "application/json" };
	if (channel !== void 0) headers[DESKTOP_RELEASE_CHANNEL_HEADER] = channel;
	if (currentVersion !== void 0) {
		const parsed = channel === void 0 ? parseCanonicalChannelVersion(currentVersion, "stable") : parseCanonicalSupportedVersion(currentVersion);
		if (parsed === null) throw new Error(channel === void 0 ? "Desktop current version must be canonical stable SemVer." : "Desktop current version must be canonical SemVer.");
		headers[DESKTOP_CURRENT_VERSION_HEADER] = parsed.version;
	}
	if (installationId !== void 0) headers[DESKTOP_INSTALLATION_ID_HEADER] = assertDesktopInstallationId(installationId);
	return headers;
}
async function defaultRequest(url, init) {
	return globalThis.fetch(url, init);
}
async function readLimitedBody(response) {
	const declaredLength = response.headers.get("content-length");
	if (declaredLength !== null && /^[0-9]+$/u.test(declaredLength) && BigInt(declaredLength) > BigInt(4096)) throw new Error("version response is too large");
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let bytesRead = 0;
	let body = "";
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			bytesRead += chunk.value.byteLength;
			if (bytesRead > 4096) {
				await reader.cancel().catch(() => void 0);
				throw new Error("version response is too large");
			}
			body += decoder.decode(chunk.value, { stream: true });
		}
		return body + decoder.decode();
	} finally {
		reader.releaseLock();
	}
}
function parseVersionResponse(body, expectedChannel) {
	let value;
	try {
		value = JSON.parse(body);
	} catch {
		return null;
	}
	if (!isRecord(value) || typeof value.version !== "string") return null;
	if (expectedChannel !== "stable" && value.channel !== expectedChannel) return null;
	if (value.channel !== void 0 && value.channel !== expectedChannel) return null;
	return parseCanonicalUpdateVersion(value.version, expectedChannel);
}
/** Stable may promote a Next installer while keeping the stable service stream authoritative. */
function parseCanonicalUpdateVersion(input, channel) {
	return parseCanonicalChannelVersion(input, channel) ?? (channel === "stable" ? parseCanonicalChannelVersion(input, "next") : null);
}
function parseCanonicalChannelVersion(input, channel) {
	const parsed = parseCanonicalVersion(input);
	if (parsed === null) return null;
	if (channel === "stable") return parsed.prerelease.length === 0 ? parsed : null;
	if (channel === "next" && parsed.prerelease.length === 1 && parsed.prerelease[0] === "next") return parsed;
	return parsed.prerelease.length === 2 && parsed.prerelease[0] === channel && isNumeric(parsed.prerelease[1]) ? parsed : null;
}
/**
* Extract optional per-platform installer digests from the parsed version
* response: `{ "version": "2.0.2", "sha256": { "windows": "<hex>", "mac": "<hex>" } }`.
* Hex digits are case-normalized; absent or malformed fields simply leave the
* digest gate unset for that platform.
*/
function parseInstallerDigestResponse(value) {
	if (!isRecord(value) || !isRecord(value.sha256)) return void 0;
	const digests = {};
	const normalize = (digest) => {
		if (typeof digest !== "string") return void 0;
		const normalized = digest.trim().toLowerCase();
		return /^[0-9a-f]{64}$/u.test(normalized) ? normalized : void 0;
	};
	const windows = normalize(value.sha256.windows);
	const mac = normalize(value.sha256.mac);
	if (windows !== void 0) digests.win32 = windows;
	if (mac !== void 0) digests.darwin = mac;
	return Object.keys(digests).length > 0 ? digests : void 0;
}
function parseCanonicalSupportedVersion(input) {
	return parseCanonicalChannelVersion(input, "stable") ?? parseCanonicalChannelVersion(input, "beta") ?? parseCanonicalChannelVersion(input, "next");
}
function parseCanonicalVersion(input) {
	const parsed = parseSemVer(input);
	return parsed !== null && parsed.version === input ? parsed : null;
}
function compareParsedSemVer(left, right) {
	for (const key of [
		"major",
		"minor",
		"patch"
	]) {
		const comparison = compareNumeric(left[key], right[key]);
		if (comparison !== 0) return comparison;
	}
	if (left.prerelease.length === 0) return right.prerelease.length === 0 ? 0 : 1;
	if (right.prerelease.length === 0) return -1;
	const length = Math.max(left.prerelease.length, right.prerelease.length);
	for (let index = 0; index < length; index += 1) {
		const leftIdentifier = left.prerelease[index];
		const rightIdentifier = right.prerelease[index];
		if (leftIdentifier === void 0) return -1;
		if (rightIdentifier === void 0) return 1;
		if (leftIdentifier === rightIdentifier) continue;
		const leftNumeric = isNumeric(leftIdentifier);
		const rightNumeric = isNumeric(rightIdentifier);
		if (leftNumeric && rightNumeric) return compareNumeric(leftIdentifier, rightIdentifier);
		if (leftNumeric) return -1;
		if (rightNumeric) return 1;
		return leftIdentifier < rightIdentifier ? -1 : 1;
	}
	return 0;
}
function compareNumeric(left, right) {
	if (left.length !== right.length) return left.length < right.length ? -1 : 1;
	if (left === right) return 0;
	return left < right ? -1 : 1;
}
function isNumeric(identifier) {
	return /^[0-9]+$/u.test(identifier);
}
function hasLeadingZero(identifier) {
	return identifier.length > 1 && identifier.startsWith("0");
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
//#region ../dsh-plugin-desktop/src/update-download.ts
/** Headless, confirmation-gated downloads for DSH Desktop installers. */
/** Fixed download endpoints that record one user-confirmed installer download. */
const DESKTOP_DOWNLOAD_URLS = {
	darwin: "https://www.dshdesktop.cn/api/downloads/mac",
	win32: "https://www.dshdesktop.cn/api/downloads/windows"
};
/** Header pinning a download request and response to the checked release. */
const DESKTOP_TARGET_VERSION_HEADER = "X-DSH-Desktop-Target-Version";
/** Maximum accepted installer size, in bytes. */
const MAX_UPDATE_DOWNLOAD_BYTES = 1024 * 1024 * 1024;
/** Typed failure from installer request, validation, or cancellation. */
var UpdateDownloadError = class extends Error {
	/** Stable programmatic failure category. */
	code;
	/** HTTP status for an unsuccessful response, otherwise undefined. */
	status;
	/**
	* Create one safe update-download failure.
	* @param code - Stable failure category.
	* @param message - Diagnostic text without response content.
	* @param options - Optional HTTP status and underlying failure.
	*/
	constructor(code, message, options = {}) {
		super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
		this.name = "UpdateDownloadError";
		this.code = code;
		this.status = options.status;
	}
};
const PRIVATE_FILE_MODE = 384;
const DECIMAL_BYTES = /^(0|[1-9][0-9]*)$/u;
const DMG_TRAILER_BYTES = 512;
const DMG_TRAILER_MAGIC = Buffer.from("koly", "ascii");
const DOS_HEADER_BYTES = 64;
const PE_OFFSET_POSITION = 60;
const PE_MAGIC = Buffer.from([
	80,
	69,
	0,
	0
]);
/**
* Download one installer after its caller has obtained user confirmation.
* @param options - Fixed platform, release version, selected destination, request, and cancellation inputs.
* @returns Absolute path to the completely written and validated installer.
* @throws {UpdateDownloadError} For invalid inputs, transport failures, rejected responses, cancellation, and invalid installers.
*/
async function downloadDesktopUpdate(options) {
	const platform = validatedPlatform(options.platform);
	const channel = options.channel ?? "stable";
	validatedVersion(options.version, channel);
	const destinationPath = validatedArtifactPath(options.destinationPath, platform);
	const expectedSha256 = normalizedExpectedDigest(options.expectedSha256);
	const paths = await prepareDownloadPaths(destinationPath);
	throwIfAborted(options.signal);
	let response;
	let finalUrl;
	try {
		const settled = await options.request(DESKTOP_DOWNLOAD_URLS[platform], {
			method: "GET",
			headers: {
				[DESKTOP_RELEASE_CHANNEL_HEADER]: channel,
				[DESKTOP_TARGET_VERSION_HEADER]: options.version
			},
			cache: "no-store",
			redirect: "follow",
			...options.signal === void 0 ? {} : { signal: options.signal }
		});
		response = settled.response;
		finalUrl = settled.finalUrl;
	} catch (cause) {
		if (options.signal?.aborted === true || isAbortFailure(cause)) throw aborted(cause);
		throw new UpdateDownloadError("network", "The update installer could not be downloaded.", { cause });
	}
	if (response.status !== 200) {
		await discardResponseBody(response);
		throw new UpdateDownloadError("http-status", `The update download service returned HTTP ${String(response.status)}.`, { status: response.status });
	}
	if (response.body === null) throw new UpdateDownloadError("empty-body", "The update download service returned an empty body.");
	try {
		assertSecureDownloadUrl(finalUrl);
		assertDeclaredSize(response);
	} catch (cause) {
		await discardResponseBody(response);
		throw cause;
	}
	let failure;
	try {
		const declared = Number(response.headers.get("content-length"));
		await writeResponseBody(paths.temporary, response.body, options.signal, (received) => {
			options.onProgress?.(received, Number.isFinite(declared) && declared > 0 ? declared : void 0);
		});
		throwIfAborted(options.signal);
		await validateArtifact(paths.temporary, platform);
		if (expectedSha256 !== void 0) await assertInstallerDigest(paths.temporary, expectedSha256);
		throwIfAborted(options.signal);
		await unlinkIfPresent(paths.completed);
		await rename(paths.temporary, paths.completed);
		return paths.completed;
	} catch (cause) {
		failure = options.signal?.aborted === true || isAbortFailure(cause) ? aborted(cause) : cause;
		throw failure;
	} finally {
		try {
			await unlinkIfPresent(paths.temporary);
		} catch (cleanupCause) {
			if (failure === void 0) throw cleanupCause;
			throw new AggregateError([failure, cleanupCause], "Failed to download and clean up the update installer.");
		}
	}
}
/** Fixed default filename shown by the native destination picker. */
function desktopUpdateFilename(platform, version, channel = "stable") {
	validatedPlatform(platform);
	validatedVersion(version, channel);
	const extension = platform === "darwin" ? "dmg" : "exe";
	const platformName = platform === "darwin" ? "mac" : "windows";
	return `${parseCanonicalChannelVersion(version, "next") !== null ? "DSH-NEXT" : channel === "beta" ? "DSH-Desktop-Beta" : "DSH-Desktop"}-${version}-${platformName}.${extension}`;
}
function validatedPlatform(platform) {
	if (platform !== "darwin" && platform !== "win32") throw new UpdateDownloadError("invalid-options", `Unsupported update download platform: ${String(platform)}`);
	return platform;
}
function validatedVersion(version, channel = "stable") {
	if (parseCanonicalUpdateVersion(version, channel) === null) throw new UpdateDownloadError("invalid-options", `The update version must match the ${channel} channel.`);
	return version;
}
async function prepareDownloadPaths(destinationPath) {
	const directory = dirname(destinationPath);
	const directoryStat = await lstat(directory);
	if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new UpdateDownloadError("invalid-options", "The update destination directory must be a real directory.");
	const completedStat = await lstatOptional(destinationPath);
	if (completedStat !== void 0) {
		if (!completedStat.isFile() || completedStat.isSymbolicLink()) throw new UpdateDownloadError("invalid-options", "The completed update path is not a regular file.");
	}
	return {
		completed: destinationPath,
		temporary: join(directory, `.${basename(destinationPath)}.${process.pid}.${randomUUID()}.partial`)
	};
}
function validatedArtifactPath(path, platform) {
	if (path.length === 0 || /[\0\r\n]/u.test(path) || !isAbsolute(path)) throw new UpdateDownloadError("invalid-options", "The update destination path must be absolute.");
	const expectedExtension = platform === "darwin" ? ".dmg" : ".exe";
	if (extname(path).toLowerCase() !== expectedExtension) throw new UpdateDownloadError("invalid-options", `The update destination must use ${expectedExtension}.`);
	return resolve(path);
}
async function lstatOptional(filename) {
	try {
		return await lstat(filename);
	} catch (cause) {
		if (cause.code === "ENOENT") return void 0;
		throw cause;
	}
}
/** Release a rejected response body so its connection does not linger until GC. */
async function discardResponseBody(response) {
	await response.body?.cancel().catch(() => void 0);
}
function assertDeclaredSize(response) {
	const declared = response.headers.get("content-length");
	if (declared === null || !DECIMAL_BYTES.test(declared)) return;
	if (BigInt(declared) > BigInt(1073741824)) throw new UpdateDownloadError("response-too-large", `The update installer exceeds ${String(MAX_UPDATE_DOWNLOAD_BYTES)} bytes.`);
}
/** Require a usable HTTPS URL even when an update channel permits external artifact hosts. */
function assertSecureDownloadUrl(finalUrl) {
	let parsed;
	try {
		parsed = new URL(finalUrl);
	} catch {
		throw new UpdateDownloadError("redirect-origin", "The update download transport reported no usable final URL.");
	}
	if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port && parsed.port !== "443") throw new UpdateDownloadError("redirect-origin", "The update download must settle on HTTPS.");
	return parsed;
}
/** Normalize the optional expected digest at option validation time, before any network work. */
function normalizedExpectedDigest(expected) {
	if (expected === void 0) return void 0;
	const normalized = expected.trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/u.test(normalized)) throw new UpdateDownloadError("invalid-options", "The expected installer digest is not a hex SHA-256.");
	return normalized;
}
/**
* Verify the downloaded installer against the published digest. The file is
* hashed in bounded chunks — installers reach hundreds of megabytes, and a
* single whole-file buffer would spike main-process memory — and compared in
* constant time over the decoded bytes.
*/
async function assertInstallerDigest(filename, expected) {
	const expectedBytes = Buffer.from(expected, "hex");
	const hash = createHash("sha256");
	const handle = await open(filename, "r");
	try {
		const chunk = Buffer.alloc(1024 * 1024);
		while (true) {
			const result = await handle.read(chunk, 0, chunk.byteLength, null);
			if (result.bytesRead === 0) break;
			hash.update(result.bytesRead === chunk.byteLength ? chunk : chunk.subarray(0, result.bytesRead));
		}
	} finally {
		await handle.close();
	}
	const actualBytes = hash.digest();
	if (actualBytes.byteLength !== expectedBytes.byteLength || !timingSafeEqual(actualBytes, expectedBytes)) throw new UpdateDownloadError("invalid-artifact", "The update installer does not match the published digest.");
}
async function writeResponseBody(filename, body, signal, onProgress) {
	const handle = await open(filename, "wx", PRIVATE_FILE_MODE);
	const reader = body.getReader();
	let bytesWritten = 0;
	try {
		while (true) {
			throwIfAborted(signal);
			const chunk = await reader.read();
			throwIfAborted(signal);
			if (chunk.done) break;
			if (chunk.value.byteLength > 1073741824 - bytesWritten) throw new UpdateDownloadError("response-too-large", `The update installer exceeds ${String(MAX_UPDATE_DOWNLOAD_BYTES)} bytes.`);
			await writeAll(handle, chunk.value);
			bytesWritten += chunk.value.byteLength;
			onProgress?.(bytesWritten);
		}
		if (bytesWritten === 0) throw new UpdateDownloadError("empty-body", "The update download service returned an empty body.");
		await handle.sync();
	} catch (cause) {
		await reader.cancel(cause).catch(() => void 0);
		throw cause;
	} finally {
		reader.releaseLock();
		await handle.close();
	}
}
async function writeAll(handle, chunk) {
	let offset = 0;
	while (offset < chunk.byteLength) {
		const result = await handle.write(chunk, offset, chunk.byteLength - offset, null);
		if (result.bytesWritten === 0) throw new Error("The update installer write made no progress.");
		offset += result.bytesWritten;
	}
}
async function validateArtifact(filename, platform) {
	const handle = await open(filename, "r");
	try {
		const stat = await handle.stat();
		if (!stat.isFile() || stat.size <= 0 || stat.size > 1073741824) throw invalidArtifact(platform);
		if (platform === "darwin") {
			if (stat.size < DMG_TRAILER_BYTES) throw invalidArtifact(platform);
			const magic = Buffer.alloc(DMG_TRAILER_MAGIC.byteLength);
			if ((await handle.read(magic, 0, magic.byteLength, stat.size - DMG_TRAILER_BYTES)).bytesRead !== magic.byteLength || !magic.equals(DMG_TRAILER_MAGIC)) throw invalidArtifact(platform);
			return;
		}
		if (stat.size < DOS_HEADER_BYTES) throw invalidArtifact(platform);
		const dosHeader = Buffer.alloc(DOS_HEADER_BYTES);
		if ((await handle.read(dosHeader, 0, dosHeader.byteLength, 0)).bytesRead !== dosHeader.byteLength || dosHeader[0] !== 77 || dosHeader[1] !== 90) throw invalidArtifact(platform);
		const peOffset = dosHeader.readUInt32LE(PE_OFFSET_POSITION);
		if (peOffset > stat.size - PE_MAGIC.byteLength) throw invalidArtifact(platform);
		const peMagic = Buffer.alloc(PE_MAGIC.byteLength);
		if ((await handle.read(peMagic, 0, peMagic.byteLength, peOffset)).bytesRead !== peMagic.byteLength || !peMagic.equals(PE_MAGIC)) throw invalidArtifact(platform);
	} finally {
		await handle.close();
	}
}
function invalidArtifact(platform) {
	return new UpdateDownloadError("invalid-artifact", platform === "darwin" ? "The downloaded file is not a UDIF disk image." : "The downloaded file is not a PE executable.");
}
function throwIfAborted(signal) {
	if (signal?.aborted !== true) return;
	throw aborted(signal.reason);
}
function aborted(cause) {
	return new UpdateDownloadError("aborted", "The update installer download was cancelled.", { cause });
}
function isAbortFailure(value) {
	return value instanceof UpdateDownloadError ? value.code === "aborted" : typeof value === "object" && value !== null && "name" in value && value.name === "AbortError";
}
async function unlinkIfPresent(filename) {
	try {
		await unlink(filename);
	} catch (cause) {
		if (cause.code !== "ENOENT") throw cause;
	}
}
//#endregion
//#region src/updates.ts
/** Main-process update ownership survives a stopped or broken Profile Host. */
var NextUpdates = class {
	options;
	state;
	result;
	operation;
	controller;
	timer;
	directory;
	notifiedVersion;
	cacheReady;
	disposed = false;
	constructor(options) {
		this.options = options;
		this.state = {
			phase: "idle",
			installable: options.packaged && ["darwin", "win32"].includes(options.platform)
		};
	}
	snapshot() {
		return { ...this.state };
	}
	initializeCache() {
		return this.cacheReady ??= (async () => {
			const cache = join(this.options.userData, "next-updates");
			privateDirectory(cache);
			try {
				const text = readPrivateFile(join(cache, "state.json"), 4096);
				const parsed = text ? JSON.parse(text) : void 0;
				if (typeof parsed?.notifiedVersion === "string") this.notifiedVersion = parsed.notifiedVersion;
			} catch (error) {
				this.options.log(error);
			}
			for (const entry of await readdir(cache, { withFileTypes: true })) if (entry.isDirectory() && /^download-[A-Za-z0-9]+$/.test(entry.name)) await rm(join(cache, entry.name), {
				recursive: true,
				force: true
			}).catch(this.options.log);
		})();
	}
	recordNotifiedVersion(version) {
		this.notifiedVersion = version;
		try {
			atomicJson(join(this.options.userData, "next-updates", "state.json"), { notifiedVersion: version });
		} catch (error) {
			this.options.log(error);
		}
	}
	set(patch) {
		if (this.disposed) return;
		this.state = {
			...this.state,
			error: void 0,
			...patch
		};
		this.options.changed();
	}
	start() {
		if (!this.options.packaged || !["darwin", "win32"].includes(this.options.platform) || this.timer || this.disposed) return;
		this.initializeCache().catch(this.options.log);
		const poll = () => {
			if (this.disposed) return;
			if ([
				"idle",
				"current",
				"error"
			].includes(this.state.phase)) this.check(true);
			this.timer = setTimeout(poll, 360 * 6e4);
			this.timer.unref();
		};
		this.timer = setTimeout(poll, 3e4);
		this.timer.unref();
	}
	run(task) {
		if (this.disposed) return Promise.resolve();
		if (this.operation) return this.operation;
		this.controller = new AbortController();
		const signal = this.controller.signal;
		this.operation = (async () => {
			try {
				await this.initializeCache();
				signal.throwIfAborted();
				await task(signal);
			} catch (error) {
				if (!signal.aborted) {
					this.options.log(error);
					this.set({
						phase: "error",
						error: "download"
					});
				}
			}
		})().finally(() => {
			this.operation = void 0;
			this.controller = void 0;
		});
		return this.operation;
	}
	async query(signal) {
		let installationId;
		if (this.options.packaged) try {
			installationId = await getOrCreateDesktopInstallationId(this.options.userData);
		} catch (error) {
			this.options.log(error);
		}
		return checkForDesktopUpdate({
			currentVersion: this.options.version,
			channel: "next",
			installationId,
			request: this.options.request,
			signal: AbortSignal.any([signal, AbortSignal.timeout(2e4)])
		});
	}
	check(background = false) {
		if (this.state.phase === "ready" || this.state.phase === "installing") return Promise.resolve();
		return this.run(async (signal) => {
			this.set({ phase: "checking" });
			try {
				this.result = await this.query(signal) ?? void 0;
				if (!this.result) {
					this.set({
						phase: "error",
						error: "service",
						version: void 0
					});
					return;
				}
				this.set({
					phase: this.result.status === "update-available" ? "available" : "current",
					version: this.result.latestVersion
				});
				if (this.result.status === "update-available") {
					if (background && this.state.installable && this.result.latestVersion !== this.notifiedVersion) {
						this.recordNotifiedVersion(this.result.latestVersion);
						if (!this.disposed) this.options.available?.(this.result.latestVersion);
					} else if (!background && this.result.latestVersion !== this.notifiedVersion) this.recordNotifiedVersion(this.result.latestVersion);
				}
			} catch (error) {
				this.options.log(error);
				this.set({
					phase: "error",
					error: "service"
				});
			}
		});
	}
	download() {
		if (!this.state.installable) {
			this.set({
				phase: "error",
				error: this.options.packaged ? "unsupported" : "development"
			});
			return Promise.resolve();
		}
		if (this.state.phase === "ready" || this.state.phase === "installing") return Promise.resolve();
		return this.run(async (signal) => {
			let preparing = false;
			try {
				this.set({ phase: "checking" });
				const result = await this.query(signal);
				if (!result) {
					this.set({
						phase: "error",
						error: "service"
					});
					return;
				}
				this.result = result;
				if (result.status !== "update-available") {
					this.set({
						phase: "current",
						version: result.latestVersion
					});
					return;
				}
				if (result.latestVersion !== this.notifiedVersion) this.recordNotifiedVersion(result.latestVersion);
				const platform = this.options.platform;
				const cache = join(this.options.userData, "next-updates");
				privateDirectory(cache);
				if (this.directory) await rm(this.directory, {
					recursive: true,
					force: true
				});
				const directory = this.directory = await mkdtemp(join(cache, "download-"));
				this.set({
					phase: "downloading",
					version: result.latestVersion,
					received: 0,
					total: void 0
				});
				let lastProgress = 0;
				const path = await downloadDesktopUpdate({
					platform,
					version: result.latestVersion,
					channel: "next",
					destinationPath: join(directory, desktopUpdateFilename(platform, result.latestVersion, "next")),
					request: this.options.artifactRequest,
					expectedSha256: result.installerSha256?.[platform],
					signal: AbortSignal.any([signal, AbortSignal.timeout(60 * 6e4)]),
					onProgress: (received, total) => {
						if (Date.now() - lastProgress < 250 && received !== total) return;
						lastProgress = Date.now();
						this.set({
							received,
							total
						});
					}
				});
				signal.throwIfAborted();
				preparing = true;
				this.set({ phase: "preparing" });
				await this.options.prepare(path, result.latestVersion, directory, signal);
				signal.throwIfAborted();
				this.set({ phase: "ready" });
			} catch (error) {
				this.options.log(error);
				this.set({
					phase: "error",
					error: preparing ? "prepare" : "download"
				});
			}
		});
	}
	async install() {
		if (this.disposed || this.state.phase !== "ready") return;
		this.set({ phase: "installing" });
		try {
			await this.options.install();
		} catch (error) {
			this.options.log(error);
			this.set({
				phase: "error",
				error: "install"
			});
		}
	}
	async dispose(keepInstaller = false) {
		this.disposed = true;
		clearTimeout(this.timer);
		this.controller?.abort();
		await this.operation;
		if (this.directory && !keepInstaller) await rm(this.directory, {
			recursive: true,
			force: true
		}).catch(this.options.log);
	}
};
//#endregion
//#region src/update-transport.ts
/** Installer transport: Chromium `net.request` follows redirects one hop at a time. */
/** Redirect hops accepted before the transport reports a loop. */
const MAX_REDIRECTS = 8;
/**
* Non-persistent partition for installer traffic. It starts with an empty
* cookie jar, stores nothing, and therefore carries the `credentials: 'omit'`
* guarantee the previous `net.fetch` request expressed directly.
*/
const UPDATE_PARTITION = "dsh-next-update";
/** HTTP statuses whose Response must be constructed without a body stream. */
const NULL_BODY_STATUSES = /* @__PURE__ */ new Set([
	204,
	205,
	304
]);
/**
* Build the artifact transport for installer downloads.
*
* `net.fetch` cannot follow redirects manually: with `redirect: 'manual'` it
* rejects with `Redirect was cancelled` instead of returning the 3xx response,
* so a release service that redirects to storage can never be downloaded.
* `net.request` emits a `redirect` event and waits for `followRedirect()` or
* `abort()`, which supports the per-hop HTTPS check.
*
* @returns A request adapter that resolves with the settled response and URL.
*/
function createArtifactRequest() {
	return (url, init) => requestArtifact(url, init);
}
function requestArtifact(url, init) {
	return new Promise((resolve, reject) => {
		const signal = init.signal ?? void 0;
		let current;
		let hops = 0;
		let settled = false;
		const release = () => {
			signal?.removeEventListener("abort", onAbort);
		};
		const finish = (value) => {
			if (settled) return;
			settled = true;
			release();
			resolve(value);
		};
		const fail = (error) => {
			if (settled) return;
			settled = true;
			release();
			reject(error instanceof Error ? error : new Error(String(error)));
		};
		function onAbort() {
			const request = current;
			current = void 0;
			fail(Object.assign(/* @__PURE__ */ new Error("The update download was cancelled."), { name: "AbortError" }));
			try {
				request?.abort();
			} catch {}
		}
		if (signal?.aborted === true) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });
		const open = (target) => {
			if (settled) return;
			let secure;
			try {
				secure = assertSecureDownloadUrl(target);
			} catch (error) {
				fail(error);
				return;
			}
			if (hops >= MAX_REDIRECTS) {
				fail(/* @__PURE__ */ new Error("Too many update redirects"));
				return;
			}
			hops += 1;
			const headers = new Headers(hops === 1 ? init.headers : { Accept: "application/octet-stream" });
			headers.set("cache-control", "no-cache");
			const request = net.request({
				url: secure.href,
				method: "GET",
				redirect: "manual",
				session: session.fromPartition(UPDATE_PARTITION)
			});
			current = request;
			headers.forEach((value, key) => request.setHeader(key, value));
			let closing = false;
			request.on("redirect", (_status, _method, redirectUrl) => {
				closing = true;
				try {
					request.abort();
				} catch {}
				let next;
				try {
					next = new URL(redirectUrl, secure.href).href;
				} catch {
					fail(/* @__PURE__ */ new Error("Update redirect has no usable location"));
					return;
				}
				open(next);
			});
			request.on("response", (incoming) => {
				if (settled) return;
				const status = incoming.statusCode;
				if (status === void 0) {
					fail(/* @__PURE__ */ new Error("The update download response carried no HTTP status."));
					return;
				}
				const responseHeaders = new Headers();
				for (const [key, value] of Object.entries(incoming.headers)) for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(key, item);
				try {
					finish({
						response: new Response(NULL_BODY_STATUSES.has(status) ? null : Readable.toWeb(incoming), {
							status,
							headers: responseHeaders
						}),
						finalUrl: secure.href
					});
				} catch (error) {
					fail(error);
				}
			});
			request.on("abort", () => {
				if (!closing && !settled) fail(/* @__PURE__ */ new Error("The update download request was aborted."));
			});
			request.on("error", (error) => fail(error));
			request.end();
		};
		open(url);
	});
}
//#endregion
//#region src/update-installer.ts
/** Native installer handoff with explicit user-visible progress on Windows and macOS. */
const execute = promisify(execFile);
const MAC_PROGRESS_UI_SCRIPT = `
ObjC.import("Cocoa");
const app = $.NSApplication.sharedApplication;
app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
const env = $.NSProcessInfo.processInfo.environment;
const title = ObjC.unwrap(env.objectForKey("DSH_UPDATE_TITLE")) || "DSH NEXT";
const message = ObjC.unwrap(env.objectForKey("DSH_UPDATE_MESSAGE")) || "Updating DSH NEXT…";
const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, 0, 380, 110), $.NSTitledWindowMask, $.NSBackingStoreBuffered, false);
win.setTitle($(title));
win.setLevel($.NSFloatingWindowLevel);
win.setReleasedWhenClosed(false);
const content = win.contentView;
const label = $.NSTextField.alloc.initWithFrame($.NSMakeRect(24, 58, 332, 24));
label.setStringValue($(message));
label.setBezeled(false);
label.setDrawsBackground(false);
label.setEditable(false);
label.setSelectable(false);
label.setFont($.NSFont.systemFontOfSize(13));
content.addSubview(label);
const bar = $.NSProgressIndicator.alloc.initWithFrame($.NSMakeRect(24, 28, 332, 20));
bar.setStyle($.NSProgressIndicatorBarStyle);
bar.setIndeterminate(true);
bar.startAnimation(null);
content.addSubview(bar);
win.center;
win.makeKeyAndOrderFront(null);
app.activateIgnoringOtherApps(true);
app.run;
`;
const MAC_UPDATE_SCRIPT = [
	"/usr/bin/osascript -l JavaScript -e \"$DSH_UPDATE_UI_SCRIPT\" >/dev/null 2>&1 &",
	"UI_PID=$!",
	"cleanup() { kill \"$UI_PID\" 2>/dev/null || true; }",
	"trap cleanup EXIT",
	"i=0",
	"while kill -0 \"$DSH_UPDATE_PID\" 2>/dev/null; do",
	"  i=$((i + 1))",
	"  [ \"$i\" -ge 150 ] && exit 1",
	"  sleep 0.2",
	"done",
	"BACKUP=\"${DSH_UPDATE_INSTALLED}.backup-$$\"",
	"rm -rf \"$BACKUP\"",
	"mv \"$DSH_UPDATE_INSTALLED\" \"$BACKUP\" || exit 1",
	"if mv \"$DSH_UPDATE_STAGED\" \"$DSH_UPDATE_INSTALLED\" 2>/dev/null || /usr/bin/ditto \"$DSH_UPDATE_STAGED\" \"$DSH_UPDATE_INSTALLED\"; then",
	"  rm -rf \"$BACKUP\" \"$DSH_UPDATE_DIR\"",
	"else",
	"  rm -rf \"$DSH_UPDATE_INSTALLED\"",
	"  mv \"$BACKUP\" \"$DSH_UPDATE_INSTALLED\"",
	"  cleanup",
	"  /usr/bin/open \"$DSH_UPDATE_INSTALLED\"",
	"  exit 1",
	"fi",
	"/usr/bin/xattr -dr com.apple.quarantine \"$DSH_UPDATE_INSTALLED\" 2>/dev/null || true",
	"sleep 0.8",
	"cleanup",
	"/usr/bin/open \"$DSH_UPDATE_INSTALLED\" --args --updated"
].join("\n");
/** Check both bundle identity and embedded SemVer before validating the signature. */
function assertNextMacBundle(identifier, manifest, version) {
	if (identifier.trim() !== "ai.deepseek.dsh.desktop.next" || !manifest || typeof manifest !== "object" || manifest.name !== "dsh-desktop-next" || manifest.version !== version) throw new Error("The downloaded application does not match this Next release");
}
function assertNextWindowsInstaller(info, version) {
	if (info.ProductName !== "DSH NEXT" || info.ProductVersion !== version) throw new Error("The installer does not match this Next release");
}
var NextUpdateInstaller = class {
	options;
	prepared;
	nativeReady = false;
	constructor(options) {
		this.options = options;
	}
	async prepare(path, version, directory, signal) {
		this.prepared = void 0;
		this.nativeReady = false;
		if (this.options.platform === "win32") {
			const info = await execute(join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"), [
				"-NoProfile",
				"-NonInteractive",
				"-EncodedCommand",
				Buffer.from("$ErrorActionPreference=\"Stop\"; (Get-Item -LiteralPath $env:DSH_UPDATE_INSTALLER).VersionInfo | Select-Object ProductName,ProductVersion | ConvertTo-Json -Compress", "utf16le").toString("base64")
			], {
				signal,
				timeout: 3e4,
				windowsHide: true,
				env: {
					...process.env,
					DSH_UPDATE_INSTALLER: path
				},
				maxBuffer: 16384
			});
			assertNextWindowsInstaller(JSON.parse(info.stdout.replace(/^\uFEFF/, "")), version);
			this.prepared = {
				path,
				version
			};
			return;
		}
		if (this.options.platform !== "darwin") throw new Error("Unsupported update platform");
		const mount = join(directory, "volume");
		await mkdir(mount, { mode: 448 });
		const run = (file, args) => execute(file, args, {
			signal,
			timeout: 10 * 6e4,
			maxBuffer: 1024 * 1024
		});
		const installed = dirname(dirname(dirname(this.options.executable)));
		if (!installed.endsWith(".app")) throw new Error("Invalid installed Next application bundle");
		await run("/usr/bin/codesign", [
			"--verify",
			"--deep",
			"--strict",
			installed
		]);
		let attached = false;
		try {
			await run("/usr/bin/hdiutil", [
				"attach",
				"-readonly",
				"-nobrowse",
				"-noautoopen",
				"-mountpoint",
				mount,
				path
			]);
			attached = true;
			const apps = (await readdir(mount, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
			if (apps.length !== 1) throw new Error("Expected one application in the Next disk image");
			const bundle = join(mount, apps[0].name);
			const info = await run("/usr/libexec/PlistBuddy", [
				"-c",
				"Print :CFBundleIdentifier",
				join(bundle, "Contents", "Info.plist")
			]);
			const manifestPath = join(bundle, "Contents", "Resources", "app", "package.json");
			const meta = await lstat(manifestPath);
			if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 128 * 1024) throw new Error("Invalid Next application manifest");
			assertNextMacBundle(info.stdout, JSON.parse(await readFile(manifestPath, "utf8")), version);
			await run("/usr/bin/codesign", [
				"--verify",
				"--deep",
				"--strict",
				bundle
			]);
			const installedSignature = await run("/usr/bin/codesign", [
				"-dv",
				"--verbose=4",
				installed
			]);
			const candidateSignature = await run("/usr/bin/codesign", [
				"-dv",
				"--verbose=4",
				bundle
			]);
			const team = /^TeamIdentifier=([A-Z0-9]+)$/m.exec(installedSignature.stderr)?.[1];
			if (!team || !candidateSignature.stderr.split("\n").includes(`TeamIdentifier=${team}`)) throw new Error("Next update signing team does not match the installed application");
			const staged = join(directory, apps[0].name);
			await run("/usr/bin/ditto", [bundle, staged]);
			this.prepared = {
				path,
				version,
				directory,
				bundle: staged,
				installed
			};
		} finally {
			await execute("/usr/bin/hdiutil", ["detach", mount], { timeout: 3e4 }).catch(async () => {
				try {
					await execute("/usr/bin/hdiutil", [
						"detach",
						"-force",
						mount
					], { timeout: 3e4 });
				} catch (error) {
					if (attached) throw error;
				}
			});
		}
	}
	/** Validate that the prepared bundle and target directory are ready before shutting down the app. */
	async stage() {
		const prepared = this.prepared;
		if (!prepared) throw new Error("No prepared Next update");
		if (this.options.platform === "win32") return;
		if (this.nativeReady) return;
		if (!prepared.bundle || !prepared.installed || !prepared.directory) throw new Error("No prepared Next update");
		const stat = await lstat(prepared.bundle);
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Prepared Next application bundle is unavailable");
		await access(dirname(prepared.installed), constants.W_OK);
		await access(prepared.installed, constants.W_OK);
		this.nativeReady = true;
	}
	/** Called after the Host and windows have finished shutting down. */
	async launch() {
		if (this.options.platform === "darwin") {
			const prepared = this.prepared;
			if (!this.nativeReady || !prepared?.bundle || !prepared.installed || !prepared.directory) throw new Error("No prepared update installer");
			const message = (this.options.language?.() ?? "en").toLowerCase().startsWith("zh") ? `正在更新 DSH NEXT 至 ${prepared.version}，请稍候…` : `Updating DSH NEXT to ${prepared.version}, please wait…`;
			await new Promise((resolve, reject) => {
				const child = spawn("/bin/sh", ["-c", MAC_UPDATE_SCRIPT], {
					detached: true,
					stdio: "ignore",
					shell: false,
					cwd: "/",
					env: {
						...process.env,
						DSH_UPDATE_PID: String(process.pid),
						DSH_UPDATE_STAGED: prepared.bundle,
						DSH_UPDATE_INSTALLED: prepared.installed,
						DSH_UPDATE_DIR: prepared.directory,
						DSH_UPDATE_TITLE: "DSH NEXT",
						DSH_UPDATE_MESSAGE: message,
						DSH_UPDATE_UI_SCRIPT: MAC_PROGRESS_UI_SCRIPT
					}
				});
				child.once("error", reject);
				child.once("spawn", () => {
					child.off("error", reject);
					child.on("error", this.options.log);
					child.unref();
					resolve();
				});
			});
			return;
		}
		if (this.options.platform !== "win32" || !this.prepared) throw new Error("No prepared update installer");
		await new Promise((resolve, reject) => {
			const child = spawn(this.prepared.path, ["--updated", "--force-run"], {
				detached: true,
				stdio: "ignore",
				shell: false,
				windowsHide: false
			});
			child.once("error", reject);
			child.once("spawn", () => {
				child.off("error", reject);
				child.on("error", this.options.log);
				child.unref();
				resolve();
			});
		});
	}
};
//#endregion
//#region ../dsh-plugin-desktop/src/shutdown.ts
/** Application-level quit sources that must remain active before any window mounts. */
/** Maximum grace allowed for the Cordis tree to dispose before native exit. */
const DESKTOP_SHUTDOWN_TIMEOUT_MS = 5e3;
//#endregion
//#region src/renderer-recovery.ts
const RETRY_DELAYS_MS = [
	0,
	1e3,
	3e3
];
const HEALTH_TIMEOUT_MS = 3e4;
const STABLE_PERIOD_MS = 6e4;
var NextRendererRecovery = class {
	options;
	phase = "idle";
	attempts = 0;
	documentLoaded = false;
	clientHealthy = false;
	timer;
	stableTimer;
	navigation = 0;
	bootExpected = false;
	constructor(options) {
		this.options = options;
	}
	/** Invalidate both page readiness and pending completions from an older navigation. */
	navigating() {
		if (!this.available()) return;
		this.navigation++;
		this.documentLoaded = false;
		this.clientHealthy = false;
		this.bootExpected = false;
		this.clearStableTimer();
	}
	/** Start the readiness deadline only after the Host has supplied this document's boot data. */
	booted() {
		if (this.bootExpected) return;
		this.bootExpected = true;
		this.waitForHealth();
	}
	loaded() {
		if (!this.available()) return;
		this.documentLoaded = true;
		this.acceptHealth();
	}
	report(_status) {
		if (!this.available()) return;
		this.clientHealthy = true;
		this.acceptHealth();
	}
	fail(detail) {
		if (!this.available() || this.phase === "scheduled") return;
		this.clearTimer();
		this.clearStableTimer();
		this.clientHealthy = false;
		const delay = RETRY_DELAYS_MS[this.attempts];
		if (delay === void 0) {
			this.phase = "exhausted";
			this.options.record("renderer.recovery.exhausted", {
				attempt: this.attempts,
				detail
			});
			this.options.exhausted(detail);
			return;
		}
		this.phase = "scheduled";
		this.options.record("renderer.recovery.scheduled", {
			attempt: this.attempts + 1,
			delayMs: delay,
			detail
		});
		this.timer = setTimeout(() => {
			this.timer = void 0;
			if (!this.available()) return;
			this.phase = "waiting";
			this.documentLoaded = false;
			this.attempts++;
			this.options.record("renderer.recovery.reload", { attempt: this.attempts });
			this.armDeadline();
			const loading = this.options.reload();
			const navigation = this.navigation;
			loading.catch((error) => {
				if (navigation === this.navigation) this.fail(error instanceof Error ? error.message : String(error));
			});
		}, delay);
		this.timer.unref();
	}
	stop() {
		this.phase = "stopped";
		this.navigation++;
		this.clearTimer();
		this.clearStableTimer();
	}
	available() {
		return this.phase !== "stopped" && this.phase !== "exhausted" && this.options.available();
	}
	waitForHealth() {
		if (!this.available() || this.phase === "scheduled" || this.phase === "waiting") return;
		this.phase = "waiting";
		this.armDeadline();
	}
	armDeadline() {
		this.clearTimer();
		this.timer = setTimeout(() => {
			this.timer = void 0;
			this.fail("Renderer recovery timed out waiting for page load and UI mount");
		}, HEALTH_TIMEOUT_MS);
		this.timer.unref();
	}
	acceptHealth() {
		if (!this.documentLoaded || !this.clientHealthy || this.phase === "scheduled") return;
		if (this.phase === "idle" && this.stableTimer !== void 0) return;
		this.clearTimer();
		this.phase = "idle";
		this.options.record("renderer.recovery.healthy", { attempt: this.attempts });
		this.clearStableTimer();
		this.stableTimer = setTimeout(() => {
			this.stableTimer = void 0;
			if (this.available()) this.attempts = 0;
		}, STABLE_PERIOD_MS);
		this.stableTimer.unref();
	}
	clearTimer() {
		clearTimeout(this.timer);
		this.timer = void 0;
	}
	clearStableTimer() {
		clearTimeout(this.stableTimer);
		this.stableTimer = void 0;
	}
};
function isDesktopRendererStatus(value) {
	return value === "healthy";
}
//#endregion
//#region src/windows-elevation.ts
/**
* Windows administrator detection and the de-elevated restart that precedes every child process.
*
* Chromium's sandbox broker cannot always create its children from an elevated token: on those machines
* the GPU process fails to launch nine times and Chromium ends the browser process (#1487,
* electron/electron#49167). Chrome restarts itself de-elevated before launching any child. This module
* follows Chromium's `base::win::RunDeElevated`: the desktop shell's process token is the same user's
* normal token, so a process created with it runs without administrator rights.
*/
/** Keeps an intentionally elevated launch elevated. */
const KEEP_ELEVATED_ARGUMENT = "--next-keep-elevated";
/** Win32 call failure with its exact error code. */
var Win32CallError = class extends Error {
	api;
	code;
	constructor(api, code) {
		super(`${api} failed (Win32 ${code})`);
		this.api = api;
		this.code = code;
		this.name = "Win32CallError";
	}
};
const TOKEN_QUERY = 8;
const PROCESS_QUERY_LIMITED_INFORMATION = 4096;
const TOKEN_USER_CLASS = 1;
const TOKEN_ELEVATION_TYPE_CLASS = 18;
const TOKEN_ELEVATION_CLASS = 20;
const SECURITY_IMPERSONATION = 2;
const TOKEN_PRIMARY = 1;
const SE_PRIVILEGE_ENABLED = 2;
/** TOKEN_USER plus the SID it points to: at most 16 + 68 bytes on 64-bit Windows. */
const TOKEN_USER_BYTES = 256;
/**
* Win32 types and functions this module binds, by library.
* @param koffi - loaded Koffi module.
* @returns anonymous struct layouts and `[result, parameters]` per function, all `__stdcall`.
*/
function win32Signatures(koffi) {
	const HANDLE = koffi.pointer("void");
	const LUID = koffi.struct({
		LowPart: "uint32",
		HighPart: "int32"
	});
	const TOKEN_PRIVILEGES = koffi.struct({
		PrivilegeCount: "uint32",
		Luid: LUID,
		Attributes: "uint32"
	});
	const STARTUPINFOW = koffi.struct({
		cb: "uint32",
		lpReserved: "str16",
		lpDesktop: "str16",
		lpTitle: "str16",
		dwX: "uint32",
		dwY: "uint32",
		dwXSize: "uint32",
		dwYSize: "uint32",
		dwXCountChars: "uint32",
		dwYCountChars: "uint32",
		dwFillAttribute: "uint32",
		dwFlags: "uint32",
		wShowWindow: "uint16",
		cbReserved2: "uint16",
		lpReserved2: koffi.pointer("uint8"),
		hStdInput: HANDLE,
		hStdOutput: HANDLE,
		hStdError: HANDLE
	});
	const PROCESS_INFORMATION = koffi.struct({
		hProcess: HANDLE,
		hThread: HANDLE,
		dwProcessId: "uint32",
		dwThreadId: "uint32"
	});
	const handleOut = koffi.out(koffi.pointer(HANDLE));
	const uint32Out = koffi.out(koffi.pointer("uint32"));
	return {
		types: {
			LUID,
			TOKEN_PRIVILEGES,
			STARTUPINFOW,
			PROCESS_INFORMATION
		},
		libraries: {
			"kernel32.dll": {
				GetCurrentProcess: [HANDLE, []],
				OpenProcess: [HANDLE, [
					"uint32",
					"int",
					"uint32"
				]],
				CloseHandle: ["int", [HANDLE]],
				GetLastError: ["uint32", []]
			},
			"advapi32.dll": {
				OpenProcessToken: ["int", [
					HANDLE,
					"uint32",
					handleOut
				]],
				GetTokenInformation: ["int", [
					HANDLE,
					"int",
					HANDLE,
					"uint32",
					uint32Out
				]],
				DuplicateTokenEx: ["int", [
					HANDLE,
					"uint32",
					HANDLE,
					"int",
					"int",
					handleOut
				]],
				LookupPrivilegeValueW: ["int", [
					"str16",
					"str16",
					koffi.out(koffi.pointer(LUID))
				]],
				AdjustTokenPrivileges: ["int", [
					HANDLE,
					"int",
					koffi.pointer(TOKEN_PRIVILEGES),
					"uint32",
					HANDLE,
					HANDLE
				]],
				EqualSid: ["int", [HANDLE, HANDLE]],
				CreateProcessWithTokenW: ["int", [
					HANDLE,
					"uint32",
					"str16",
					"str16",
					"uint32",
					HANDLE,
					"str16",
					koffi.pointer(STARTUPINFOW),
					koffi.out(koffi.pointer(PROCESS_INFORMATION))
				]]
			},
			"user32.dll": {
				GetShellWindow: [HANDLE, []],
				GetWindowThreadProcessId: ["uint32", [HANDLE, uint32Out]],
				AllowSetForegroundWindow: ["int", ["uint32"]]
			}
		}
	};
}
let cached;
/** Load Koffi and bind the Win32 functions on first use, which happens only on Windows. */
function win32$1() {
	if (cached) return cached;
	const koffi = createRequire(import.meta.url)("koffi");
	const signatures = win32Signatures(koffi);
	const api = {};
	for (const [library, functions] of Object.entries(signatures.libraries)) {
		const loaded = koffi.load(library);
		for (const [name, [result, parameters]] of Object.entries(functions)) api[name] = loaded.func("__stdcall", name, result, [...parameters]);
	}
	return cached = {
		koffi,
		startupInfoBytes: koffi.sizeof(signatures.types.STARTUPINFOW),
		api
	};
}
function lastError({ api }, name) {
	return new Win32CallError(name, api.GetLastError());
}
function openToken(win, process, access) {
	const token = [null];
	if (!win.api.OpenProcessToken(process, access, token) || token[0] === null) throw lastError(win, "OpenProcessToken");
	return token[0];
}
function tokenUint32(win, token, informationClass) {
	const information = Buffer.alloc(4);
	if (!win.api.GetTokenInformation(token, informationClass, information, information.length, [0])) throw lastError(win, "GetTokenInformation");
	return information.readUInt32LE(0);
}
function tokenElevation(win, token) {
	const type = tokenUint32(win, token, TOKEN_ELEVATION_TYPE_CLASS);
	return {
		elevated: tokenUint32(win, token, TOKEN_ELEVATION_CLASS) !== 0,
		type: type === 2 ? "full" : type === 3 ? "limited" : "default"
	};
}
/** Whether two tokens belong to one user. TOKEN_USER points into its own buffer, so both live in native memory. */
function sameUser(win, first, second) {
	const buffers = [];
	try {
		const sids = [first, second].map((token) => {
			const information = win.koffi.alloc("uint8", TOKEN_USER_BYTES);
			buffers.push(information);
			if (!win.api.GetTokenInformation(token, TOKEN_USER_CLASS, information, TOKEN_USER_BYTES, [0])) throw lastError(win, "GetTokenInformation");
			const sid = win.koffi.decode(information, "void *");
			if (sid === null) throw new Win32CallError("GetTokenInformation", 0);
			return sid;
		});
		return win.api.EqualSid(sids[0], sids[1]) !== 0;
	} finally {
		for (const buffer of buffers) win.koffi.free(buffer);
	}
}
/** Best effort, as in Chromium: elevated administrators normally hold the privilege enabled already. */
function enableImpersonatePrivilege(win, token) {
	const luid = {};
	if (!win.api.LookupPrivilegeValueW(null, "SeImpersonatePrivilege", luid)) return;
	win.api.AdjustTokenPrivileges(token, 0, {
		PrivilegeCount: 1,
		Luid: luid,
		Attributes: SE_PRIVILEGE_ENABLED
	}, 0, null, null);
}
/**
* Read this process's token elevation.
* @returns elevation of the current process token.
* @throws when Koffi cannot load or the token cannot be queried.
*/
function windowsElevation() {
	const win = win32$1();
	const token = openToken(win, win.api.GetCurrentProcess(), TOKEN_QUERY);
	try {
		return tokenElevation(win, token);
	} finally {
		win.api.CloseHandle(token);
	}
}
/**
* Start a program as the same user without administrator rights, with the desktop shell's token
* (Chromium's `base::win::RunDeElevated`). The new process inherits this process's working directory
* and receives a fresh environment from the user's profile, as a process the shell started would.
* @param file - program path.
* @param commandLine - complete command line, the quoted program first.
* @returns the new process id, or why the shell offers no normal token of this user.
* @throws Win32CallError when a Win32 step fails, e.g. ERROR_ELEVATION_REQUIRED when Windows forces elevation.
*/
function launchWithShellToken(file, commandLine) {
	const win = win32$1();
	const { api } = win;
	const window = api.GetShellWindow();
	const shellPid = [0];
	if (window === null || !api.GetWindowThreadProcessId(window, shellPid) || !shellPid[0]) return {
		launched: false,
		reason: "no-shell"
	};
	const shellProcess = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, shellPid[0]);
	if (shellProcess === null) throw lastError(win, "OpenProcess");
	const handles = [shellProcess];
	try {
		const shellToken = openToken(win, shellProcess, 10);
		handles.push(shellToken);
		if (tokenElevation(win, shellToken).elevated) return {
			launched: false,
			reason: "shell-elevated"
		};
		const ownToken = openToken(win, api.GetCurrentProcess(), 40);
		handles.push(ownToken);
		if (!sameUser(win, ownToken, shellToken)) return {
			launched: false,
			reason: "shell-other-user"
		};
		enableImpersonatePrivilege(win, ownToken);
		const primary = [null];
		if (!api.DuplicateTokenEx(shellToken, 395, null, SECURITY_IMPERSONATION, TOKEN_PRIMARY, primary) || primary[0] === null) throw lastError(win, "DuplicateTokenEx");
		handles.push(primary[0]);
		const started = {};
		if (!api.CreateProcessWithTokenW(primary[0], 0, file, commandLine, 0, null, null, { cb: win.startupInfoBytes }, started)) throw lastError(win, "CreateProcessWithTokenW");
		for (const handle of [started.hProcess, started.hThread]) if (handle) handles.push(handle);
		const pid = started.dwProcessId ?? 0;
		api.AllowSetForegroundWindow(pid);
		return {
			launched: true,
			pid
		};
	} finally {
		for (const handle of handles.reverse()) api.CloseHandle(handle);
	}
}
/**
* Quote one argument for `CommandLineToArgvW`, which Chromium and the C runtime both follow.
* @param value - raw argument.
* @returns the argument unchanged when it needs no quoting, otherwise quoted with its quotes and trailing backslashes escaped.
*/
function quoteWindowsArgument(value) {
	if (value !== "" && !/[\s"]/u.test(value)) return value;
	let quoted = "\"";
	let backslashes = 0;
	for (const character of value) {
		if (character === "\\") {
			backslashes++;
			continue;
		}
		quoted += "\\".repeat(character === "\"" ? backslashes * 2 + 1 : backslashes) + character;
		backslashes = 0;
	}
	return `${quoted}${"\\".repeat(backslashes * 2)}"`;
}
const AUTOMATION_ARGUMENT = /^--(?:remote-debugging-(?:port|pipe)|enable-automation)(?:=|$)/u;
/**
* Restart a packaged Windows launch that holds the elevated half of a split token with the user's normal token,
* before this process starts any child. A failed restart continues the launch elevated.
* @param options - process facts and, in tests, Win32 replacements.
* @returns `relaunched` when the caller must exit now, otherwise what to record about this process.
*/
function deElevateAtStartup(options) {
	if (options.platform !== "win32") return {
		relaunched: false,
		state: {}
	};
	let elevation;
	try {
		elevation = (options.elevation ?? windowsElevation)();
	} catch (error) {
		return {
			relaunched: false,
			state: { error: String(error) }
		};
	}
	if (elevation.type !== "full") return {
		relaunched: false,
		state: { elevation }
	};
	const args = options.argv.slice(1);
	const kept = !options.packaged ? "development" : args.includes("--next-keep-elevated") ? "requested" : args.includes("--next-de-elevated") ? "restarted" : isDesktopInstallerQuitRequest(args, options.platform) ? "installer" : args.some((argument) => AUTOMATION_ARGUMENT.test(argument)) ? "automation" : void 0;
	if (kept) return {
		relaunched: false,
		state: {
			elevation,
			kept
		}
	};
	try {
		const commandLine = [
			options.executable,
			...args,
			DE_ELEVATED_ARGUMENT
		].map(quoteWindowsArgument).join(" ");
		const result = (options.launch ?? launchWithShellToken)(options.executable, commandLine);
		return result.launched ? { relaunched: true } : {
			relaunched: false,
			state: {
				elevation,
				kept: result.reason
			}
		};
	} catch (error) {
		return {
			relaunched: false,
			state: {
				elevation,
				error: String(error),
				...error instanceof Win32CallError ? { win32Code: error.code } : {}
			}
		};
	}
}
/** Startup outcomes in which a restart without administrator rights was attempted and the launch stayed elevated. */
const RESTART_FAILURES = /* @__PURE__ */ new Set([
	"no-shell",
	"shell-elevated",
	"shell-other-user",
	"restarted"
]);
/**
* Recognize a failed GPU process launch in Electron's `child-process-gone` details.
* @param platform - Node platform.
* @param details - Electron child process details.
* @returns the failure on Windows, where it ends in Chromium's fatal exit.
*/
function gpuLaunchFailure(platform, details) {
	return platform === "win32" && details.type === "GPU" && details.reason === "launch-failed" ? {
		process: "gpu",
		code: details.exitCode
	} : void 0;
}
/**
* Recognize a failed renderer launch in Electron's `render-process-gone` details.
* @param platform - Node platform.
* @param details - Electron render process details.
* @returns the failure on Windows, where the window it belongs to can never paint.
*/
function rendererLaunchFailure(platform, details) {
	return platform === "win32" && details.reason === "launch-failed" ? {
		process: "renderer",
		code: details.exitCode
	} : void 0;
}
/**
* Write the explanation: the likely cause for this elevation state, the error code, and the temporary
* `--no-sandbox` workaround with its security cost.
* @param context - failure, elevation and launch facts.
* @returns message box text in the requested language.
*/
function sandboxLaunchDialog(context) {
	const zh = context.language === "zh";
	const t = (chinese, english) => zh ? chinese : english;
	const program = win32.basename(context.executable);
	const { elevation, startup, failure } = context;
	const keptByArgument = context.argv.includes(KEEP_ELEVATED_ARGUMENT);
	const cause = [];
	if (elevation?.elevated && elevation.type === "full") {
		cause.push(t("DSH NEXT 当前以管理员身份运行。以管理员身份运行时，Chromium 沙箱在部分 Windows 环境下无法创建子进程。", "DSH NEXT is running as administrator. On some Windows systems the Chromium sandbox cannot create child processes from an administrator process."));
		if (keptByArgument) cause.push(t(`启动参数中有 ${KEEP_ELEVATED_ARGUMENT}，因此没有自动以普通权限重新启动。`, `The ${KEEP_ELEVATED_ARGUMENT} argument turned off the automatic restart without administrator rights.`));
		else if (startup.win32Code === 740) cause.push(t("Windows 拒绝了以普通权限自动重新启动（错误 740）：这个程序被设置为始终以管理员身份运行。", "Windows refused the automatic restart without administrator rights (error 740): this program is set to always run as administrator."));
		else if (startup.elevation?.type === "full" && (startup.error !== void 0 || RESTART_FAILURES.has(startup.kept ?? ""))) cause.push(t("以普通权限自动重新启动没有成功。", "The automatic restart without administrator rights did not succeed."));
		cause.push(t("请以普通权限启动：", "Start it without administrator rights:"), t(`• 右键 ${program} 或它的快捷方式 →「属性」→「兼容性」，取消勾选「以管理员身份运行此程序」；如果用过「更改所有用户的设置」，那里也要取消。`, `• Right-click ${program} or its shortcut → Properties → Compatibility, and clear “Run this program as an administrator”. If you used “Change settings for all users”, clear it there too.`), t("• 快捷方式「属性」→「快捷方式」→「高级」，取消勾选「用管理员身份运行」。", "• In the shortcut’s Properties → Shortcut → Advanced, clear “Run as administrator”."), t("• 不要从管理员终端，或设置了「使用最高权限运行」的计划任务启动。", "• Do not start it from an administrator terminal or from a scheduled task set to “Run with highest privileges”."));
		if (keptByArgument) cause.push(t(`• 去掉启动参数 ${KEEP_ELEVATED_ARGUMENT}。`, `• Remove the ${KEEP_ELEVATED_ARGUMENT} argument.`));
	} else if (elevation?.elevated) cause.push(t("DSH NEXT 当前带管理员权限运行：这个账户启动的所有程序都带管理员权限（UAC 已关闭，或正在使用内置 Administrator 账户），因此无法自动以普通权限重新启动。以管理员身份运行时，Chromium 沙箱在部分 Windows 环境下无法创建子进程。请开启 UAC，或用普通账户登录后再启动。", "DSH NEXT is running with administrator rights because every program this account starts has them (UAC is off, or this is the built-in Administrator account), so it cannot restart itself without them. On some Windows systems the Chromium sandbox cannot create child processes from an administrator process. Turn UAC on, or sign in with a standard account, and start it again."));
	else if (elevation) cause.push(t("DSH NEXT 没有以管理员身份运行。其他已知原因：AppLocker 或软件限制策略、安全软件拦截、程序位于网络共享或重定向的文件夹中。", "DSH NEXT is not running as administrator. Other known causes are AppLocker or Software Restriction Policies, security software blocking the launch, and a program folder on a network share or in a redirected folder."));
	else cause.push(t("无法确认 DSH NEXT 是否以管理员身份运行。已知原因：以管理员身份运行（包括兼容性设置里的「以管理员身份运行此程序」）、AppLocker 或软件限制策略、安全软件拦截、程序位于网络共享或重定向的文件夹中。", "Could not check whether DSH NEXT runs as administrator. Known causes are running as administrator (including the compatibility setting “Run this program as an administrator”), AppLocker or Software Restriction Policies, security software blocking the launch, and a program folder on a network share or in a redirected folder."));
	const code = failure.code === 18 ? t(`错误码：${failure.code}（SBOX_ERROR_CREATE_PROCESS，Windows 拒绝创建沙箱进程）`, `Error code: ${failure.code} (SBOX_ERROR_CREATE_PROCESS: Windows refused to create the sandboxed process)`) : t(`错误码：${failure.code}（Chromium 沙箱启动结果）`, `Error code: ${failure.code} (Chromium sandbox launch result)`);
	const workaround = t("临时绕过：在快捷方式「目标」末尾加上 --no-sandbox 后启动。代价：这会关闭 Chromium 对所有页面的沙箱隔离，包括侧边栏浏览器打开的网页，任何网页里的漏洞都可以直接以你的身份读写文件、运行程序。只在排查期间使用，问题解决后请去掉。", "Temporary workaround: add --no-sandbox to the end of the shortcut’s Target and start again. This turns off the Chromium sandbox for every page, including web pages opened in the sidebar browser, so a flaw in any page can read and write your files and run programs as you. Use it only while troubleshooting and remove it afterwards.");
	return {
		title: t("DSH NEXT 无法启动", "DSH NEXT cannot start"),
		message: failure.process === "gpu" ? t("Chromium 沙箱未能启动 GPU 进程，DSH NEXT 无法显示窗口，即将退出。", "The Chromium sandbox could not start the GPU process, so DSH NEXT cannot show a window and will quit.") : t("Chromium 沙箱未能启动渲染进程，DSH NEXT 无法显示窗口，即将退出。", "The Chromium sandbox could not start the renderer process, so DSH NEXT cannot show a window and will quit."),
		detail: [
			cause.join("\n"),
			t(`程序位置：${context.executable}`, `Program: ${context.executable}`),
			code,
			workaround
		].join("\n\n"),
		button: t("退出", "Quit")
	};
}
/**
* Explain the first sandbox launch failure of this process, then exit. The message box blocks the UI thread,
* so Chromium cannot reach its fatal exit while the user reads it.
* @param options - Electron and Desktop operations.
* @returns report function; later failures are ignored.
*/
function createSandboxLaunchReporter(options) {
	let reported = false;
	return (failure) => {
		if (reported) return;
		reported = true;
		let elevation;
		try {
			elevation = options.elevation();
		} catch {
			elevation = void 0;
		}
		options.record(failure, elevation);
		try {
			options.show(sandboxLaunchDialog({
				failure,
				elevation,
				...options.context()
			}));
		} finally {
			options.exit();
		}
	};
}
//#endregion
//#region src/main.ts
/** Official Desktop transport with a Host-independent native shell. */
const startupElevation = deElevateAtStartup({
	platform: process.platform,
	packaged: app.isPackaged,
	argv: process.argv,
	executable: process.execPath
});
if (startupElevation.relaunched) app.exit(0);
const startupElevationState = startupElevation.relaunched ? {} : startupElevation.state;
applyDesktopPackageManagerPolicy(process.env);
const root = dirname(NEXT_PACKAGE);
const environmentHome = process.env["DSH_DESKTOP_NEXT_HOME"] || void 0;
const locationRoot = dataDirectoryLocationRoot(app.isPackaged, () => app.getPath("appData"), root);
const locationFile = dataDirectoryLocationFile(locationRoot);
const dataLocation = readDataDirectory(locationRoot, environmentHome);
const home = dataLocation.home;
let dataSource = dataLocation.source;
const normalElectronData = join(home, "electron-user-data");
privateDirectory(normalElectronData);
app.setName("DSH NEXT");
app.setPath("userData", normalElectronData);
const ownsInstance = !startupElevation.relaunched && claimDesktopSingleInstance(app, openMain);
const safeModeRequested = process.argv.includes(SAFE_ARGUMENT);
const safeElectronData = join(normalElectronData, "safe-mode");
if (ownsInstance) if (safeModeRequested) {
	cleanupDisposableTree(safeElectronData);
	privateDirectory(safeElectronData);
} else try {
	cleanupDisposableTree(safeElectronData);
} catch (error) {
	console.error("Next Safe Mode state cleanup failed", error);
}
const electronData = ownsInstance && safeModeRequested ? safeElectronData : normalElectronData;
const nativeLocale = new NativeLocaleStore(safeModeRequested ? electronData : home);
app.setPath("userData", electronData);
app.setPath("sessionData", electronData);
protocol.registerSchemesAsPrivileged([{
	scheme: "dsh-app",
	privileges: {
		standard: true,
		secure: true,
		supportFetchAPI: true,
		corsEnabled: true,
		stream: true
	}
}]);
let mainWindow;
let rendererRecovery;
let rendererDocumentId = "";
let desktopShortcuts;
const browserGuests = new DesktopBrowserGuests(() => runtime.auth ? [new URL(runtime.auth.url).origin] : []);
let shellWindow;
let recoveryRunner;
let replacingWindow = false;
let diagnosticsFile;
let recoveryNotice;
let recoveryStopping;
let recoveryRequest;
let pendingSettings;
let quitting = false;
let onboarding = false;
let onboardingSurfaceActive = false;
let onboardingComputerUse = false;
let relaunch;
let installingUpdate = false;
/** A later launch must not open a window on the data directory the startup prompt may reject. */
let confirmingDataDirectory = false;
let systemProxy = {};
let hostEnvironmentReady;
let windowsLanguage = "en";
const webRoot = dirname(createRequire(NEXT_PACKAGE).resolve("@deepseek-ai/dsh-web-frontend/dist/index.html"));
const version = JSON.parse(readFileSync(NEXT_PACKAGE, "utf8")).version;
/** The dsh runtime beside this shell; a development tree may hoist it elsewhere, and the packaged check then reports it. */
let dshVersion;
try {
	dshVersion = readInstalledPackageVersion(root, "@deepseek-ai/dsh");
} catch {}
const t = (zh, en) => windowsLanguage.toLowerCase().startsWith("zh") ? zh : en;
const runtime = new NextDesktopRuntime({
	home,
	root,
	primaryRuntime: join(app.isPackaged ? join(process.resourcesPath, "runtime") : join(root, ".desktop-build", "runtime"), process.arch, "primary-runtime"),
	executable: process.execPath,
	addresses: () => [...desktopLanAddresses()],
	systemProxy: () => systemProxy,
	prepareEnvironment: () => prepareHostEnvironment(),
	...safeModeRequested ? { stateHome: electronData } : {},
	certificate: async (addresses) => {
		try {
			return await createLanHttpsCertificate(electronData, addresses, {
				available: () => safeStorage.isEncryptionAvailable() && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
				seal: (bytes) => safeStorage.encryptString(Buffer.from(bytes).toString("utf8")),
				open: (bytes) => Buffer.from(safeStorage.decryptString(Buffer.from(bytes)), "utf8")
			});
		} catch (error) {
			runtime.diagnostics.append(lanHttpsCertificateDiagnostic(error), "warn");
			throw error;
		}
	},
	onFailure: () => {
		if (app.isReady()) openControls("recovery");
	},
	onChange: () => {
		if (!app.isReady()) return;
		if (runtime.backend.state.phase === "ready") rendererRecovery?.booted();
		native.refresh();
	},
	onRestart: () => run({ type: "restart" }),
	onTerminal: () => run({ type: "terminal" }),
	onNotification: (notification) => native.notify(notification),
	onPlatformLogin: (request) => {
		if (quitting || !app.isReady()) return;
		if (request.action === "close") {
			platformLogin.close();
			if (request.focus) openMain();
			return;
		}
		const url = platformLoginUrl(request.url);
		if (runtime.state().browserUrl !== null) shell.openExternal(url).catch((error) => runtime.diagnostics.append(String(error), "warn"));
		else platformLogin.open(url);
	},
	onPermission: async (action, permission) => {
		if (quitting) throw new Error("Desktop is shutting down");
		const snapshot = permissions.query(permission);
		if (action === "open-settings" || action === "request" && snapshot.status !== "granted") openSettings("permissions");
		return snapshot;
	}
});
const platformLogin = new PlatformLoginWindow({
	BrowserWindow,
	session: (partition) => session.fromPartition(partition),
	host: () => runtime.auth,
	parent: () => mainWindow,
	title: () => t("登录 DeepSeek", "Sign in to DeepSeek"),
	dark: () => nativeTheme.shouldUseDarkColors,
	warn: (error) => runtime.diagnostics.append(String(error), "warn")
});
const native = new NativeDesktop({
	root,
	language: () => windowsLanguage,
	state,
	window: () => mainWindow,
	show: openMain,
	run,
	warn: (error) => runtime.diagnostics.append(String(error), "warn")
});
const permissions = createNativePermissions();
const updateInstaller = new NextUpdateInstaller({
	platform: process.platform,
	executable: process.execPath,
	language: () => windowsLanguage,
	log: (error) => runtime.diagnostics.append(String(error), "warn")
});
const updates = new NextUpdates({
	version,
	platform: process.platform,
	packaged: app.isPackaged,
	userData: electronData,
	request: (url, init) => net.fetch(url, {
		...init,
		credentials: "omit"
	}),
	artifactRequest: createArtifactRequest(),
	changed: () => {
		if (app.isReady() && !quitting) native.refresh();
	},
	available: (nextVersion) => {
		if (app.isReady() && !quitting) native.notifyUpdate(nextVersion, () => {
			promptAvailableUpdate().catch((error) => runtime.diagnostics.append(String(error), "warn"));
		});
	},
	log: (error) => runtime.diagnostics.append(String(error), "warn"),
	prepare: (path, nextVersion, directory, signal) => updateInstaller.prepare(path, nextVersion, directory, signal),
	install: async () => {
		runtime.busy = true;
		native.refresh();
		try {
			await updateInstaller.stage();
			if (!quitting) {
				installingUpdate = true;
				app.quit();
			}
		} finally {
			runtime.busy = false;
			if (!quitting) native.refresh();
		}
	}
});
function state() {
	const usingDefaultDirectory = dataSource !== "desktop" && !dataLocation.error;
	let recovery;
	try {
		recovery = {
			bundles: [],
			checkpoints: runtime.recovery.checkpoints(runtime.selected),
			profileDirectory: runtime.profiles.directory(runtime.selected),
			usingDefaultDirectory,
			diagnosticsFile,
			notice: recoveryNotice
		};
		try {
			recovery.bundles = runtime.recovery.bundles(runtime.selected);
		} catch (error) {
			recovery.error = String(error);
		}
	} catch (error) {
		recovery = {
			bundles: [],
			checkpoints: [],
			profileDirectory: join(home, "profiles", runtime.selected),
			usingDefaultDirectory,
			error: String(error),
			diagnosticsFile,
			notice: recoveryNotice
		};
	}
	return {
		...runtime.state(),
		recovery,
		dataDirectory: {
			source: dataSource,
			environmentHome: environmentHome === void 0 ? null : resolve(environmentHome)
		},
		onboarding,
		...onboarding ? { onboardingComputerUse } : {},
		platform: process.platform,
		version,
		...["darwin", "win32"].includes(process.platform) ? { updates: updates.snapshot() } : {},
		trayAvailable: native.available,
		notificationsAvailable: Notification.isSupported()
	};
}
function run(value) {
	command(value, "native").catch((error) => runtime.report(error));
}
function assertSender(event, owner, origin) {
	if (!owner || owner.isDestroyed() || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame || !event.senderFrame.url.startsWith(origin)) throw new Error("Rejected Next IPC sender");
}
function assertDesktopSender(event) {
	if (event.sender === mainWindow?.webContents) assertSender(event, mainWindow, APP_URL);
	else assertSender(event, shellWindow, "dsh-app://shell/");
}
/**
* Carry the effective palette into the Platform login page, as upstream Desktop does.
* `system` resolves through `nativeTheme.shouldUseDarkColors`, which follows the theme
* source preload-theme.ts publishes.
* @param authorizeUrl - authorization URL already validated by host-process.ts.
* @returns the URL carrying `theme=light` or `theme=dark`.
*/
function platformLoginUrl(authorizeUrl) {
	const url = new URL(authorizeUrl);
	url.searchParams.set("theme", nativeTheme.shouldUseDarkColors ? "dark" : "light");
	return url.href;
}
function show(window) {
	if (quitting || window.isDestroyed()) return;
	if (window.isMinimized()) window.restore();
	window.show();
	window.focus();
}
/**
* Windows caption buttons never paint a fill of their own. Upstream fills them with the sidebar
* color, which matches only the official caption band: full-window surfaces such as the official
* onboarding and Platform sign-in pages paint that strip in the base background, leaving the
* buttons a different shade. Transparent buttons show whatever the page paints beneath them, and
* Electron derives their hover and press tint from the native theme rather than from this fill.
*/
const WINDOWS_CAPTION_FILL = "#00000000";
// ------------------------------------------------------------ mls boot overlay
const MLS_BOOT_HTML = "<!doctype html><html><head><meta charset=\"utf-8\"><style>@font-face{font-family:\"Maratype\";src:url(data:font/otf;base64,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/Fv8TfxMAAAAAAAA3pQAAQAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFgAaAAAAAAADAAQABQAGAAcAngCfAKAAoQCiAKMApAClAAABAAQCAAEBAQlNYXJhdHlwZQABAQE++HEA+HIC+HID+BgE+wUMA7gMBBwAABz/0xwCOhwD6AUeoAERER+Lix6gARERH4uLDAf6EQ/6VBGmHAl/EgBYAgABAAgADwAWAB0AJAArADIAOQBAAEcATgBVAFwAYwBqAHEAeAB/AIYAjQCUAJsAogCpALAAtwC+AMUAzADTANoA4QDoAO8A9gD9AQQBCwESARkBIAEnAS4BNQE8AUMBSgFRAVgBXwFmAW0BdAF7AYIBiQGQAZcBngGlAawBswG6AcEByAHPAdYB3QHiAecB7AHxAfYB+wIAAgUCDgIXAiACKQIyAjsCRAJNAlYCXwJsAnR1bmkwMDAwdW5pMDAwRHVuaTA0MDF1bmkwNDEwdW5pMDQxMXVuaTA0MTJ1bmkwNDEzdW5pMDQxNHVuaTA0MTV1bmkwNDE2dW5pMDQxN3VuaTA0MTh1bmkwNDE5dW5pMDQxQXVuaTA0MUJ1bmkwNDFDdW5pMDQxRHVuaTA0MUV1bmkwNDFGdW5pMDQyMHVuaTA0MjF1bmkwNDIydW5pMDQyM3VuaTA0MjR1bmkwNDI1dW5pMDQyNnVuaTA0Mjd1bmkwNDI4dW5pMDQyOXVuaTA0MkF1bmkwNDJCdW5pMDQyQ3VuaTA0MkR1bmkwNDJFdW5pMDQyRnVuaTA0MzB1bmkwNDMxdW5pMDQzMnVuaTA0MzN1bmkwNDM0dW5pMDQzNXVuaTA0MzZ1bmkwNDM3dW5pMDQzOHVuaTA0Mzl1bmkwNDNBdW5pMDQzQnVuaTA0M0N1bmkwNDNEdW5pMDQzRXVuaTA0M0Z1bmkwNDQwdW5pMDQ0MXVuaTA0NDJ1bmkwNDQzdW5pMDQ0NHVuaTA0NDV1bmkwNDQ2dW5pMDQ0N3VuaTA0NDh1bmkwNDQ5dW5pMDQ0QXVuaTA0NEJ1bmkwNDRDdW5pMDQ0RHVuaTA0NEV1bmkwNDRGdW5pMDQ1MUUuYWx0Ri5hbHRMLmFsdFouYWx0ZS5hbHRmLmFsdGwuYWx0ei5hbHRJb2N5ci5hbHRHZWN5ci5hbHREZWN5ci5hbHRJZWN5ci5hbHRFZmN5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) format(\"opentype\");font-weight:400;font-style:normal;font-display:block}/* =============================================================================\n * dsh-theme-mls-desktop — Boot payload: CSS\n * -----------------------------------------------------------------------------\n * Extracted from the standalone boot animation (启动动画.html), then namespaced\n * under #dshMarBootHost (ids/classes get an `mb-` prefix, keyframes get an\n * `mb-` prefix) so the injected overlay can never collide with DSH's own\n * stylesheet when the payload is dropped into the harness page.\n *\n * DESKTOP ADAPTATION\n * ------------------\n * The Desktop shell builds its main window with `transparent: true`, so this\n * overlay can show the real desktop through it. The host therefore paints **no\n * background at all**: the transparent window surface is the backdrop, and only\n * the marks the animation draws (green whale, HUI frames, blue tile) are visible\n * against it. The one opaque beat is #mb-solid-bg, which deliberately covers the\n * whole window at the end of the intro so the marathon stage takes over from a\n * flat blue field instead of from the wallpaper.\n *\n * Reveal order is fixed and matches the standalone cut's (启动动画.html) intro\n * exactly, including its timings: the green whale logo AND the caption are on\n * screen from the very first frame with no entrance animation of their own, then\n * the five HUI frames are hard-cut in one after another (2.35s .. 2.75s), all\n * five start zooming together at 2.86s, and the blue pixel tile fades in at\n * 3.06s while its zoom is already running. Nothing here may fade or scale in:\n * the standalone has no entrance animation on the logo, the caption or the HUI\n * frames, and adding one is immediately visible as \"the timing changed\".\n *\n * The final fullscreen marathon stage keeps HUD chrome hidden\n * (.mb-corner/.mb-topbar/.mb-log/.mb-bottombar/.mb-lockup/.mb-replay/.mb-scanlines/\n * .mb-vignette are display:none — DOM stays so the engine never sees null refs).\n * ========================================================================== */\n\n#dshMarBootHost {\n  --lime: #C0FE04;\n  --red:  #FF003C;\n  --bg:   #000000;\n  --mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;\n  /* Reveal schedule — single source of truth for BOTH the keyframes below and\n   * engine-intro.js, which reads these back with getComputedStyle. Retiming the\n   * intro therefore only means editing these numbers.\n   *\n   * The green whale and the caption deliberately have NO entry here: in the\n   * standalone they are plain `opacity: 1` elements with no animation at all, so\n   * they are already on screen in the first painted frame. */\n  --mb-t-hui: 2.35s;        /* first HUI frame is hard-cut in */\n  --mb-t-hui-step: .10s;    /* gap between consecutive HUI frames (standalone:\n                               2.35 / 2.45 / 2.55 / 2.65 / 2.75) */\n  --mb-t-hui-rush: 2.86s;   /* all five frames start zooming, together */\n  --mb-t-hui-dur: 2.80s;    /* HUI zoom length */\n  --mb-t-blue: 3.06s;       /* blue pixel tile fades in (its own keyframe) */\n  --mb-t-blue-rush: 2.88s;  /* ...but its zoom is already running by then */\n  --mb-t-blue-dur: 2.85s;   /* blue tile zoom to full screen */\n  position: fixed;\n  inset: 0;\n  z-index: 2147483000;\n  background: transparent;\n  overflow: hidden;\n  pointer-events: none;\n  -webkit-user-select: none;\n  user-select: none;\n  opacity: 1;\n  transition: opacity .5s ease;\n}\n/* While the overlay runs the page itself must be see-through, otherwise DSH's\n * own canvas covers the window's alpha surface and the \"transparent\" boot would\n * still read as an opaque rectangle. The attribute is set by engine-intro.js and\n * removed on every exit path. */\nhtml[data-mar-boot],\nhtml[data-mar-boot] body,\nhtml[data-mar-boot] #root {\n  background: transparent !important;\n}\n/* 2026-09-26: making html/body/#root transparent is not enough on its own.\n * DSH's own plates -- sidebar, conversation column, composer, the theme's ASCII\n * field canvas (#mar-ascii-bg) -- each paint their own background, so with only\n * the rules above the deepest thing over the window's alpha surface is still the\n * live app and the \"transparent\" boot shows the interface instead of the desktop.\n * Take the whole app out of the visible layer for the duration instead: every\n * direct child of <body> except the boot overlay itself. `visibility` (not\n * `display`) so nothing re-lays-out when the attribute comes off.\n *\n * The descendant half of the pair is not redundant: `visibility` is inherited,\n * but a single `visibility: visible` deeper in the tree (DSH ships a few, to\n * re-show a control its own stylesheet parks) punches straight through an\n * inherited `hidden`. Without it the sidebar's 工作区 label and its two action\n * buttons stayed floating over the desktop.\n *\n * Released by engine-intro.js at the moment the opaque blue plate covers the\n * window, so the app is never seen coming back. */\nhtml[data-mar-boot] body > *:not(#dshMarBootHost),\nhtml[data-mar-boot] body > *:not(#dshMarBootHost) *,\nhtml[data-mar-boot] #root {\n  visibility: hidden !important;\n}\n#dshMarBootHost *,\n#dshMarBootHost *::before,\n#dshMarBootHost *::after {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\n/* ---- main boot container (marathon stage) ---- */\n#dshMarBootHost canvas { position: fixed; inset: 0; display: block; }\n#dshMarBootHost #mb-boot {\n  position: fixed; inset: 0;\n  opacity: 0;\n  transition: opacity .3s ease;\n  z-index: 60;\n}\n\n/* ---- HUD chrome (engine still updates these; kept display:none) ---- */\n#dshMarBootHost .mb-corner { position: fixed; width: 26px; height: 26px; border: 1.5px solid rgba(192,254,4,.75); z-index: 6; }\n#dshMarBootHost .mb-corner.mb-tl { top: 18px; left: 18px;  border-right: none; border-bottom: none; }\n#dshMarBootHost .mb-corner.mb-tr { top: 18px; right: 18px; border-left: none;  border-bottom: none; }\n#dshMarBootHost .mb-corner.mb-bl { bottom: 18px; left: 18px;  border-right: none; border-top: none; }\n#dshMarBootHost .mb-corner.mb-br { bottom: 18px; right: 18px; border-left: none;  border-top: none; }\n\n#dshMarBootHost .mb-topbar {\n  position: fixed; top: 16px; left: 58px; right: 58px;\n  display: flex; justify-content: space-between; align-items: flex-start;\n  z-index: 6; color: var(--lime); pointer-events: none;\n}\n#dshMarBootHost .mb-brand { font-family: 'Maratype', var(--mono); font-size: 22px; font-weight: 700; letter-spacing: .14em; line-height: 1; }\n#dshMarBootHost .mb-brand small { display: block; margin-top: 5px; font-family: var(--mono); font-weight: 400;\n  font-size: 9px; letter-spacing: .42em; opacity: .55; }\n#dshMarBootHost .mb-readout { font-family: var(--mono); font-size: 9.5px; letter-spacing: .12em; opacity: .72;\n  text-align: right; line-height: 1.55; white-space: pre; }\n\n#dshMarBootHost .mb-log {\n  position: fixed; top: 70px; right: 24px; width: 250px;\n  font-family: var(--mono); font-size: 9.5px; letter-spacing: .08em;\n  color: rgba(192,254,4,.78); line-height: 1.65; z-index: 6;\n  text-align: right; pointer-events: none;\n}\n#dshMarBootHost .mb-log .mb-line { opacity: 0; transform: translateX(10px); animation: mb-log-in .25s ease forwards; }\n#dshMarBootHost .mb-log .mb-cursor { display: inline-block; width: 6px; height: 10px; background: var(--lime);\n  margin-left: 3px; vertical-align: -1px; animation: mb-blink 1s steps(1) infinite; }\n\n#dshMarBootHost .mb-bottombar {\n  position: fixed; bottom: 22px; left: 58px; right: 58px;\n  display: flex; align-items: center; gap: 14px; z-index: 6;\n  color: var(--lime); font-family: var(--mono); font-size: 9.5px; letter-spacing: .22em;\n  pointer-events: none;\n}\n#dshMarBootHost .mb-status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--red);\n  box-shadow: 0 0 9px var(--red); animation: mb-pulse 1.3s ease-in-out infinite; }\n#dshMarBootHost .mb-status-text { min-width: 260px; opacity: .85; }\n#dshMarBootHost .mb-progress { flex: 1; height: 2px; background: rgba(192,254,4,.12); position: relative; overflow: hidden; }\n#dshMarBootHost .mb-progress > i { position: absolute; left: 0; top: 0; height: 100%; width: 0; background: var(--lime);\n  box-shadow: 0 0 8px rgba(192,254,4,.7); }\n\n#dshMarBootHost .mb-lockup {\n  position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) scale(.94);\n  z-index: 6; text-align: center; color: var(--lime); pointer-events: none;\n  opacity: 0; transition: opacity .9s ease, transform .9s ease; font-family: 'Maratype', var(--mono);\n}\n#dshMarBootHost .mb-lockup .mb-big { font-size: clamp(44px, 9vw, 96px); font-weight: 700; letter-spacing: .18em; line-height: 1; }\n#dshMarBootHost .mb-lockup .mb-sub { font-family: var(--mono); font-size: 10px; letter-spacing: .55em; opacity: .7; margin-top: 14px; }\n#dshMarBootHost .mb-lockup.mb-show { opacity: 1; transform: translate(-50%,-50%) scale(1); }\n\n#dshMarBootHost .mb-replay {\n  position: fixed; bottom: 52px; left: 50%; transform: translateX(-50%);\n  z-index: 8; color: rgba(192,254,4,.55); font-family: var(--mono); font-size: 9px;\n  letter-spacing: .34em; opacity: 0; transition: opacity .6s; pointer-events: none;\n}\n#dshMarBootHost .mb-replay.mb-show { opacity: 1; }\n\n#dshMarBootHost .mb-scanlines { position: fixed; inset: 0; z-index: 7; pointer-events: none; opacity: .5;\n  background: repeating-linear-gradient(0deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px,\n    rgba(0,0,0,.25) 3px, rgba(0,0,0,0) 4px); mix-blend-mode: multiply; }\n#dshMarBootHost .mb-vignette { position: fixed; inset: 0; z-index: 7; pointer-events: none;\n  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(0,0,0,.65) 100%); }\n\n/* HUD + filter layers are deliberately hidden in the final animation */\n#dshMarBootHost .mb-corner,\n#dshMarBootHost .mb-topbar,\n#dshMarBootHost .mb-log,\n#dshMarBootHost .mb-bottombar,\n#dshMarBootHost .mb-lockup,\n#dshMarBootHost .mb-replay,\n#dshMarBootHost .mb-scanlines,\n#dshMarBootHost .mb-vignette { display: none; }\n\n@keyframes mb-log-in { to { opacity: 1; transform: none; } }\n@keyframes mb-blink { 50% { opacity: 0; } }\n@keyframes mb-pulse { 0%,100% { opacity: .35; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.35); } }\n\n/* ---- underlay swap: engine adds .mb-run on the marathon stage's first\n * rendered frame. The intro's fullscreen #4D6CFE layer is dropped because from\n * this frame the canvas itself paints the whole plate — blue field, black\n * panels, red sweep — at full opacity, so transparent canvas pixels are the\n * LIVE APP underneath. Nothing of the app shows through until the ONE closing\n * cross-fade: render() erases the plate uniformly with `destination-out`\n * (UI_FADE / UI_MARK_LEAD in engine-marathon.js). That single beat is what\n * makes the ending read as 界面整体淡入 with the marks leaving first — not a\n * panel-by-panel reveal. */\n#dshMarBootHost.mb-run #mb-intro { display: none; }\n\n/* ---- intro stage (deepseek 启动1 pre-sequence, above the marathon stage) ---- */\n#dshMarBootHost #mb-intro { position: fixed; inset: 0; z-index: 50; }\n/* Every intro mark is hidden until its own delay elapses -- but that is already\n * said by the `opacity: 0` in each base rule below plus `animation-fill-mode:\n * both`, so there is deliberately NO blanket `opacity: 0` reset here.\n *\n * 2026-09-26: there used to be one,\n *     #dshMarBootHost #mb-intro .mb-hui { opacity: 0 }\n * and it silently killed the whole HUI beat. Specificity (0,2,1) outranks the\n * `.mb-hui.mb-rush { opacity: 1 }` rule further down at (0,1,2), and JS adds\n * `.mb-rush` (which also drops the entrance animation) exactly when the frames\n * are supposed to appear -- so all five frames zoomed to 19558px while staying\n * fully transparent, and the intro played green whale -> caption -> blue with no\n * green frames in between. The same clash hid `.mb-logo-blue-bg`. */\n\n/* 1) the green whale logo — the very first thing on screen, alone, and already\n * there when the first frame is painted. No entrance animation on purpose: the\n * standalone's rule is a plain `opacity: 1` with no `animation` at all, and the\n * scale-in this used to carry (plus the delay) read as \"the logo now fades in\".\n * It keeps a soft lime halo so it stays legible against an arbitrary desktop\n * wallpaper rather than a black plate. */\n#dshMarBootHost .mb-logo-top {\n  position: absolute; top: 45%; left: 50%; width: 115px; height: 115px;\n  transform: translate(-50%, -50%);\n  object-fit: contain; z-index: 10; opacity: 1;\n  filter: drop-shadow(0 0 26px rgba(192, 254, 4, .38)) drop-shadow(0 0 4px rgba(0, 0, 0, .55));\n}\n/* 2) the caption, also on screen from the first frame (no animation, matching\n * the standalone's `.caption` rule).\n * Centred as a FULL-WIDTH BAND rather than as a shrink-wrapped box carrying\n * `left:50%; transform:translateX(-50%)`. Measured cause of \"the logo text\n * starts offset and then fixes itself\": the caption renders with fallback font\n * metrics first (373px wide) and re-lays out when the webfont arrives (266px),\n * which drags the left edge of a translateX(-50%) element sideways by 53px.\n * A band cannot move when its text changes width, which is why the standalone's\n * translateX(-50%) box is not reproduced verbatim here. */\n#dshMarBootHost .mb-caption {\n  position: absolute; top: calc(40% + 105px); left: 0; right: 0;\n  text-align: center; z-index: 10; color: #C0FD04;\n  text-shadow: 0 0 18px rgba(0, 0, 0, .55);\n}\n#dshMarBootHost .mb-caption .mb-line1 { font-family: 'Maratype', sans-serif; font-size: 44px; letter-spacing: 0; line-height: 1.1; }\n#dshMarBootHost .mb-caption .mb-line2 { margin-top: 6px; font-family: 'Maratype', sans-serif; font-size: 16px;\n  letter-spacing: 10px; line-height: 1.1; }\n#dshMarBootHost .mb-logo-bg { position: absolute; top: 50%; left: 50%; width: 140vmin; height: 140vmin;\n  transform: translate(-50%, -50%); object-fit: contain; z-index: 1; opacity: 0; }\n/* 3) HUI frames, released one by one from the outside in */\n#dshMarBootHost .mb-hui { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);\n  border: 3px solid #19F017; z-index: 5; opacity: 0; will-change: transform;\n  box-shadow: 0 0 22px rgba(25, 240, 23, .22); }\n#dshMarBootHost .mb-hui-1 { width: 1270px; height: 570px; animation: mb-appear .01s linear calc(var(--mb-t-hui)) both; }\n#dshMarBootHost .mb-hui-2 { width: 925px; height: 420px; animation: mb-appear .01s linear calc(var(--mb-t-hui) + var(--mb-t-hui-step)) both; }\n#dshMarBootHost .mb-hui-3 { width: 727px; height: 330px; animation: mb-appear .01s linear calc(var(--mb-t-hui) + 2 * var(--mb-t-hui-step)) both; }\n#dshMarBootHost .mb-hui-5 { width: 510px; height: 230px; animation: mb-appear .01s linear calc(var(--mb-t-hui) + 3 * var(--mb-t-hui-step)) both; }\n#dshMarBootHost .mb-hui-4 { width: 598px; height: 270px; animation: mb-appear .01s linear calc(var(--mb-t-hui) + 4 * var(--mb-t-hui-step)) both; }\n/* 4) last, the blue pixel tile that the whole intro zooms into */\n#dshMarBootHost .mb-logo-blue-bg { position: absolute; top: 50%; left: 50%; width: 80px; height: 80px;\n  background: #4D6CFE; transform: translate(-50%, -50%); z-index: 3; opacity: 0;\n  animation: mb-fade-in .15s linear var(--mb-t-blue) forwards; will-change: transform, opacity; }\n/* The one opaque layer: it covers the window at the end of the intro so the\n * marathon stage starts from a flat blue field, never from the desktop. */\n#dshMarBootHost .mb-solid-bg { position: fixed; inset: 0; background: #4D6CFE; z-index: 9; opacity: 0; }\n/* Inverted-blue logo flicker, matching the standalone cut's stage2 keyframes.\n * Visible from frame 0, then 0.25s of flicker starting at 1.20s, then held\n * at opacity 0 until the blue logo fades in at 1.85s. The standalone keeps\n * this image on top of a BLACK plate; the desktop cut has no black plate\n * (the window is see-through), so the flicker reads against whatever is\n * behind it — usually the user's wallpaper. 2026-10-02: REINSTATED — the\n * earlier \"no black plate\" reasoning was wrong; the user wanted it back. */\n#dshMarBootHost .mb-logo-invert { animation: mb-stage2 .25s linear 1.2s forwards; }\n/* JS drives the zoom with inline transforms; dropping the entrance animation\n * keeps the two from fighting over `transform` mid-rush.\n *\n * .mb-logo-blue-bg is deliberately NOT in this list. Its entrance animation\n * (`mb-fade-in`) is the standalone's 3.06s opacity fade-in and it animates\n * opacity only, so it cannot fight the inline transform — and the element only\n * joins the rush at 2.88s, i.e. 180ms before it becomes visible. The `opacity: 1`\n * this rule would have forced is exactly what removed the fade-in. */\n#dshMarBootHost .mb-hui.mb-rush { animation: none; opacity: 1; }\n#dshMarBootHost .mb-logo-blue { animation: mb-stage3 .5s ease-out 1.85s forwards; will-change: transform; }\n@keyframes mb-stage2 { 0% { opacity: 1; } 14% { opacity: 0; } 28% { opacity: 1; } 43% { opacity: 0; }\n  57% { opacity: 1; } 71% { opacity: 0; } 86% { opacity: 1; } 100% { opacity: 0; } }\n@keyframes mb-stage3 { 0% { opacity: 0; } 100% { opacity: 1; } }\n@keyframes mb-appear { 0% { opacity: 0; } 100% { opacity: 1; } }\n@keyframes mb-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }\n\n/* DSH-STARTUP-EFFECTS-V3 */\n/* Additive cold-start distortion pass (v2). Kept separately so it can be reverted cleanly.\n   v2 rule: the five HUI frames are ONE camera move. A single shared bend envelope\n   (--mb-bend-y / --mb-bend-x / --mb-scale, written by the boot timeline) moves all\n   five frames as a rigid stack, so nested rectangles never cross each other, and\n   nothing but `transform` changes during the rush (no filter/box-shadow repaint). */\n#dshMarBootHost { perspective: 1100px; perspective-origin: 50% 48%; }\n#dshMarBootHost #mb-intro { perspective: 1100px; transform-style: preserve-3d; overflow: hidden; }\n#dshMarBootHost .mb-logo-top {\n  animation: mb-logo-glitch 5.8s steps(1,end) 1.35s infinite;\n  transform-origin: 50% 50%; will-change: transform, filter;\n}\n#dshMarBootHost .mb-caption {\n  transform-origin: 50% 50%; will-change: transform, filter;\n}\n/* --- the tunnel: one shared camera, compositor-only --------------------------------- */\n#dshMarBootHost .mb-hui {\n  transform-origin: 50% 50%;\n  transform: perspective(1400px) translate(-50%, -50%)\n             rotateY(var(--mb-bend-y, 0deg)) rotateX(var(--mb-bend-x, 0deg))\n             scale(var(--mb-scale, 1));\n  will-change: transform;\n}\n#dshMarBootHost .mb-hui.mb-rush { animation: none; opacity: 1; transform-origin: 50% 50%; }\n/* the five frames no longer hard-cut in (0.01s pops read as stutter); same order and same\n   stagger, but each one blooms over 180ms so the cascade is continuous into the zoom. */\n#dshMarBootHost .mb-hui-1 { animation: mb-hui-in 260ms cubic-bezier(.22,.9,.24,1) calc(var(--mb-t-hui)) both; }\n#dshMarBootHost .mb-hui-2 { animation: mb-hui-in 260ms cubic-bezier(.22,.9,.24,1) calc(var(--mb-t-hui) + var(--mb-t-hui-step)) both; }\n#dshMarBootHost .mb-hui-3 { animation: mb-hui-in 260ms cubic-bezier(.22,.9,.24,1) calc(var(--mb-t-hui) + 2 * var(--mb-t-hui-step)) both; }\n#dshMarBootHost .mb-hui-4 { animation: mb-hui-in 260ms cubic-bezier(.22,.9,.24,1) calc(var(--mb-t-hui) + 4 * var(--mb-t-hui-step)) both; }\n#dshMarBootHost .mb-hui-5 { animation: mb-hui-in 260ms cubic-bezier(.22,.9,.24,1) calc(var(--mb-t-hui) + 3 * var(--mb-t-hui-step)) both; }\n#dshMarBootHost .mb-logo-blue-bg {\n  border-radius: 16%;\n  box-shadow: 0 0 24px rgba(77,108,254,.8), 0 0 90px rgba(77,108,254,.35);\n}\n#dshMarBootHost .mb-logo-blue-bg.mb-perspective-warp {\n  animation: mb-fade-in .15s linear var(--mb-t-blue) forwards, mb-blue-warp 3.1s cubic-bezier(.2,.8,.2,1) var(--mb-t-blue-rush) both;\n}\n/* v2.1: soften the whale logo landing — its overshoot peak previously sat at 1.16x\n   while the caption was already at 1.04x; both now breathe on the same rhythm. */\n#dshMarBootHost .mb-logo-top.mb-perspective-entry {\n  animation: mb-logo-warp 1.35s cubic-bezier(.22,.9,.24,1) both,\n             mb-logo-glitch 5.8s steps(1,end) 1.35s infinite;\n}\n#dshMarBootHost .mb-caption.mb-perspective-entry {\n  animation: mb-caption-arrive 1.25s cubic-bezier(.22,.9,.24,1) both;\n}\n/* v2.1 continuity pass: the marathon canvas starts mid-tilt on the same camera axis the\n   HUI rush ended on (yaw 0deg is shared, pitch continues from -8deg) and settles slowly;\n   no snap between the rush and the canvas stage. */\n#dshMarBootHost.mb-run #mb-canvas { animation: mb-canvas-impact 1.1s cubic-bezier(.22,.9,.24,1) both; }\n@keyframes mb-hui-in { 0% { opacity: 0; } 100% { opacity: 1; } }\n@keyframes mb-logo-warp {\n  0% { opacity:0; transform:translate(-50%,-50%) perspective(500px) rotateX(58deg) rotateY(-24deg) scale(.2); filter:blur(14px) hue-rotate(80deg); }\n  52% { opacity:1; transform:translate(-50%,-50%) perspective(700px) rotateX(-8deg) rotateY(7deg) scale(1.09); filter:blur(0) hue-rotate(0); }\n  72% { transform:translate(-50%,-50%) perspective(700px) rotateX(4deg) rotateY(-3deg) scale(.97); }\n  100% { opacity:1; transform:translate(-50%,-50%) perspective(700px) rotateX(0) rotateY(0) scale(1); filter:none; }\n}\n@keyframes mb-logo-glitch {\n  0%,93%,100% { filter:drop-shadow(0 0 26px rgba(192,254,4,.38)); }\n  94% { transform:translate(calc(-50% - 9px),-50%) skewX(-9deg); filter:drop-shadow(8px 0 #ff1744) drop-shadow(-8px 0 #31eaff); }\n  95% { transform:translate(calc(-50% + 6px),-50%) skewX(6deg); filter:drop-shadow(-7px 0 #ff1744) drop-shadow(7px 0 #31eaff); }\n  96% { transform:translate(-50%,-50%); }\n}\n@keyframes mb-caption-arrive {\n  0% { opacity:0; transform:perspective(600px) rotateX(-42deg) translateY(-16px) scale(.82); filter:blur(10px); }\n  66% { opacity:1; transform:perspective(600px) rotateX(6deg) translateY(2px) scale(1.02); filter:blur(0); }\n  100% { opacity:1; transform:perspective(600px) rotateX(0) translateY(0) scale(1); filter:none; }\n}\n@keyframes mb-blue-warp {\n  0% { transform:translate(-50%,-50%) rotate(24deg) scale(.72); border-radius:50%; filter:hue-rotate(60deg); }\n  55% { transform:translate(-50%,-50%) rotate(-7deg) scale(1.09); border-radius:18%; }\n  100% { transform:translate(-50%,-50%) rotate(0) scale(1); border-radius:0; filter:none; }\n}\n@keyframes mb-canvas-impact {\n  0% { transform:perspective(1400px) rotateY(0deg) rotateX(-8deg) scale(1.02); filter:brightness(1.5) saturate(1.35); }\n  38% { filter:brightness(1.12) saturate(1.08); }\n  100% { transform:perspective(1400px) rotateY(0deg) rotateX(0deg) scale(1); filter:none; }\n}\n@media (prefers-reduced-motion: reduce) {\n  #dshMarBootHost .mb-logo-top, #dshMarBootHost .mb-caption,\n  #dshMarBootHost .mb-hui, #dshMarBootHost .mb-logo-blue-bg,\n  #dshMarBootHost.mb-run #mb-canvas { animation-duration:.01ms !important; animation-iteration-count:1 !important; }\n}\n\n</style></head><body><script>window.__mbOverlayMode = true;\nvar host = document.createElement(\"div\");\nhost.id = \"dshMarBootHost\";\nhost.className = \"mar-boot-host\";\nhost.style.cssText = \"position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;background:transparent;overflow:hidden;pointer-events:none;\";\nvar tmp = document.createElement(\"div\");\ntmp.innerHTML = \"<!-- Boot payload: DOM (marathon stage + intro stage). Images are base64 data-URIs\\n     injected by scripts/build.cjs (tokens __IMG_*_B64__ are replaced before the\\n     payload is JSON-embedded).\\n\\n     2026-10-02: the inverted-blue flicker frame is back (it was previously\\n     dropped on the reasoning that a transparent window has no black plate to\\n     invert against — the user wants the beat either way). assets/boot/\\n     invert-blue-pixel.png stays in the repo. -->\\n<div id=\\\"mb-boot\\\">\\n  <canvas id=\\\"mb-canvas\\\"></canvas>\\n\\n  <div class=\\\"mb-corner mb-tl\\\"></div><div class=\\\"mb-corner mb-tr\\\"></div>\\n  <div class=\\\"mb-corner mb-bl\\\"></div><div class=\\\"mb-corner mb-br\\\"></div>\\n\\n  <div class=\\\"mb-topbar\\\">\\n    <div class=\\\"mb-brand\\\">MARATHON<small>// BOOT SEQUENCE</small></div>\\n    <div class=\\\"mb-readout\\\" id=\\\"mb-readout\\\"></div>\\n  </div>\\n\\n  <div class=\\\"mb-log\\\" id=\\\"mb-log\\\"></div>\\n\\n  <div class=\\\"mb-bottombar\\\">\\n    <div class=\\\"mb-status-dot\\\"></div>\\n    <div class=\\\"mb-status-text\\\" id=\\\"mb-status-text\\\">INITIALIZING</div>\\n    <div class=\\\"mb-progress\\\"><i id=\\\"mb-progress-fill\\\"></i></div>\\n  </div>\\n\\n  <div class=\\\"mb-lockup\\\" id=\\\"mb-lockup\\\">\\n    <div class=\\\"mb-big\\\">MARATHON</div>\\n    <div class=\\\"mb-sub\\\">SYSTEM ONLINE</div>\\n  </div>\\n\\n  <div class=\\\"mb-replay\\\" id=\\\"mb-replay\\\">CLICK / SPACE — REPLAY</div>\\n\\n  <div class=\\\"mb-scanlines\\\"></div>\\n  <div class=\\\"mb-vignette\\\"></div>\\n</div>\\n\\n<div id=\\\"mb-intro\\\">\\n  <img class=\\\"mb-logo-bg mb-logo-invert\\\" src=\\\"data:image/png;base64,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\\\" alt=\\\"\\\">\\n  <img class=\\\"mb-logo-bg mb-logo-blue\\\" src=\\\"data:image/png;base64,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\\\" alt=\\\"\\\">\\n  <div class=\\\"mb-logo-blue-bg\\\"></div>\\n  <div class=\\\"mb-solid-bg\\\" id=\\\"mb-solid-bg\\\"></div>\\n  <div class=\\\"mb-hui mb-hui-1\\\"></div>\\n  <div class=\\\"mb-hui mb-hui-2\\\"></div>\\n  <div class=\\\"mb-hui mb-hui-3\\\"></div>\\n  <div class=\\\"mb-hui mb-hui-4\\\"></div>\\n  <div class=\\\"mb-hui mb-hui-5\\\"></div>\\n  <img class=\\\"mb-logo-top\\\" src=\\\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAoAAAAKACAYAAAAMzckjAABZZ0lEQVR42u3d3Y8cV5rn99958iQ5YkvNrBYHWGCgKmLbe2fBkAzYGFvFrmph/y6W/h9f+sbYZWeKpXV7sViVYV3aa7NKHsAX0jA5LVU3mZHn+CIiqqKiIl8rX+Ll+wE4Mz1NUazMiBO/eM55zpEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAscHwEAoM1inP+sc06RTwkAAKAj4W/Z3wO0jecjAAC0Nfw5pziMGvgZM16JFJ3TOP+9fGogAAIA0FAvo8w5hfOow2nw38r0NAmKug2C0ZucC3p3HpM/OKerl1H2jVPg00MXUPYGALRKXs07jzpMgj9/ZDqclepM0oegK2/J8bHTFZVAEAABAGhg+JPk/iR9ZsG/7psOk6AQZzzvXFoJtEnQVbDkxR+lH5VOCxMCQQAEAKAJ4S9b8/exC/6Hvun5JCjIyeb/gwr9NAS+iZZ8fur0C5VAtJ3xEQAAWhQCTdIzSc+mUoxLFDqi5KZSzP+57M8ACIAAANQ8+DnnFEfSkxj80ExPpkFybnEAdE5uGiSz9J8dSU+cU2R7GBAAAQCofwg0Sc9MeubWeL45yey2Ckj4AwEQAIAaB7971b8kKC5T/bsJf04uCYpmeuKCH34nDagCggAIAA0MBev+4tNr5Pf9oOrfTRCULEqfOinhU0WbsRE0gEaGu4UP8gd0cM768+kKre+1MMqqf701qn8Vkon0aYz6hU8YBEAAqEnYWyaIzTv+a+6TPzsabJm/C4GwHrKtX4rVv7jmn+OSoNgzDULww+8s+fLY6S1bwoAACAA1CHuzwl0v284jkZ664IcVx3/N/dfnR4MNY3LqpXe92+1BKoNh/vclHOz3enkVdeSCH9lmqn9ykmMaGARAANhR4JsX9pYJd0nhAW6mgZPkV1gN5iSZ6SAEf5Gk/66ZwfC9FPJASBDcz7WTHfd20JMf9U1Hkw2EvwKmgdFqLHYGUJvANyvs9QphLw93i+b5st+/3puxlf6ekoKkEDSOUvAmNw16Fy05lTQ+LQRBQuBuA+B3UZ8kwf+/PdMnyZL7/i3xZ8eeSSHoMlryxanTmO8WbUMFEMDOQl9V4HssWbmy974U9sqVvCQoThe93T4gCMwKj940yAOhMx305C+mQeM/x+T0b9LYERR2fW3ZSPpU0jT7Wjb2uefTwI/ZLQMEQABYLfCVQ19V4Jtm1T0n2bJhb4PTfCuFx3IwNNPAmQaJ/IULGr+6Tk6c0+XLKPvGKXA1bO8ayxo/fuPSff8GyWanf3OTIE34xEEABIAFoa9c/TqPOpCkZQLfPsLeQ4JhHgidadA3DeJj//o8JsfHTldUArd/zY2yUzvchqt/N9+3ZKwDRFuxBhDARkNfVZUvW8OnnumguHavXFGrU9hb8bOILm0WsUnQVbDkxR+lq6pAjIdfd3nzxzT47810OA1ym752iusAe2wHgxaiAgjgwaFv2SpfucLX1MB37006/TlcEhQemQ4/BD8cWfIlzQNbrV4k2VYta+/7t8S/g+1gQAAEQOibFfqmWZVPId1GZda0blsC38zPKt83MOpfvad5YKvX5Cht/thFMGM7GBAAAXQv+K0a+tpa5Vvi84pOij3Jpk7/32PRBLKNazKf/t1y8wengoAACKB7oa8Y/FYNfV0JfMXgJ0k9S/cv/JCuATz9o/SOsLAdhenfrTR/lP5dTAODAAigG6FPSps5JA0IffPDnze5kAaF8SRoHN4nJ18/0SXhb3vX62h307+5fBr4120HTmCHL1IACH2pcjNHzzQI0qCXPfWKXbtdDX158Ms2g3YmjadB48eWbgZN48f2rtlS9+/RNGz/OiydCvL5qdMvfL9oAyqAQAeD37Lr+iQpBMVA6CsHAteTNJEuEyUnMo3/kePgdlW12Nn0b+Hf6ZTtORijrkUVEO24lwB0IfQVg19Fpe/ePn03mxwT+m6CX7nqN82me2eFa2z+Oh5JRwr+e2862FYDyIzQH5OgK0cVEC1BBRC1Dy21foOq8QOgKpCwru9BAeBe1e/rJ+l0L8Fv+9dydvTbYNvdvzPvdclMehapAqIlGOBRy3DXlIfpskF1Vz/PktU+1vWt9KEqzqv6Efx2FwD/16jfvQ/+jTd9susAWK4Cnki/EvzRZFQAsfNQtMyAOYwa+Jq/oCRSdNm6r4d8Jg99gKzaxSuxrm+FV+TQdzKqfvUQpInSX/uqmNxUAZ3TLy/j9k4hAXZwPQObDXuLHoqzwl0vO0WhtC4t1vA6jd7kpkHvoiWnXnqX/91nBcXTOUFxVjic9TmWf/86XbyEvuXCn1d6tq+35PjYpWf7UvXb3zgzko5c8Be9PUwBZ3+P2DPFEPRjz5IXx05XL6PsG8em3yAAokNBb1ZIqQp4q4Q7JzkzDer8au3SaoRC0DjO/msuDIrzwuGyn/m8hg4npng3Ff5eRtlZWvUl/O147Cms/7vY1fYvc66N2M82/M6vDV4KQABEawPfrMEtD3vLBrxlw10xtNSZtwXT3bOD4txwOC8YDqMGjyWr+Lzp4t1i+KPKs98AeB51kAR/uY/1f/OukWDJiz9KP2b3GtcICIBoV+ArVvXmhb1lAt4y4a4poSU/BmydoDgjHFYGQ0mq+sydZMXPm2rfg0fEe9Udwl89AmDWAPJ/etPv9h4AJSkq9E02CXqTbxDNtYImoQmE0Dcz8JWrTMpCR5IFkjzs5VuIFAPetAXhbqm8sOTPMi/0etOgHAzNdBCCv0jSz7/43937zNm6ZXNhvucUs8of67tqJmsAqc31HW8r9s8+kv5+GOU5BQYEQNQ+8JVDX1Xgm5aqTOWgNyvsEUJWC4qzwmE5GM76zPm8NxT+0uO+rqMlJ4S/+o1do9vTP2pzT4f0zv3og/z3Lmj86jo5cU6XXDtoxHOJj6A7oW/J5oF704rzQgrhY7uhhM98Vx/23em8E/Z4q834VasGkBl6TjJJLB1AXZ73y4xfVAA7FPrKVb5Zp0HkgY8q0/4rDHwKO3kNjn0n+5Au6D/5o3RN+KsXL7lkx+f/riJ7cY590+Ek+PPzSOc4dv/ML19ni/Yr5QHT8tC3bJWvXOEjfKAj9829fd1Yw1Wvca3QAfx/1aYBZPbLBHtHYm/Br9isWdxJYlYQpALYwuRfDH3LVvkIfOhi+Ms6rn8trvtjK4/aqv8YFWWJU3hkOpzIvx7G5ETS2DlOj8F2Xo7y4Cel52QH01NJckHvhjE5za+/qhcRAmCDQ19xMFkm9DGtC5Sf1wpB+slJP2X3VfyGj6V2eukUcFMuKpuk50cf9eQvpoXmkFkv7cA64W8YNfg7afA+P/XJ0lOfJGlqOsivvz/H5PRvhReR/NojADYw+C1z3mtV6CPwATf30k31z1lyesK6v1oLezz/dy1OLgRFZxr0TQN95L8tVgMJglhXPkvx6lpHLvhRYhq4bMeI4hnvkmTZf5fIXxS71PMQSABsYPCrPO+1sE0LoQ9Y4r5Kl7/+JOkn5xRmHb2H/Y9/o5ptAbNUBnRy0+yBXKwGFqsxBEGsGv6+cQrnUYdJ8K/7psNpIfiVn/c3p0FlLyLxsX/9KiYvJP0YI00gjQp+xXl+znsF1r6voje5JOitLPnyRLoSnZq1HP+asAXMKtdckGTSeBo0fmxpEDwlCGL18HfeNx0mQSFKbtE9EeNNl7pNgi6jJf/1qdMvVAAbEvzK8/zFah+hD1iL70s/U/2r+ZdU8y1gluGcXD5Wl6flqAhirfAnBTmZW/L6izE9TlTSM0nPYtQ1AbBmoW9W8Js1z0/wA9a436TopJ8j66CbYtL0HyAfq1cNgoRBwl9l+IuyVa+/aVD0po+mwf+7/2DJlwx+NQl+5caOecGP0Aesfb/lzR/jaMnpV+Ls1qbkp9b8ICsGwVnPCRD+1ryRTNKzKP09AXDP4W9WYwfBD9jivSfFbPo3Mv2LOgbBYUxOvfQu+71vCYKEvweHPyeXpN1vv50G/58JgHsKfvlNPGsbF4IfsF0m9fkUUMcgaKbBNPjvZdJ0xoa+BEHC3wOuOes5DQiAewp+kpTv40NjB7B7U/HwRH2DoM92eHAzNvTNnymEQMLfOpLAPoB7CX4327nIj/rSUXEfH4IfABAEi1t7zVsnSDWQ8LfudUYA3EH4m7mdizSYBMVI6AMAVATBYhicdbJD+VkDwt8yCIBbDH75W9m8rl7n5Eh+AIBFYbB8skP5iDmqgYQ/AmBNgp90u86Prl4AwCaCYNURc1QDCX8EwD2Hv2XW+RH8AAAPDYIhKM6rBhICCX/zGF/BZoJf8dzKP0c9d8FfePkLJx1NguI0n+4l/AG10OMsdLQgCE6D4iQoOunIy1+44C9eXevIOcWXkWd8XTPDvsOfRAVwI1/koule1vkB9RNacLwYUFUNjI/96/OYHB87Xb2MsjMpUg2sXWaI+wx/BMAHfonZzReZ7gUa9tCU3ET6NEb9KvYDREuCYLY2MPZNh5Pgz/MQ+I1YF1jHzDCVHz0yHU72EP6ycRAPSPB6da2j3uNsM2dpENnWBaj7/Rt7JoWgy2jJ56dOv/BwrO84ex51kAT/X7zpIMlmVPh0Fj7ZQ1+yiXQZla4LPGVd4N6D36zMoD1d01QA1xyUZlX9mO4FmvB8lJP0TNKzrAoItOhBJZtExaou4XztGR/S7vKCNLsxdJ8vNATAFb7IM8k5p3DnCDc2cwaaFf6cXBIUe6YnIfjhd5Z8eez0luoIWvaW42atC+Ra325WKIw1sc4HQBAAV0vx+aLN133TIVU/oMnPR1mUPv2LNC0O2kCbXnbK6wJfxeSFpB9jZMPobQS/4mda58bQGDkLeOnwd2/RZlCIYlsXoOGSj/6m37mP9C+EQLQ1BEpySVBIn11+NLLk8xPpVyqBmwl9xeB3HnUgSYn0VMF/WywW1akx1BtnAc/9Ys/mTPnKyXhaAM19KGbTwIPwyI9exeQPoiqCNj/TJDdNO96fSXrmnH7J9gns3PW+6pF5s14Oi//8TZEonep9qiD1TAd1XCIWo+I06h0ZZsaXXUjzh0nw54+yFD+lCw1o01Mx9k1uEvQmZlWRVR4M2P44TBfwZh/8PVMMQT/2LHnRlvWAq1bv85932X9u1udTrPa5whq/Xpaq63a9xmy8S4J+6lny31MBnDHoMOULdKIqonJVhKng2n5VeCDn5IKkvunoQ0PXA1bdn6v+3bPnu5zTeNnf77Nt83pZJTWRnharfWZpGMynevPPu6Y3U+xLPxEAC15GGVO+QLceiNPbjmCmguurz0ewsae/m8TmrAcsB76qv2MxoM2SB7cP0m9j8N9J0quYfPVI+pfe7fT4vd+fV/dkepoExST79zjJmWngJHlLq311Dn33xj6pTwAshL/CuXz3unz5hIAWV0VCWhURC+RrJ5Gik36O0sd8GpvKgPfXA9ap8l3VXFEOe7MCmmYEwaQQ7OymI9f/70n6Z8z8/eWgd+f3BMVpYRxp0iUwFV3AN80e5UOZmfIFOvVAFAvkaxfMYxYE3o0sOQ3BX3jTgHWAm3npqWPlu6o5Yxg1eCxZOey9z8LevIA286Uiq9b5LAgu8/unMz7Hhl4CfanjR8FVNXvs61BmAHsfD+4tkOfUhHqM0d9FfTIJ/pJGkI2/+ey9CWrRVipZc8XTJCg6ycw0KL+Z5YFulQCc3/Or/P42jHHepGnQf+lZ8t/5rg8sdTmUGcD+qyLFBfL5qQkvo+xMikwH74+xBnBL+W9/TVCzqn0qbaVipoNida+qGrduQOvSi0QW/tw06F205N9+JY07GQAXNXswLACdfSK6iVPIT03IQ+A3ujtjgN2aMhW/tZeeiqngrW4NUw5+lVuplJorph0Nbdsa5frSz851cA0gzR4AFoRAS1zWJSn/ehiTE0lj5zRedQNZoAkh8KYJSn70nbZzNnb53plV7ZOasZVKk+UV9U4FwFL4o9kDwMwQOImKznTUk7+YBo1fXScnzukyf5gRAvfwrWBrH2yQooJ+50zJRv/siuD3d9Lg/YxqH6Fv6991zCvqnQmAVeEvkQL7+wGolFZGojMN+qaBPvLfUg3cK9YBbvmKj9J0In0ao37dROAuvigVg19iGribrVio9u12WLu9jzqx3m1m+KPZA8C8wTJbIzVJOxCPvPyFC/7i1bWOnEsbQzg5ZPsKewEStrd0nednY7vghyPpyUOu7Rjlio2Wf4567oK/SOQvnOm5pEEIinlHd/6Lb2K7svvn5yS7j1r/gRP+AGxk8Ey3iXE9SRPpMiqtBp5SDdz25+4kaSQdueAveuwFuLXrO+sS/SXbEuZKa3S/F6t+r6511Ht822hpYpp3z9/tOFryxYnSpSytDkGEPwCbrJJQDdzbZx/7VAC3fn0nQdFMT+KaVcBi1W8Y9bz3kf+2b3oeKyp+fOJ7CIJSyDuApRavAST8AdjGQ1LKdg2YszaQSuDmZZ2LfK7bvsYlM+lZlJ5lawGXCn5naTNl5fZqUVT8aqJvbV8DSPgDsO0gOK8a+DLKqAZuVta5SCPIlq/rvAqYrQV8uqgKmL/w5M9ce+xfF6t+ouJXCzFbR/tetycbtS4QEf4A7OphmXcKR2nQNz23x/71edThN06BKeHNohFkh9e2ZFH69PGCjFCe8p3Kv36Uba82ZZ1mPYJftv4vpCeAnJ5I7/LvrVWhiPAHYB9BMKsGhkemw6n862HU82HUIA+BBMEHfb4xRrkTpQ+wEPTOm9yy57hibZMgTeY9b51TzKZ8L7z8hZOO8hO1CH81C4Kl9X9SiyqAhD8A+wyBcjIaRLYbBGkE2eHnLVm2J+Cd6zZGueLztmrKl0+vlvrlM7Vb0QRC+ANQk6emo0Fke2gE2c3LTLYn4NMQ/HBkyRcVWx1FTtRqjqr1f9n9RPgDgE0+QGkQ2Q4aQXb5LiNXXAd4pur1fjcnahH+6hf85qz/kxpeAcx+EMIfgNqFQOnudjHxsX99HpPjY6erb8R5wusoNIJ8zKexEzfrAL+ZscWLHM/b2melwvq/4stnY7+47Idwr6KOCH8A6hoEFzWI8Ckt9TneaQSZBo1pBNnB5y5ZT/pUkv5D1BHr/Rrr3vq/xgbAwtFAT3rBjx6ZDpNA+ANQzxA4r0HkJePWSkGwL/2sFh9iUJdrNl8H+D74f/8q9v+bSfCv2OKlgXlpxvq/xgbAM91MnTyT9GwqxSguRgB1fqrO3jOQdYErPdA8+wHuJgSGKGem31uIr830e7Z4adB9cvf839OT0vq/dEhqmGLTxzT412b6bBroPgLQnIHZSdGbbBJ05S1dF5j9d6wLnP/Z5bM/Ry74i55pkFCN2nbijr00SDDl28AAmAT9pW/JP3zl9Jfy+NKoCmBFx+9RoPUcQIPkU8KJWBe45ueX7wcY+DR28YGn08GEvyZm95umqcolE40JgDHKlbd7maRNH1yUAJo4OrMucE3Zgna2g9nlSwuaM7SUpn+/UvUepNaQH4aOXwAtfLLOXxfIB1TtvRQcVUBgEV8+/q1RAZCOXwCtzoCFrWL6ls5w0Bwy87Mqnwt8zXYwQEV2WjD924gAeEbHL4AOhMB8XWA5BLIusDoISvpJ0k90AwOF4Lfk9K9U8yCV/6Xp+AXQnXSj0JdsIl1GpecIn3KO8L1ngyQ3kg4V/PfedEA3MLBc92/O6n6DF9b90fELoAMjOM0hS+XkNCizKTRwbwi5WSM7996o5WBSte5vEuj4BdCVdENzyJIPOjaFBm6zU/QmF4KuF03/1jYAnrHuD0DXM+CC5pCOfzYxRrmvlK5z4mxg4OalKIRsfeyiJSO1G0SK+/254EdmejIN7EMEoJshcFZzCJVAzgYGCtnppvrn0qPfrhetG7aa/QCs+wOA+6/1hMCZH83NNDB7AqLr98JNd7xzi++H2gSrwrq/37jgf+ibnk+CghwDHABkI3bwunuGcH5EZicfeHfPBv6hZ/qYbmB08D7IO3/fypIvT6QrSbExU8BnrPsDgEWv+DMrgV3dKzDfEzCkewJSBUSX5Sd/LHUf1GLAYL8/AFgl9dyvBBbH0k5l4sKegFQB0cn3wqjYM8UQdNWz5Mtjp7fLjAVWl5uXdX8AsOzAmVYCH5kOp/Kvh1HPh1GDrp4aklU8qAKik+Fvla1fahMA2e8PANYPgWwYfed84GvH+cDo5FCw/NYvtQmA+c0r1v0BwBoDKBtGF54lVAHRreC3xtYvtQiAxalf9vsDgLWDT+c3jKYKiM6GwLvVv5VefPYyOJSnfvumo0DTBwCsHQLZMJoqIDoU/NLGD61b/dtbAMzf2HR36hcA8LByQGdDYFUVsGfpg5ILA6273iX10v+1VvVvLwGQqV8AIARuMQiG/KHYkxwPFrTuFo+KZoqToMupJScna1T/8hC50/DnnOIw6uPCaR9RhD8A2HSJoJOnhuRFhj9Jn/WC/5Z9ZdG28OdNbhr0S7Tk81OnN+vu/7mPCqCJqV8A2PJg281KYPYgjF87XUZLTmgIQftu7dvGj4fs+7mzgaDY+BGDHzL1CwCEwC0/c2gIQZuu6XuNH4WXnvoGwMJf8plJz5y6tUcVABACd/qs0QkNIWjTda2HN37sPABWNX5wViMAEAK3HARpCEE7buENNX6UA+XWwx+NHwBQixJCpxpDaAhBW8JfNvX760MbP4p2VQGk8QMA9v4k6VYlsKohhKlgNO+97e7U70MaP3YWAGn8AABC4N5/5Hj78GQqGA27du9N/RZebuobAAt/SRo/AIAQuHPFhpCpJSeToEszRaqAaEL4y7t+oyUnXztdSoqbCH9bDYA0fgAAIbBGIZCpYDTrupXiNqZ+txoA88WJI+lJL/hR33QUWHgLAITAff6496eCCYCoa/qLfZN9CLra9NTvVgNgdqPR+AEAhMB6PE9LU8Efgq68yeTYJBq1e1GJpnTdn7fkeNNTv1sLgMXqH40fAEAIrFkIjF+79ME6CbrqSyZHJRD1CX/FdX/5Vk1uC9fotqaATTR+AAAhsIYh8GWUHbt0L8RJ0KWJphDU5PqsWPd3tqWlChu9sauqfzR+AAAhsE7yn+nY6YqmENQo/QW/5XV/WwuAWQik+gcAhMBaO0urfjSFoD7hr3BKz7bW/W0lAFL9AwBCYGOetzSFoKbhb5vr/rYSALMQSPUPAAiBTQqBd5pCvAiB2H/428X53Bu5kan+AQAhsKkhsNQUQghE68PfxgJgFgKp/gEAIbBxik0hhEB0IfxtJABS/QMAQiAhEGhO+NtIAMxCINU/ACAEEgKBBoS/BwdAqn8AQAgkBALNCn8PDoBZCKT6BwCEQEIg0JDw96AASPUPAAiBhECgeeHvQQEwD4Gi+gcAhEBCINCY8Ld2AMyrf99JA0f1DwAIgV0LgVGBs4MxJydFxfqGv7UD4G2wVRKlT6n+AQAhsEshsG+ynskRAlEV/nom17f6hr8HBcAYZRPpU0kJXzcAEALLITBbJtS6EBjeJy8mQW+cNDaTEyEQt/dCNJNz0ngS9Ca8T17UMfxJWv3mzKd/h1Efu+B/MNPRNEhM/wJAxxXWOwVLXvxR+lGSXIvWzBWegQNJAyc/6ktHEykoMhvW2dwXFZ0U+yabSJdRyYmk8anTOL9m6vZ3XnsNoKRnSps/CH4AgLQSGBQemQ57wY9G0hPXwrODY5Q7dRqfOr3pKXnxgXWBnQ9/+ZTvh6CrnpIXp05v6hz+Vg6ANH8AAOZnQLmpFCU9+0j6+2HUoG3TwXkIZF0gwW/elG+dw9/KAfDm4qf5AwBQHY5cSMPeRx/kv3fBX7y61pFzim2rBLIusNvhL6v6uShdJkq+iJZ88fUTXcYo941TqHP4y7LcSj+wk+RG0qGC/96bDqgAAgCq9LIqwYcad0JuKAxUrwsMClFyPCPbFfycJGdyJo2nQePp++Tk6ye6LF4LjXiJWeMCp/kDALDswzL6mm+HsckQKEnnMe2GfmQ6nEqaUihpxbUsST2T60mqavSQ0spwU36mldcAiuYPAMAyFQYnJ9f+fQLzB39xXSBTwu0Kf97kimv9pn9N/lBu9GhS+JOWDHH5D3cedTAN/nszHU4DZW0AwNJPm1qfirDhwMBWMS0JfuXp3seWnP6twVW/tQPgd1GfTIL/J2/6hLV/AABC4PznpnQ7Jdw3HSaEwEYEP2n2dG/5+20qW+Vi5uQPAMD6T9ZuTAdLs7eK8ZKphYG3LcFvmeneNoS/9H1sybeYwvQvzR8AgIc8eTpTCZSk/GcrNodMpKjIc7QuwU+SvMkFSW2c7n1QAGT6FwBACHx4CJwG/zpbS08xpebBr5iD2vbz25IfEtO/AIANPn27Mx0sScVNo6MlJyHonefUkL2EvvJUr6RxDHrjs82c/7GF073V72ALgh/TvwCALT6FOtUYIkn/Ufrkr8G/4TCF3QY/Ka32OUlTza/4Se2a7q1iy92fN0e/cZECADb4ZO5WJbDtoaJuoa9Y7euZXBL0NkpvY9CbZE7Frwvfky3xARrTvwAAQuBGQon7q/Q7Ciq7CX39wjRvCHojS76Ukt/3LPnytKPB7+ZlZN5FytFvAIAdPpFaOx3MkqrtBb7if86neIOkadBbb9I06F205FSFad78O5G6W5X1iy7Y0d2j3yhdAwC29DSXJS6tBE6CPz+PtyHwTO2ozpSWVPFMfWDo85aFuCz0JVnoC0HvlIa+dz2Tjp3eFkNfl4Nf4Vqc/aYyjBq44C84+g0AsMMn071KYPHZ1NDQ4iRpJB0p+O9pAFk97BVDXx74QtA4SsGbXF7p89I76Tb0FT9/1mAWPsd5/+Vjyd6nbyrGmwoAYDdP/bQSmG6Y7F8PY3oMl8vWazXtIV6c/nXBD800IPwtDnp52Lt9L7hf5csDX09yiSlUTfES/NYIgEGaKP0FAMBOQ+AkKjrTUU/+Yho0fnWdnDiny6auC+z69O+8PQ+LQa8Y9qZphS9KaVPHrKldQt8GA2C2/i+v/gEAsOvE5EJQdKZB3zSIj/3rpq4LzJ+p6uiOGnlXbkUoLgc9FcNescI3lWI0xVlVPkLfyi8k9y/S0vo/OpUAAHsNDy4NBY1bF0j3r6SoaGmgK4a8m6A3rQh6SpPynbBXFfoIfOubWQEsrP+jUwkAsL9KRRqWXKLmrgvs7PSvU+g72YegK1nyh3LIk6RyVW9W2CP07SgAsv4PAFArC9YFntV0Sriz079Osa80/BWrtssGPcLedtmsL2LC+j8AQP1ChQtBMUqDvum5Pfav85NDnFOcFST2FfycU/xOGrjgh70Odf/GqGiSJkGXxU2981M3yr/yUzjKv7jgdxQAyxermZ7Sqg4AqFUGdHLToDgJ6ZTwVP71MOr5MGqQh8A6BcHS9G/r5Q0fWRPHSfFEF4JeTQNgly/WXf3ikgOAzYRAOdkkKDrpyMtfuOAvXl3rKA8VdQiB+YyaOtj9G6XYl36OUe6MXoLa8VUX66iFF+sq+w9tUxJm/z2otALAqknw7lYx+sh/W24QycbXnQaQ0o4and382aR+3abmUQqAbbpYZx0dc3/cqNx/aIvjlFzPNJh1rMqscEgwBIA5Y2s2JRwkVTWIFJ9xu/67dX1HjSmVv/oHwML/wyUNvFirDodeEPJmbjS56b9b/ucm0tMQ/NBlayulO3/PmeGwKhgSCgHg/phYt2ogO2qgMQGwlwbAxlysefArHg5ddXTMrJA3b/+hLXg7jMkXkpy35cLhrGBIKASA6iC4TDVwF0GQE7XQqACYva3UPkgUg1/U7MOhq46OqbpJdzg4jZcJh/OC4bKhkEAIoKshUJpfDdxmECye/sGOGmhEACy8rdT6Ir1pMU//4zgEjecdDr0o5O1yOmDB32M8Lxg+ttVCIYEQQNeDYFU18M8xOf1bKQhu4znQ2dM/CnriuVPrAFjRAFLft5XsTEFJ4xg09pacJqbxvMOhdx3yFgxIcdVwWBEMF4ZCJxmBEAAh8LYaaKaBMw0S+QtXCoKbrgZ29vSPksD6x3oHwFztu5WcYt/JTaTLRMmJTON/LJXy6xT2NhUOZwTaylDYk0y2eiAkDAJoexDMx7xyENzk+sCK6d9BV6d/ndI9EGPUL1yBtfx+CieARH0yCf6NN/2ubhdsjIq9dI3fVc+SF/mZgvva46kGn8fCKucwavBYsrxCmB1FdBMIrRAIqQ4C6ND4GSWpZ3I9SRPpMipdH3j6wPWBpefpP3nTJ10MgIVn9mW05IvTrMrKqR/1cWcfwFFNu5XyNX9J0Ft9SE6OP9JVjDKpu0fIVP3c5VBYqhLOqxCqZzqgOgigI+Onk6Rl1weuGgRjlI2Y/pWTXJQ+9awDrGcAbNT6P8n/9e/0z9kNyfmBC0LhokB4HpMvJUk2f7qYMAigzUFw0frA8ng6b7lO9jz9TdenfwtYA1jXAFj4P2q9AXSUopN+/kTqcazMxgJh3i29dHWQMAigjUFw1vrAchAsjqUzZmJsJD2T9KzL3b/Fj5crrOYBsK5JPZ/+nQaNoyWnX4l1BNsIhEtWBwmDAFobAlUY18pBcBjT/WWLL8+ll2onKY6kJzFdb/2E6h8aEQCzE0Bqe6FGKfaln6n+bScQzqsOEgYBdDkImmkwDf57mTQNejeMyalKVcFsKNQw6pml1b9Zx74D9QqATdirx6Q+X9n2w2A5EK4bBgmCANoSBL3pwElypoO8YSSvCj6S7IMUst0WRkb1D00JgE05AWTK29ReAuE6YdCJqiCA9gVB6bYqGIK/SNJtttLfKzkzDUJMj2cCah0ACx3AI84rxKbCYC8bIHuiKgigPUGwGAa9aVD+fTxD0ZgAmP0PN+34eYXYXBgcxuSLROm2QpGqIICWhsHyBvqMa2hcAFSa+tirB5sKg2NJY6qC6Lr8xImHhAzUPwhi/m3AR1DjANhLK4BcyNhoGFy1KshgiraFPm/rX9Mcz4iWoHmzzgEwUP3DFsLgKlVBIwiiJcHPW7r+P0iaBo3jGhUQJ7niaTzlQMg9gkbcE9kBDglVwHoGwKZ0AKO5QbAYBstVQS8N3gc/VEUQ5EGHpgW/bGnDW29SCHoXLd0mJJtlWfgQzH9f6TSemcczcn+grvdE8QCHE+kdBzjUMAB+l07L/bue6bd0L2HbYbCqKlgVBFkniCY96EL6H8chaCxLTiW965l0fPvCs6qFxzPSVIXa3x8c4FDvANir+RnAaGcQLIbBYhBknSAa9HSLlq7xG8egsbfkNDGNTyvOjF3zXhkXA+EyTVXcH6gbDnCocQDM/jdrALG3MFgOgqwTRP0vXoW+k02ky0TJiUzjf8wCW6nKvfZL9bzjGWe9LIWgGLk/UCMc4FD/AMhggToFwaXXCfKgwx7CX+xL9iHoylvy4tjpqnT9xk3eF1WBsOplaRr8t49Mh1NJU+4P1APhrwEBEKhdECw+6OYFQR5y2NnTLCr2nOKkEP5eRtmZFLe9wH1RU9Wr6+TF5LEf9bg/UB9M/9aYNekv26NS2ZkgmP+KUS5GuVOn8T86vYmWfOGVfBGD3kgam8kpKj5kw11g2fDnTS4EXUdLTvLw941T2HV3Y/n+iFHu6ye65P5Abe4XtoCpPd+kUMV+hd0Mg9nDt7phRH7UNx0x7YUdPdRCkH5y0k/ZNRm/qcH9kd8ji+4P7g3s6kWJLWAaEACbcgSck9xE+jRG/cLXRhDMH3SvrpM/qGLaiyCILT3UfnXpQ+26HMDqcI8suj9iUBT3BXbzssQWMDVnE+lZnTeBdk4uCYpmeuqCH46kp1xQ3Q6CxamvWdNe3uQiU1/Y8ANN0k+SfnJOoUn3R6Lkiyhd9k1ONf27o4UBgzWAteanwf/nKD1NYr0rJk5yUfrUsw4QulsRpFEEWw1+96e0rus+pVV1f5zH5MWH4M/7psPEKSg2aw04mnfrsAVMzQN6zzRo0MORNYC496CjUQQ7eZpJ8SPpn12DKmj5/fEyyo6drrwlx5OgKy+ZogL3BLaI6l/N+YZVR6jioPIhJ9Eogh0FwYYtP8nuj5iHwPOYHE+CPy/uGcj9gE2/LNEBXH/GjY82BcFyRfDU6c30r8kfJkFvHOsD8bC3T/dX6XfOKZ418GX0G6eQh8DwPnlRvCfEvYDNvBzlWyW9owO4AQGQjwBtD4KLGkX4xLDgeio2oo3Oow7zMNXEEEhzCLYeBAsdwHwaBMCNYTNorBMEWR+Ih4bAIKlvOkqCPy+GwPxFo0n3RbFC3lPy4kO+LpAQiM2FC9YAEgA3i82gse4DrxwEi9WPHtVALBLlJlLomw6LIbDqVI6qX3W8JyqbQwiB2MDdQgdw/TXqLGA2g8ZDHnjS4o2kY1CMokkEM0OgJU7hkenwQ/Dnw5j8wUvvsmvq7dx/dEYI3Nc02azmELaJwQZQ/WvCc3EUfCNSeoyKPZNCSNeunDqNWVyKB1xPeRCMw6iB8m5hcWwWlgqC0dK9Ad96k6bZoncvvetJrlz9SKR4mr50zA2G+xrP8jONz2Na3eybDhMRAsFzmgBYkwvLm1wS9BdvydGx01suLGwiCObX0KtrHfWyamAQ1UAsNyY5SUFSCBrH+9Ne+SbSlQGxHAyLLyaEQDTxfsg2TP/iRLrc50sNFvMN/DuzBhCbewO6e37q5ay9AwmBqLh2XH7utCR506Dy90ky00EI/iKRYlIIhi7o3TCmwTD7M9+WX0x2pbhNDNPBWDsIcgYwAXCb4y5fGzYdAgsP3bFYG4gVQmD+fxfDYOVgWwqIeTCcBv+9smnkYUxOJY1dNnVWvD4JgWhKBqQDuBm4oYFCECzvHUinMFYJg/N+JUGx+GsSFKdB0ZsOnHTgTM+9/IUL/uLVtY6K3cW7/DmKIZDuYKyhTwcwAXBr2AsQ2wyB5X3SyieJsG8gNhkQ8zAY0irzoG963vvIfzuMej6MGhAC0RQcAUcA3Dr2AsQugiDVQOw6GE6zMOiko3I1cNcnjxACsXTw4wg4AuBOBsvbvQCpAmLrIXCZaiCfFDYZBuXkitVAe+xf7+v4uaoQ2E9DINc97gdBjoAjAG5rYCycxzkcSU/pMsKuguC8aqCiAtVAbHq8y6qB904eqcF08KWJZRCozoA0gBAAtzcwSi5Kn3rWAWLHIXDWGap9kzEljG2EQDlZUjh+7lXUkbT7o+WKITBachKCrnuWTv3xTaGABhAC4NaxBhB7C4LFM1TD++QFU8LYqihLQnr8XC/40Uh6Is0+Wm5bznQz4/KTpJ96knM87HFzmdIAQgDc0XOYTmDsMwTmU3FMCWNHD9f89JBnkp7tY41V/u88ka6nlpx8CLryRlNI569NGkAIgLtGJzDqEASZEkb5YTjr1wOvNTcNkpmeuOBH2VTwzquA2UM9fu10SVMISi8pNIAQAHcwCNEJjJqFQKaEkVdCZv16aBB0aXew65uOevKj77SfPQLzLWloCkH5FqABhAC4zYGHTmDUMgQyJdz1R59iz+SmQeMk6G351zRo3CsEwfX/NVKQooJ+56RkXz8uTSGoQAMIAXAHD1w6gVHTIMiUcBe/eIV+Gv6uoiVfeEt+/9iS/6r4v6MlX4SgN8orww/8N0Zpuu9ZkDOaQnD7YkIDSBOHrlHwjfrC8mmWJOifH1vyb/4Hp39mwSlqdo26M8l94xReXeuo99iPeqZBkAYxKMrx4tKm8Oclm4R0OvTY6WrWbx1GDSQNXPAjM302DenpH+uMgT2TQkirzadO432NgVkAdH+SPrPgXz8yHU6kKGZlujLWRZ9VvqMlX5xIl/nLMJ9O/VmD/+6ORhDU8sJcNCVM12Rbwl/sl8LfyyjLNw0v/8orw/mU6UOmg+syC1LRFMJ6wC4GQRpACIC7HXtpBEH9g2DVlDDnqbaj8mGSJiENPnn4+8Yp5JuGl3/FLBwqmzKND58um9TlOmc9ILcEDSAEwF0MNjSCoHEhsHyeqpeM5pDmhr/CvmcnxfC34FoIUrqPXrTkNAS9e2BTSG3GvDPWA3YdDSAEwB0+WGkEQYNCYMV5qjSHND0IZtNe2ZrPuML1EPrSz7FFD8yqTaL7xv6AXbkPaAAhAO7DhBNB0BTFEMh+ga0ZQPvrrHtq43QZ6wE7Fvw4AYQAuO8xh0YQNC0E0hyCtk6XsR6wg0FQaUWb4EcA3O1gQyMIGvqQpDmkHdZ9AW3zzMVZ9XpAtFefBhAC4C4foDSCoBUhsLI5hBDYtBfQlcbRGDc2cxHrem1Lt+sBJ0GXZkwFt1G+/u+9GLMIgHsYgKP06ePmT2WjoyGwqjmEENi4F9AnebBb9M+eKV0jNZE+dQ+vAvbrfG0rWw/IVHALgx/r/wiANTFhHSCabGYIZJuY2r+ASnom6Vn24HPzQmC+Vcx51GF2GsjTJCiudRpIQzovmQpueRBk/R8BcM+DsLEOEG0MgWwTU+Nx57YK+MQFPzqPOnTZJtBVp4AUw18S/HnfdBSyP2fFQNWYygtTwZ3A+j8C4F4HYNYBonUhkG1imjEGBcn1TUdT+dfDqOfDqEHVKSCl8Hc4kcJDzsttytFbTAW3F+v/ms83fhBmHSBaFgKzis7lMCZfJNLAyY/6pqMsNHCd1+sp6CZR0ZmOevIX06DxMCanXnqXd/pOpZhIT5Pgv310G/4e/D02qfISo9zodir448Cmwc295LMq9DRozPq/hgfAGNdbg1IzrANEa+SVbOc0ljQ+j8mLD1nlKHGEwBq+hbqQzkYMzDQIwV8kaei786JqpsEkrftt5Ptryl6C+fV8Il3/yZITBf+tmT6bhtWnwFGnd5/b9X/MvDWTeWv+F8c6QLQ1BNIh3JjvyyVBcRoUe6aBNx0Uf/VMg2ka/lxXr2eVpoI961ubjvV/TQ+A06BxU29C1gGi7Q9Ntolp1niUj0lVv6h23XYFB+mnyNqx5n6PrP9rRwDsWfLfOuln75q7MJd1gGgzQmAzg2D5F5/LbVews+SUhpBGBnj2/2tTAOynb2Jt+PJYBwhCIFD/IBjE3oDNDoLs/9eOAOhaMofPOkAQAoHah7+bhhD2Bmw01v+1IQBOG179Yx0gCIGEQDQrBIqGkMZi/V+LAmBrBhXWAYIQyICM5gQJGkKa9n2x/x8BsNZYBwhCIFD3F3YaQprMs/6vXQGwFV8k6wBBCCQEolFBkIaQBsmnf2MLThHDbQBs9GLO8jrA75Sex0kQBCEQbZUfNdfgcZuGkKYEv9L2L19JY6Z/WxAAp7eJvvFfZL4O0EkJXy0IgYTANmvDchcaQhoWBNn+pV0B8CtpHC35t9Ogf2nJjZcwDQxCICGwzZzk2jTO0RDSGGz/0qYA6JxiX/pZLdkOpmcasB0MCIGEwFYGvxZue1XVEEIVsIYhne1f2hcAs//RmkTPdjAgBBICWx8EWzjO5Q0hVAFrFvzY/qXdAXCq1n2RbAcDQmAhBPbTEMiAzThX1/B30xBCFbC22P6ljQGwhW/HbAcDQuDdEHhposOypeNc66qAas8Z9a3A9i8tD4Ct6AJmOxigMgTmHZZsttuKkFReB/ikDeNcsQoYLTmdBo2pAu45+JWmf9n+paUB0LVwHSDbwaDrznQTDIqb7TJ4t2Sck/RM0rO2VQGzxkSqTfXB9G9bA2CSPhB+blnJne1gQEgodFhOLTn5EHTljaaQFnyveRXwScyqgNLNdiqNFyWfTTlyne7/u2D6t60BMCu5v8umiN41veRe3g6GaWAQFm4326UzuGXfrWSWVQHbUJ3Jx+psf1qaQfYZ/Jj+bX8AzG+6fssqgEwDA3cfrGwP07rv9KYK6IIfvYo6kuTa8LKbhQyaQeqB6d82B8Ds/2jj7t5MAwMZtodpZwgMQa5vOuoFPxq1YCq43AzShpmppmL6tyMBMNsLsBU3GNPAwNIhkO1hmv+Qzsfvm6ngM7WiChj67Vub3oxrKpv+DUHvmP7tQADMtKoKyDQwMD8Esj1MO154p0HKp4LPow7z77gFDyjOnd3vy0Vg+rcDATC5LfW27YtO2rZZKvBQZ2wP07oQGJROBSfBnxdDYJNnPqZck/vWJ4S3OAAW1lu8a9N6i/I08Kglm6UCG7o/2B6mbaLcRAp902ExBDZ53OuJ8Xp/l5OCk35+z1Y87Q2AxQdCG9dblDZLZTAB7oZAtodp11PbEik8Mh1O5V8Po54PY3PXQHOm+x4uodv1f9fRktMT6R3r/1oeALP/0FebtoK5u00CzSBARQikM7h9IXASFJ105OUvXPAXr651lH/XDQoiNknXcDNe7/wSut2Gh+DXkQCYrbdo3Xy/k4xmEKAancFtTPZyIShGadA3PbfH/nVTmkPyF/SR0hd3Mz1NgqJzBMEdfPZ3Nn8+ka6p/nUkALa4EURiT0BgqRBIZ3BLMmDaHRwn4f66wLo2h2R/pzxwpNvaUAHch3zzZ5aDtD0AtrURJB8E2RMQWOyMzuBWhkC5dF3grOaQOoyF+d/DOUXnFM6jDl3wIzM9ofq34++CzZ+7FQALg0Vs68ab7AkILAwL9zqD+8Z6wJY81Wc2h+wrCOb/zkLwi8OowTDq+VT+dd90FNJqIOFvN98HZ/92jK9IhK1qBCnJp4F/FZUNoDIExih97XR5HpPjSfCvzfTZNGbVJDQ6BE6iojMd9eQvpkHjP8fk9G/S2DmN81BWfBnYVvAr/zuGUYO/kwbvgx/2TIMgDSZBUVxze8kF+ebPzJR1LAC2sRGkOA0cgh+OLPn81OkX3m6A6hCYrwccxuQkBP9Dz/SbKVNxLfhy0+YQMw2caZDIX7g5QXATYbAcIvI/7zzqQJIS6akLfphkfydJClxre3pHYPq30wGw0AjycfvGvjt7Av7K1w9UO5PiWZQb3a4H/DikG8LyUG7JC7EkLQqCVQFuXihc5vcOowaSBtO02vdU6TF2B3nwC6LavPPgl03/JkFvxfRvh94HK27ekXTkgr/omQZtWoAbo2LPFEPQVc+SL4+d3nKRAzPvFyfJ/Un6zIJ/3TcdJlIQxyq26sEvSd7kgiSTxvkaMC+9k6Rjp7fLBL1ZwXAYNXgs2VSKebUvn+btKZ1yygMpwW/vAfAvfUv+4Sunv/BsbD9fdQN/F/XzpKVr5NgTEFjyXrm/HvD8kelw4hTF2qC2fMdOhQBmpoGZBtPgv5dJ06B3w5iGwZ7kshAXixXCctjzkiv83qcu+OE038tPMitM84bS3wN7DIHZ0W9M/3Y4AEqtbwSRaAYBlg6B+XpAmkK6EwS96cClgfAgBH+RZMHPm5wrhUIpXTuehz2Znr5P/xznJGemgUv/TBX/HVw/NQl+t92/v9L927H7vnQhOOcUz6MOkuAvvemTtu3BlE0DKwRdRppBgKW8jLJvnMIw6rkL/gdLm0J4iLc4FNxUCazQEKJ0IWgIGpe3C8vDnpXeqvPAVw6b4JmI/apcy9PyE0HKzSAMRsACZ2wS3a3KgEv338sbRvJfk6A4zXZU8KaD4q+eaZCdPBKL/0zxzyL81S/8cfQbATC/6Vt7IkhxYEvSbRCecDIIsPR9wybRhMHKUDgv7BH4GoOj37oeAIuDfXYiSGsvBppBgLVCYPza6dJbcjwJurS0MkgIJBQS9hqK5g8CYNV/0VfLNoSukDeDsK0FsGQIzJtCoiUnIei6Z3fXjAFoQPDLpn9D0DXNHwTAO97fvhW071zgwskgLvjhSHrCNDCwnLPq9YAAmhYC0+f7T5J+IvgRADuxDvDmZ73bDEIVEFjuBerOesBJ0KUZU8FAY4IfzR/QnApg29cBFptBIlVAYJ0QGL92umQqGGgsmj8IgDP/y9avA3SSGVVAYN1KAlvDAE28d2n+IADO+y/bvA5QogoIPPD+YWsYoHkvbTR/YHYALK8DnAaN27oOUKIKCDwwBLI1DNCkECiFQPMHAXDR4N6XflaLS8RUAYGHh0C2hgEaEPwK1T9H8wcBcIk3Bd/maeCbh9jdKiDhD1jBGVvDAM0IgXerfzR/EACr3+pjlPtKaZt4q7eD4Xg44KH3EFvDAHUOflT/sGwALA7sbT8W7uZn5Xg44KEhkK1hgLqGwLsbP1P9IwAu9Zu6cCxcjuPhgIdVGpgKBup1T7LxM9YLgG3fDkbieDhgQ/cRU8FAfbHxM5YLgF3bDkbieDhgQyGQqWCgRtj4GSsFwOKA3vbtYLKfky1hgE09cDglBKjDfcjGz1g/AGZvD53YDkZiY2hgAy9TnBIC1CUEsvEz1gmA5e1gWn8qCFVAYJMhkFNCgH0FP7Z+wUMCYHEw78I08M3PSxUQ2EgI5JQQYI8hkI2f8dAAmF1I3TgVpKIKmL1NUQUEVnTGKSHA7oMf1T9sIgB2bRr45ucuVAG5aYC1X6jYGgbYRwik+oeHBsDiQN6VaeDS8XCjV1FHkhxVQGDtEMjWMMAugh/VP2w6AGZvFN3pBnZyIcj1TUe94EcjGkKAhz6YmAoGdnGvUf3DpgJgV6eBo6Rp+r9oCAEe9kLFVDCw/Zes2DOJ6h82FgCLg3inuoGd3DRIbAsDbCwEMhUMbOsek9TTbaWd6h82FgClbk0DF24qtoUBNoSpYGAr91U0U5wEXU4tOTmh+odNBcDOdgOzOTSwyfuJqWBgC+GvcOTbyddOl5Ii4Q8bCYDFAbxL08A3PzdVQGCTIZCpYGCTIbDQ+EGBAlsJgNmFlk8Dd2J9AZtDA1t4YDEVDGziPrq37UvhRQvYTAAsTwOHoOsuTAPf/PxsDg1s6qWKqWBgUyGQbV+w7QBYGrzTUnNHmkHYHBrYSghkKhhYN/ix6TN2GQDzKuCJdN2lZpA8BLI5NLDxhxhTwcC69w/VP+wqABbCUOhiMwibQwMbfaliKhhY78WJTZ+xnwCYhaFONYNkD6x7m0NnNyOFC2D9EMhUMLDKfSM2fcYeAmDXm0Gym4+GEGCDmAoGlr5X2PQZ+wmApTf3TjWDZD83DSHAZu8ppoKBJcMfmz5jrwGwy80geQikIQTYeAhkKhhYFALZ9Bn7DICFQbuTzSDZTUhDCLDp+4qpYGDWvXGv8aPw8gTsNgBmQahzzSDZTUdDCLDZe4qpYGDW/SEaP1CTAEgzyM1NSUMIsNkQyFQwUEDjB2oVAEsD9k8hbQbpXBWQhhBgKw88poIB3Z36pfEDtQmAxWYQ19UtYSoaQgoPMADrvVQyFQzo/tQvzxbUIgAWBuygjlYBpfsNIbyZARsJgUwFo9Oqpn6LL0nAXgMgVcC7DSFMBQMbfQCWp4J58KEz4Y+pX9Q6ABZCUFAHN4YuhkCmgoGN3lN3poI/BF31TSYegOjC9S+mftGAANj1jaFv3tjEVDCwhRAYv3a69JYcT4IuTawHRMufJUz9oikBsDBYd3Zj6OznZyoY2EIIfBllx05XrAdEF8IfU79oXACUursxdDEEMhUMbNaZbo5aZGsYtPsZIqZ+0bAAyMbQd0LwvangM3ETAw8ZXyS2hkHLnx1M/WJHLxnbuHidc4rDqI9j8D940+E0yDnXvfCTlfFjCPqxZ8mLY6crdm4HNjbGPHfB/2Cm30xDWnnn00ELnhkKQb9GSz4/dXrDMwPbsK01gJ3fEqbwWbigdCo4Cf6c9YDA5kKgmApG254ZYuoXDQ6AhfDT6Y2hb59UcpOg8Mh0yHpAYDMvmRJTwWjdSw1Tv2h+AKQKWM6AcqwHBDYeAjklBK0Jf3T9ohUBsDBIUwXU/a1hzqMOv3EKVAGBBz84mQpG858RUmTqF60JgFVVwC6/obMeENj8GCMxFYzGp7/YN9mHoCumftGKAFgYpANv6BnWAwLbCIFMBaOZj4SoaErX/XlLjpn6RWsCYLEKyBt6ngFZDwhs4UFangrmAYrah7/iur9jp6uXUUb4QysC4Kw39C43hMxaD/gy7ub7AFp4T92ZCv4QdNU3mXiQos7XbcW6vzNeXNCmAFh+Q+/8tjC6vx6QphBgcy+a3pLjSdClifWAqG36Y90fuhEAi2/obAuTJ2K5iRT6pkOaQoDNjDMvo+zY6Yr1gKjt0M+6P3QpABYGaLaFuRsCLaEpBNiYs7Tqx9YwqG34Y90fOhcA2Rx6VgakKaRFg7ub94tPaDfjjMTWMKjp9cm6P3QxABYGaKqAdz8PmkJaEvycS6dxZv0iEO40BLI1DOqW/lj3hzq9jOznYSnJjaRDF/wPZvrNNKRBqPODg+Q+BF15S47zqYFvHCG57uEvH8CHUQM/475KpHjqNK64F3gAbG+c0Uj6jQv+h77p+SQoyPFihb1cj7FniiHox54lL46dropjB9CZAOic4jDq48LAHOWoiMgpeMkmhMBGhb9h1EDSwAU/7JmeJkGxcH9Fb3LToHfRklMvvetJ7r0U8kBYrAbyQNj8y+afpM8s+NePTIcTKYrqK3Yf/hSCfo2WfH7q9IZxHZ0MgOWBuRf8t2b6bBrkHCGQENiw8PfqWke9x37UMw2CNOjp/oIep3StQwgaRykUA6GkcbEySFVwO9/TedThNPjXjDXY/UWo0DfZJOhNtOTzE+lX7nF0NgCWqifPXfA/9EwfJ0GRgbk6BDJdUK9QoVJlaSppGuZ/P96ycCdpKsmk8TRonFcGJenY6S1BcLPyF6h8rGHZCfYxlgdLXvxR+lFs+QIC4O0anRj8D950yJs5A0cTwl/FEoYQtfjaLTcheJOLaXB8602qqgoSBDc71rAeELzIA9rv4Fe1OTSdesWnFnsE1jxQPJP0bCrFZcJfds274q8kKE6DojcdOOnAmZ57+QsX/MWfo54PowblDmI+/YeNNRwVhx2Fv9ivWMpD+AMB8O7gHMSmrTMyIHsE1i34Oac4kp664IdmevKQqcRiEJwExZBOIQ+c6XlCENxGCOSoOOxinLhz0gfruEEAnDEo55tDs2lrdUBgj8D68ZKL0qduQ/dQuSpIENzeeMNRcdh2+Ks66YPwBwLggjfzfFDmhJC74SBIrm86SoI/JwTuX7aT/2Rb3zdBcHvOqo+KY6zBZu5fTvoAAXCtNycnTgiZ8eHITaTQNx0SAvfvvfRBW56KXycI8s0s/cJ5Zz2gT9cDMubgoekveE76AAFw/UGZhpCZIdASQmBdXlT+lbPdBK5VgiDVwJXGm+J6wKu+aArBA8Nfoenja6dLsWsDCIArDcw0hBACaxv8nFP899JvXej9Tyb9drrDfSsXBcFX1zpiWni1EJivB6QpBJsMf3T8ohmXbQ0fsuKEkLUHHBYa7+T61Ej6vZP/Tz1psK/Ny/Og0jO5nqSJdBmVnKi0hyAPofnYJBoPHIs5wx0EwE0+ZIsnhDAgEwJreG1+rOCvvOlg36fXxKjoJDmTy08WeWzJ6d+yIMhG0kuHejaJxsr3Xs8UQ9CPPUteMAajSazGN1a5Sw/3PiSmg/flsfSoNu8BTk5ObplpYb65ys+PphCsG/7Y7gUEwG0OyOwNSAism2kNt3Uorg+M0qBvet77yH87pElk2TGHphAsf82w3QsIgNsfkNmwlRBY20++hiEw2zw8ToKik448TSJLjzk0hWDJ9Md2LyAAbv0Jy4athMD66tc4zNxMC8+qBjItfF9+z3BSCOaGP7Z7AQFw+2/kEge4byIE8qDfrESKTvo51vyFZFY1kL0DZzvjpBAsGf7Y7gXNvpybkGuyzsvzqMNp8K/ZGmb1Qar4OfIBPfx6lKSRdOSCv+jZ/raCWfHvHb3JhfTNbzwNGk/fJydfP9El10fld+z+JH1mwb/umw4TKYiKOuMquy6gJRoxmHGA+6pPr7QS+Mh0OJV/XW4C4APazDXZTyuAoUF/Z5pEVvh+RVMICH8gAO7fWfW0DOaEwFlNAKwL3NjN01eN1wHOCoHLNokQAmkKgfKNngl/IADu+Y2crWFWG7juNAHYY/+a5pDNeS8F17AqYDEILmoSoRpIU0jn36OjoklxEtJKMOEP7YoIzbshOSVkjUHMSdEbb7GbvA6lm3WAP/RMHzdhHeCc6+POSSKsDaz8rjkppGPjZrbR86/Rks9Pnd4wZqJNrKE3Jh16q6T8tNrDNjGb/1xjfh3GBl+Dy1YDO/49c1JI96ojbPQMAmDdB2O2hlk2ObNNzCavwxjlTqTraMnpNGjsTa7JU4OL1gZ2+TqpagrxIgS2OP2x0TO68JLT0CzD1jAPG9zYJmZj1+B3UZ9Mgv8nb/qkqdPAFT9b7JlcT9IHrpMb+RTgeUxfotgephvjI2Mj2qixgxZbwzzk6c42MZv9OOWb2gwy5/7Kq4Ezr5MuXivFphC2h+lG+GOjZxAAa+iMHfsfFALZJubhLyExyn0ljaMlpyHouunTwOUQKDf7OunqC0NFCGR7mBaHP5o+QACs6QNYYj3gAwa8udvEUA1c6Tr8KaTNIKHt1wkNImwP08JrnL3+0MHLvgVYD/jgz69ym5jiZ8unNP/6k+RG0mHTt4RZ4jqp3C7mZZSdKa0Kdux7Z3uYFlzXPVMMQT/2LHlB+ENXtGKgYj3ggz+/m21iWBe49mcY1OYqoKq3iylWjbt2rbA9TGvCn0LQdbTkhPAHAmADnbEecAOjIesC1w0C+ZYwroVrAauCIA0id0Ig28M09ftjrz8QAHkbx82IyLrA9a/B1lcBiyGQBpHbsafcGUwIbMRYx15/6PoLULsU1wOyT9eDPkfWBa5x7amwFrArxxQW9wycSJdRyYmk8anTuEvXCnsENkvf3d3jknENXdO6gYm38Y19jgvXBVINrPzcgu4uQ+jEtcIJItV7BDL21POFxZzCh6D/+1Gh6YPwh849r7ryNv7IdDiRoggta4yYilWdn9lgylvz3YeLk+T+JH3WC/7brnWkc4IIlcAmXJ9BemdyL164yf8R0+8lMo6BANjSgZjtYTb3YO/yNN+yIdA5xWHU8zZvCzPvWnFS7Jusq9cKIbD2Y1kM0v/TV/L1/+huX2Yl1gCiO1o9GLFZ6wbfFJjmWzkEqiMNIVXXyrwGkS5cK0wH1/v6DFHWl37/Idxd2lJc3sJ4htbfCx15ELNZ6+bfoDs9zbfkdde5hhCulbuoBNb54ry7tOWxJad/yyrV5edHFhwpHIAA2NSH8Z+kzyz41wzCm3mwz5vm6/qAWZgG/rjw4hHVweUHXZ8SJgTW+9r06ZpA5UEwWnLqpXeSdOz0ljAIAmBLHsgMwtt9i6ZBpPrFo4sNIcteK104Ro4QWO8QKEne5KKkadBbb9I06B1hEARABmEsGEDnNYh0eZDsekPIvGula1PCjD/NCYJO6cLdVcIgQRAEQAbhzg6eThLVwPsBULpdg2qmoy6uBay4Vjo5Jcz405wguGoYpCoIAiCDcOcHT6qBlSHQjaRDBf+9Nx10uQp4+8F0c0qY8ad9YVAzmkcIgiAANmAQZqPozQ6aVAPvBkDnFL+L+mQS/D950ycEwPsvDF2aEiYEtiMMTjW/eYSqIAiADRiE2Sh6uw/3LlcDCw1IB9Pgv2cauPKFoXNTwoTA9oTBquYRURUEAbAZg3C+SL+r+7Vt+eE+txrYhUGxsBbwyAV/0TMNqAKWP6TuTQkTAtsTBletChIEQQCsz4OZjaK3PEjOqgbm30ObB8T85/vfon771+DfsA5w8XXSlSlhQmC7gmAeBhdVBZkeBgGwPiGQjaJ3MECWq4HF3ffb/GZMAFz5OunUlDAhsJ1hsKoqOO/EEYIgCIB7fEAzAO9mcCzvvt/2aeHS0XBMAS/1oc2eEv6mhWfqEgLbGwTzMLjoxBGCIAiADMCdGRgXTQu3YTAsHwtHE8hq10nVlHBb1wVWjkFBIYrmtLaMeatMDxMEQQAkBLZ6UJw3LVwcDJs6IJaqf50/DWTNayR6k006sC6waouqaRoYuGZaFgQXTQ+zThAEQEJgJwbF8hTJvLUyTRkQY3rNxJH0mxj8D950yFZDa49Woa9urAvMx6BX1zrqPfajnmkQpEEMiuLaaVUQzMPgsmMfQRAEQEJgq9+MF62VaUIYLAYTzgLe1Ifana1iCksHBpIGTn7Ul44mjEOdHvsIgiAAEgI7MRhWrZWpexgsDtA3D+/gR2w0vrnroytbxRR/HsYhxj6xThAEQEJg1wbDZQ9kL4fBXQ2QVQH03vQdw/RGr42ubBUTo9yZ5BiHujv2LbNOkCAIAiAhsLWD4TphsCoQbmKwnBcyy1N2LODf5sXRnSlhOoQZ+4JoGAEBkMGXAXFhGOxJ7r0Uigup54XClW6c0gB7HnUgSYn01AU/LC7aj2LLl21fE12ZEqZDmLGPhhEQABl8GRBnhMEQNI5S8CZXDoRTKSZSrAqFqxhGDR5Llv15eeh7mgSpZzpwkmj22O21MG9KuE0PQzqEudarguCshhFCIAiADL6dCoP5xV0IhFHpXnKVoXCZf0chQBYDX3SSmWlgSv+gJKR/HuFvHxdC9ZRw2x6GdAhj2YYRQiAIgAy+nQyDxUA4IxSuc9O4YuBTIfQR/Orx/c86YaZN1cCZHcIsTelsECw3jOQvQIRAEAB3MfgSAmsfCMuhcB3FwEfoq+d3Xj5hpo3nTVd1CLM0hXGuuCY2WPLij9KPauHRiSAA1mrwJQQ2NxSudOPwYG3M99yF86ZZmoKKF6B0TWzQm2jJ56dOv1AJBAFwS4MvIRCo7cNwqfOmm/xwZGkKKl5+FIJ+jZZ8fqK0+k0ABAGQEAh07oG47F5qTX1Isi4QFSEwhqCrniVfHju9pQqIHOFkQ75xCi+j7Nil+5BNgq68ZIoKD51uBLCBt10nlwTFkK7fHDjT80T+wgV/8eeo58OogXPpOqkY5fJfDfsZY4xy5bGob7KeyTEWdfC6lyxKnzop4dMAAXCHIZCBF6hXCFwlCDYxDDqnWByLwvvkxSTojZPGZnJiLOqiZCJ92rQXGmz95QCbxoJsoBlW2VQ3+/2NOm5r5rpApoQ7dY1nawEvoyVfsDcgCID7GnhZFwjUOghWbarb5DBYtS6QrWK6dW17k0uC/uItOWIdIHKej2BLyTqbOnLp4vLxeUxefMgXZDtCIFCz+9VJt/s7+uw4PzMdTIP/XlkYHMbbMOhmhMG6hcJ8LDqT3LHT1avr5MUkm5kw47zqDpnwEYAAuKeB9zwmx5M8BEamYIC6B8F1wmAdQ2H2781fSi+HMfkiyWcmTEdUA4EOjnd8BLtR3iaGKRigGcrnTOfHCVZNExfOi4751jKLQuGuA2Jx+m8Y9dyFtBoYpadx3fMRUevrlylgEABrEgJpDgHaFQYLZ0tHb3KrhMJVAuImx/4zpTsX/C9Rv3kkHSj4kUn/Oojp4LZdszSBgABYj5uR5hCghWGwOKguGwqLf94yAXHT/uexDp491VSS/qr+v3YhjnqmpwkzE625RrPq31tZ8uUJp4GAAFiPECixWz/QtjC4ZCi8848vExA3pVCRfOqCH/ZMgyQoOmkapU8Zf1oZAP/St+QfvnL6C9U/3IxRfAR7SN0zmkNYFwg09p6+d78WG0kKoXAw603cTAch+IskDWdbk9z+O52ZBi79e8lJSogF7QuBUnDSz5HnPSrGHewR6wKBDj2MF5zCUawa7kI5pPLi2a5rLVv792u05PMTpn9BAKzljcpu/QC06yMj1xlbyn9Hxqe6XkwKfZNNgt5ESz4/dfqF6V8QAGscAiV26wdQ34BarlLmVUTGqFo92YOXbBJ0FSx58UfpRyk925oPBzm6Tutyv2brAjnAHUA9059iL21WGSdBb5Ogt9Ogcc/kvMnFqJj/4sOqR/jzlhx/7XRJ+EMVFoXWLARqzm79TAkD2Feo6DvZh6ArWfKH/ASURHoask5iMw16SluXi2sLGa92lM+jopOid7fh79jp6mWUOafAJ4T7tzXqejMzJQygHqHC7oaK4u+5WbucBsGnSZB6pgMjDO70e+qZXE/Sh1L4+4bwhxmYAq5rMmdKGEANQkXf7leUYpTLf506jU+d3vQs+VJKfi9LvgxBb6LSaeLsz7g3TcxU8cO/nxgVFRUtPZVmPAl6E94nLwh/WCpn8BE04kanSxjADgcdRWdyJo2nQePp++Tk6ye6rAoV+fF1xTVm51EHUjpFPKsyKLENzaqBr/if82YckzSRLqOSE0ljjnoDAbClITAbXJkSBrCVkOGk2DfZqqGieI7xEmEwOsnMNJgXCLsaCuedLJOfKjMNeutNmga961nyh3xqnvAHAmBLQ+CZ5GZtHB15gwbwgNBRtY5snVAxKwwOowaPJSsdRTczEM4KhW0JiLOmweccIxjKxwZK0rHT26pKLEAAbGEQrJoSphoIYL1BZfaU79kDtxCZFQYXBcL0t6fH1ZVDoVYIiPsOifPWOpb3VKw4M7rynOj3Ujh1GpefCVzIIAB2KARKEtVAAOuGk3WnfB8aBmcFQi+5nuRmhcLSA2xhQFw2JG5L1fF+FUFPs8Je9jnEYuBbFKwBAmAHQmB+81MNBLBq+NvUlO+2AmExFBb/f8sGxFVC4jYerhUhb27Qk6SqsLfsZwUQADsYBKkGAlh+0NjelO8mA+EyQacqIK4aErfxo8wLefOC3rqfA0AA7HAIzAeJWdVAEQSBro8TO53y3VYoXDUYzQqJ2zYv5M372Qh7IABircFyVjXQlK6FIQQC3Qx/+57y3UdA3Hegmvf3I+iBAIitDDh5NfDvpMH77LxOpoWB7gU/J6mOU751Colbe8gS8kAAxD4GvXzwYVoY6Gb4y6t+nBYBgADYsRBYfAtlWhjoRvCbVfUrvxwCIACiI0GQaWGg3eFvXtWv+EIIgACIDgVBpoWBdgY/qn4ACICYGwKLVYBZ08IEQaAZwU+SqPoBIABi5SBYNS1MEATqH/68yQVJVP0AEACxchAsTgvPCoKEQKA+wa883fvYktO/UfUDQADEqiGw+MCgUQSoZ/CTZk/3ll/oAIAAiLWDoGgUAWoR/BZN9xbvXQAgAOLBQZBGEaA+wY/pXgAEQOwsCC5qFCEMApsNf/OCX35/EvwAEACx1SA4b31gT1IUVUFgE8FvXoNH+cWMTwwAARBbD4HFh87N+sA0CD5NgtQzHTiCILBW8JMWN3gQ/AAQAFGLIHgedSBJifTUsY8gsFbwo8EDAAEQjQyC0vx9BAmCwN3QVxX8aPAAQABEo4Jg8UFFwwgwO/h5k3OSpqLBAwABEC0KgzSMANXBL0qaBr31Jk2D3kVLTsU6PwAEQLQ1CGpBwwhhEG0OfsVp3mjJqZfeSdKx01uCHwACIFodBGc1jFAVRNtCX1XwK0/zEvwAEADRqSAoURVEe0PfMuv7Ctc3wQ8AARDdCILFB9+yVUHCIOoa/PLQF8T6PgAEQGCpMLhMVdAIg6hZ6MuDX1VTB+v7ABAAgSWDYPEBWVEVJAyiNqGvPMVbFfoIfgAIgMCKYbD4wCQMoi6hb9EU76wXGgAgAAIrBEHCIPYR+BaFvllTvIQ+AARAoGZhkECIRYEvHxSXCX3Fa5PQB4AACNQ0DIpASOCbE/hC0DhKwZvcMqGP4AeAAAjUPwxGJ5lZeiYxgZDANyvw9ST3Xgqs6wNAAAQaGgaHUYPHkk2luE4gJBQ2M+w9NPAR+gAQAIGWhMF1AiGhsP5Brxj2NhX4CH0ACIBAS8LgqoEw/e1yy4ZCguF2Q1456FWEvSgpEvgAgAAIrBwIveR6kls1FM4LhoTDxeFuVsibEfQ0K+xl31sk8AEAARBYKxAuGwqzm2lmMFwUDpsYFJcJc8uEuwUhb27Qk6SqsEfgAwACILB2IFwUCiVpUTBcJhyuExT3bV6YWyHcLRXy5gW9Vb43AAABENhoKCwHw2XDYemGXDoo7nPQWBDmVg53y4S8Wd8FYQ8ACIDA3kLhoiBSDodFqwbFff7oy4a5VcPdos+WoAcABECgUcFwlfAyLyjWxbJhbpXPh5AHAARAoFPhsIkBaNmfh3AHAARAAFsIVnsZPAhzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwA78/9xndEMgIXhSAAAAAElFTkSuQmCC\\\" alt=\\\"\\\">\\n  <div class=\\\"mb-caption\\\">\\n    <div class=\\\"mb-line1\\\">deepseek Harness</div>\\n    <div class=\\\"mb-line2\\\">Into the Unknown</div>\\n  </div>\\n</div>\\n\";\nwhile (tmp.firstChild) host.appendChild(tmp.firstChild);\ndocument.body.appendChild(host);\ndocument.documentElement.setAttribute(\"data-mar-boot\", \"\");\nwindow.__mbBootDone = function () {\n  setTimeout(function () {\n    host.style.transition = \"opacity 550ms ease\";\n    try { host.style.setProperty(\"opacity\", \"0\", \"important\"); } catch (e) { host.style.opacity = \"0\"; }\n    setTimeout(function () {\n      try { if (window.__mbMarathon && window.__mbMarathon.stop) window.__mbMarathon.stop(); } catch (e) {}\n      try { if (window.__mbIntroStop) window.__mbIntroStop(); } catch (e) {}\n      try { document.documentElement.removeAttribute(\"data-mar-boot\"); } catch (e) {}\n      try { host.remove(); } catch (e) {}\n      window.__mlsDone = true;\n    }, 600);\n  }, 200);\n};\nsetTimeout(function () { window.__mlsDone = true; }, 22000);\n</script><script>/* ===========================================================================\n * dsh-theme-marathon — Boot payload: marathon stage engine\n * -----------------------------------------------------------------------------\n * Extracted from the standalone boot animation (启动动画.html) and adapted for\n * in-page injection:\n *   - every DOM lookup is scoped under #dshMarBootHost (ids are `mb-` prefixed)\n *   - HUD stays in the DOM but is CSS-hidden (display:none) — the engine may\n *     keep updating it without ever throwing on a null element\n *   - Space/Enter/click-to-replay bindings are REMOVED: inside the harness the\n *     overlay must never swallow keystrokes or clicks meant for the app\n *   - when the timeline reaches its end the loop freezes the final frame,\n *     cancels its rAF, detaches its resize listener and calls\n *     window.__mbBootDone() so the host driver can fade the overlay out\n *   - exposed as window.__mbMarathon = { start, stop, cfg }\n *\n * Timeline: intro runs ~7.1s first (engine-intro.js), then start() begins this\n * ~2.9-3.1s sequence.\n * ========================================================================= */\n(function () {\n  'use strict';\n\n  // ---------------- DOM (scoped to the injected host) ----------------\n  var hostEl = document.getElementById('dshMarBootHost');\n  if (!hostEl) { if (typeof window !== 'undefined') window.__mbMarathonBroken = true; return; }\n  function q(s) { return hostEl.querySelector(s); }\n\n  var canvas    = q('#mb-canvas');\n  var ctx       = canvas ? canvas.getContext('2d') : null;\n  if (!ctx) { if (typeof window !== 'undefined') window.__mbMarathonBroken = true; return; }\n  var elReadout = q('#mb-readout');\n  var elLog     = q('#mb-log');\n  var elStatus  = q('#mb-status-text');\n  var elProg    = q('#mb-progress-fill');\n  var elLockup  = q('#mb-lockup');\n  var elReplay  = q('#mb-replay');\n\n  // ---------------- CONFIG ----------------\n  var CFG = {\n    // dense grid (from reference)\n    COLS: 200,\n    ROWS_PER_ZONE: 18,\n    ZONES: 3,\n\n    // square cell size (px) — grid is perfectly square, no jitter.\n    // Matches the reference's 12px radial-gradient dot matrix.\n    // COLS / ROWS_PER_ZONE are derived from this at resize() so the\n    // grid stays square on any viewport.\n    CELL_SIZE: 12,\n\n    // ===== 迷宫结构（递归回溯 + 5×5 tile）=====\n    TILE_SIZE: 5,            // 1 个小方块 = 5×5 cells = 25 点阵\n    MAZE_PATH_RATIO: 0.70,   // 路面 tile 比例（DOT 70%，墙 30%）\n    MAZE_X_RATIO: 2/3,       // 墙 tile 中 X:PIN = 2:1\n\n    // ===== 面板（大块）：动画闪烁单位 =====\n    // 大块 = PANEL_TW×PANEL_TW tiles（25 个小块一起闪烁）；每 zone = 1 行面板。\n    // 右上（zone 0）与下中（zone 2）放 PANEL_SPECIAL_W 宽的特殊面板，其余按 5 分组。\n    PANEL_TW: 5,             // 正常面板宽度（tiles）\n    PANEL_SPECIAL_W: 15,     // 特殊面板宽度（tiles）：右上 / 下中\n\n    // glyph patterns\n    PATTERN_COUNT: 3,  // 迷宫：0 DOT(路面), 1 X(墙壁), 2 PIN(墙壁)\n\n    // glyph size & style（与网格符号测试页对齐：cell=24, scale=0.5, line=3.0）\n    GLYPH_SCALE: 0.90,   // 符号大小 = CELL_SIZE × GLYPH_SCALE（=10.8）\n    PIN_SCALE: 0.20,     // 小圆点 pin 半径 = size × PIN_SCALE（=2.4）\n    LINE_WIDTH: 1.8,     // 空心/线条符号线宽（px，绝对值）\n\n    // colors\n    colorBg:    'rgba(0,0,0,0)',\n    colorBlue:  'rgba(0,0,0,0)',   // 纯蓝背景（衔接前面的 solid-bg）\n    colorLime:  '#C0FE04',\n    colorRed:   '#FF003C',\n    colorGray:  '#4D6CFE',   // 蓝色点阵\n    colorFlash: '#FFFFFF',\n\n    // static background dot-matrix (always underneath)\n    // Aligned to CELL_SIZE so bg dots sit on the same grid as the cells.\n    BG_SPACING: 12,\n    BG_RADIUS: 1.0,\n    BG_ALPHA: 0.18,\n\n    // timeline (ms) — tuned for snappy feel\n    PRE_DELAY:   200,\n    DOT_START:   400,\n    DOT_SPAN:    1000,\n    DOT_FLASH:   20,     // per-region white flash（越小越快）\n    DOT_SETTLE:  40,    // per-region settle to gray（越小越快）\n\n    RED_START:   900,\n    RED_SPAN:    800,\n    RED_RISE:    180,    // per-region fade-in\n    RED_HOLD:    400,    // per-region hold\n    RED_EXIT:    280,    // per-region dissolve\n    RED_END_PAD: 250,\n\n    // ===== 结尾：贴在 UI 上的故障标记（侧栏十字 + 输入框填充块）=====\n    // 十字不再贴屏幕四边，而是铺在左侧栏矩形内（与迷宫用同一套 12px 网格）；\n    // 输入框被一片**小方框**铺满（同一套网格、同一档尺寸）。扫完后标记常亮保持 UI_HOLD，再与整块黑幕同时淡出\n    // —— 标记按 UI_MARK_LEAD 倍速先走，界面从黑里整体升起。\n    UI_ANCHORS: {\n      // 侧栏根元素在指针进入侧栏时会摘掉 _quietBars，打开会话后更是整个换掉\n      // （真机取证 .generated/probe-bgwho.cjs：active 相位侧栏根只剩 _root）。\n      // 所以兜底一定是 _sidebarCol 本身 —— 两个相位都在，矩形都是整列。\n      sidebar:  ['[class*=\"_quietBars\"]', '[class*=\"_railIn\"]', '[class*=\"_sidebarCol\"]'],\n      // 输入框：这张表保留历史顺序（uV2eYG_* 是旧构建里的卡片与其居中容器），\n      //  但**现役构建里 `uV2eYG` 一个字节都没有**（全量搜 app.asar：0 命中），\n      //  所以实际命中的一直是 composerStack / composerHero —— 那是**整段条带**：\n      //  比卡片左右各宽一圈留白、高出一整块（hero 实测 903x264，卡片只有 780x118），\n      //  方框因此铺到卡片之外（\"超出了应有的区域\"）；打开会话后这条带子一路顶到\n      //  中栏左沿（x≈276，正是侧栏右沿），方框于是与左侧栏的十字贴在一起/压进去。\n      //  真正的卡片在现役构建里叫 `RlGAzG_card`（ui-conversation），由 composerRect()\n      //  按\"类名 token 以 `_card` 结尾\"在 composer 栈里就地量出来（fileCard /\n      //  cardWorkspaceTrigger 这类干扰项因此被排除）；下面这张表只作兜底。\n      //  真机数据：hero 卡片 780x118@y471，active 卡片 780x94@y854。\n      composer: ['[class*=\"uV2eYG_card\"]', '[class*=\"uV2eYG_root\"]',\n                 '[class*=\"composerStack\"]', '[class*=\"composerHero\"]']\n    },\n    UI_CROSS_STEP: 2,       // 十字间距 = CELL_SIZE × 该值（1=12px，2=24px）\n    UI_CROSS_DENSITY: 1,    // 网格里实际画的比例（1 = 全铺，0.5 = 随机一半）—— 十字与方框共用\n    UI_CROSS_SCALE: 0.34,   // 十字臂长 = 间距 × 该值\n    UI_BOX_SCALE: 0.34,     // 方框边长同公式（边长 = 间距 × 该值 × 1.7，与十字同档大小）\n    UI_BOX_PAD: 0,          // 方框网格相对输入框矩形外扩（px，可为负）\n    UI_MARK_ALPHA: 0.9,     // 标记最大不透明度\n    UI_MARK_IN: 350,        // 标记淡入时长（从 MARK_AT 起）\n    UI_HOLD: 400,           // 红扫结束后标记常亮保持\n    UI_FADE: 620,           // 最后一拍：黑幕淡出时长\n    UI_MARK_LEAD: 1.7,      // 标记淡出速度 = 黑幕的该倍数（>1 = 十字先走）\n  };\n\n  // derived: end of the last red sweep -> hold the marks -> one final cross-fade\n  function computeTimeline() {\n    CFG.SWEEP_END = CFG.RED_START + CFG.RED_SPAN + CFG.RED_RISE + CFG.RED_HOLD + CFG.RED_EXIT;\n    CFG.LOCKUP_AT = CFG.SWEEP_END + CFG.RED_END_PAD;   // HUD / status text timing\n    CFG.MARK_AT   = CFG.RED_START + 100;               // marks arrive with the red\n    CFG.FADE_AT   = CFG.SWEEP_END + CFG.UI_HOLD;       // final cross-fade starts\n    CFG.END       = CFG.FADE_AT + CFG.UI_FADE;\n  }\n  computeTimeline();\n  // NOTE: no per-region \"hole punching\" any more (2026-09-20). The plate — blue\n  // field + black slabs + red sweep — stays opaque end to end, and the ONE\n  // reveal beat is the final cross-fade: the whole plate dissolves uniformly\n  // toward the live app (界面整体淡入) while the UI-anchored marks leave first.\n\n  // ---------------- glyph pattern constants ----------------\n  var PAT = { DOT: 0, X: 1, PIN: 2 };\n\n  // ---------------- helpers ----------------\n  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }\n  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }\n  function rand(s) {\n    var x = Math.sin(s * 127.1 + 311.7) * 43758.5453;\n    return x - Math.floor(x);\n  }\n\n  // ---------------- state ----------------\n  var W = 0, H = 0, DPR = 1;\n  var zoneH = 0;\n  var cellW = 0, cellH = 0;  // declared up-front (strict mode)\n  var baseSize = 0;\n  var cells = [];\n  var tileRegions = [];   // region 列表（现在是面板/大块，每个 = 若干 5×5 tile）\n  var panelAt = [];       // panelAt[tileRow][tileCol] = 所属面板 region\n  var tilePat = [];       // tilePat[tileRow][tileCol] = tile 图案 (0 DOT / 1 X / 2 PIN)\n  var tileRoad = [];      // tileRoad[tileRow][tileCol] = 是否路面\n  var regionsByZone = [];\n  var regionCells = {};      // regionCells[r.regionId] = [cellIdx, ...]\n  var TOTAL_REGIONS = 0;\n  var bgCanvas = null;\n  var raf = null;\n  var t0 = 0;\n  // The blue field is painted once and then accumulated over — see render().\n  var fieldPainted = false;\n  var lastShown = 0;\n  var lockupShown = false, replayShown = false;\n\n  // log events\n  var LOG = [\n    { t: 200,  text: 'INIT NEURAL LINK' },\n    { t: 600,  text: 'MOUNT FS // MARATHON' },\n    { t: 1100, text: 'PARTITION VORONOI GRID' },\n    { t: 1500, text: 'LOAD PIXEL SECTORS' },\n    { t: 2000, text: 'REDACT // SIGNAL LOCK' },\n    { t: 2700, text: 'ROLLING DISSOLVE' },\n    { t: 3400, text: 'SYSTEM ONLINE' }\n  ];\n\n  // ===========================================================\n  //  BUILD: Voronoi region seeds\n  // ===========================================================\n  function buildMaze() {\n    var T = CFG.TILE_SIZE;                    // 5\n    var TCOLS = Math.max(2, Math.floor(CFG.COLS / T));   // 21\n    // 每 zone 的 tile 行数必须严格相等：否则窗口高度不是 5×3 整数倍时\n    // （如 800px → ROWS_PER_ZONE=22 → floor 后 TROWS=13 → 4/4/5），\n    // 下层多 1 行 tile 且最后一行吸收多余 cell 行 → S 路径三层宽度不等。\n    // 用 ceil：每 zone 行数相同，最后一行吸收本 zone 余数 cell，三层对称。\n    var tPZ = Math.max(1, Math.ceil(CFG.ROWS_PER_ZONE / T)); // 每 zone tile 行数\n    var TROWS = tPZ * CFG.ZONES;             // 总 tile 行（3 层相等）\n    CFG.TILE_COLS = TCOLS;\n    CFG.TILE_ROWS = TROWS;\n\n    // ---- 1) 递归回溯迷宫（房间网格在奇数行/奇数列）----\n    // 房间 (rr, rc) → tile (2*rr+1, 2*rc+1)\n    // 房间数 = floor(尺寸/2)：确保 2*rr+1 最大 < TROWS（防止奇数尺寸越界）\n    var RC = Math.floor(TCOLS / 2);   // 房间列数\n    var RR = Math.floor(TROWS / 2);   // 房间行数\n    // road[tr][tc]: true = 路面 tile, false = 墙 tile\n    var road = [];\n    for (var tr = 0; tr < TROWS; tr++) { road[tr] = []; for (var tc = 0; tc < TCOLS; tc++) road[tr][tc] = false; }\n\n    var visited = [];\n    for (var r2 = 0; r2 < RR; r2++) { visited[r2] = []; for (var c2 = 0; c2 < RC; c2++) visited[r2][c2] = false; }\n    var stack = [[0, 0]];\n    visited[0][0] = true;\n    road[1][1] = true;   // 房间 (0,0) → tile (1,1)\n\n    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];\n    var seedB = 20260830;\n    function rndM(s) { return rand(s * 2654435761 + seedB); }\n    while (stack.length) {\n      var cur = stack[stack.length - 1];\n      var order = [0, 1, 2, 3].sort(function () {\n        return rndM(stack.length * 31 + cur[0] * 17 + cur[1] * 7) - 0.5;\n      });\n      var moved = false;\n      for (var d = 0; d < 4; d++) {\n        var di = order[d];\n        var nr = cur[0] + dirs[di][0], nc = cur[1] + dirs[di][1];\n        if (nr < 0 || nr >= RR || nc < 0 || nc >= RC) continue;\n        if (visited[nr][nc]) continue;\n        visited[nr][nc] = true;\n        // 打通：中间墙 tile + 新房间 tile\n        road[2 * cur[0] + 1][2 * cur[1] + 1] = true;\n        road[2 * cur[0] + 1 + dirs[di][0]][2 * cur[1] + 1 + dirs[di][1]] = true;\n        road[2 * nr + 1][2 * nc + 1] = true;\n        stack.push([nr, nc]);\n        moved = true;\n        break;\n      }\n      if (!moved) stack.pop();\n    }\n\n    // ---- 2) 拓宽：随机墙 tile（4 邻 ≥2 路）→ 路，直到路面比例达标 ----\n    var total = TCOLS * TROWS;\n    var pathCount = 0;\n    for (var a = 0; a < TROWS; a++) for (var b = 0; b < TCOLS; b++) if (road[a][b]) pathCount++;\n    var target = Math.floor(total * CFG.MAZE_PATH_RATIO);\n    var guard = 0;\n    while (pathCount < target && guard < total * 40) {\n      guard++;\n      var trX = Math.floor(rndM(guard * 11 + 3) * TROWS);\n      var tcX = Math.floor(rndM(guard * 17 + 7) * TCOLS);\n      if (road[trX][tcX]) continue;\n      var nb = 0;\n      if (trX > 0 && road[trX - 1][tcX]) nb++;\n      if (trX < TROWS - 1 && road[trX + 1][tcX]) nb++;\n      if (tcX > 0 && road[trX][tcX - 1]) nb++;\n      if (tcX < TCOLS - 1 && road[trX][tcX + 1]) nb++;\n      if (nb >= 2) { road[trX][tcX] = true; pathCount++; }\n    }\n\n    // ---- 3) 面板（大块）分组：动画闪烁单位从 tile 升级为大块 ----\n    // 大块 = PANEL_TW × PANEL_TW tiles（25 个小块一起闪烁）。每 zone = 1 行面板\n    //（纵向 = tPZ tiles，tPZ=5 时即\"纵向 5 个小块\"）。横向默认 5 tiles 宽；\n    // 右上（zone 0）与下中（zone 2）放 PANEL_SPECIAL_W（15）tiles 宽特殊面板，\n    // 其余按 5 分组、余数并入相邻面板 → 屏幕像拼装面板一样接连闪烁。\n    function panelWidthsFor(zoneIdx, tcols) {\n      var SPW = CFG.PANEL_SPECIAL_W;\n      function chunk(tiles) {\n        var out = [];\n        while (tiles >= CFG.PANEL_TW) { out.push(CFG.PANEL_TW); tiles -= CFG.PANEL_TW; }\n        if (tiles > 0) {\n          if (out.length) out[out.length - 1] += tiles;\n          else out.push(tiles);\n        }\n        return out;\n      }\n      if (zoneIdx === 0) {\n        // 右上：右侧 15 tiles 宽特殊面板，其余 5/组\n        if (tcols <= SPW) return [tcols];\n        return chunk(tcols - SPW).concat([SPW]);\n      }\n      if (zoneIdx === 2) {\n        // 下中：中间 15 tiles 宽，两侧 5/组\n        if (tcols <= SPW) return [tcols];\n        var left = Math.floor((tcols - SPW) / 2);\n        var right = tcols - SPW - left;\n        return chunk(left).concat([SPW], chunk(right));\n      }\n      return chunk(tcols);\n    }\n\n    // ---- 4) 生成 region（每个面板一个大 region；bbox = 整 zone 高 × tile 列范围）----\n    // 跨 zone 边界 y 方向扩展半 cell（TILE_PAD = CELL_SIZE/2 = 6px）：\n    // 让红波跨越 z = 0/1、z = 1/2 边界时不显示纯背景 1px 缝。\n    // 仅在 zone 边界做，zone 内相邻面板之间不加 — 避开\"亮 1px 框\"全包现象。\n    var TILE_PAD = CFG.CELL_SIZE / 2;\n    tileRegions = [];\n    regionsByZone = [];\n    panelAt = []; tilePat = []; tileRoad = [];\n    for (var z = 0; z < CFG.ZONES; z++) regionsByZone.push([]);\n    var flatIdx = 0;\n    for (var z = 0; z < CFG.ZONES; z++) {\n      var widths = panelWidthsFor(z, TCOLS);\n      var pcol = 0;\n      for (var wi = 0; wi < widths.length; wi++) {\n        var w = widths[wi];\n        var tcA = pcol, tcB = pcol + w;\n        var reg = {\n          z: z, idx: flatIdx++, isCorridor: false,\n          pat: 0,   // 面板不再直接带 pat；cell.pat 由 tilePat 决定\n          px: ((tcA + tcB) / 2) * T * cellW,\n          py: z * zoneH + zoneH / 2,\n          pathOrder: 0, regionId: z * 100000 + wi * 1000 + tcA,\n          redSeen: false,\n          sizeR: 1, dens: 1,\n          bboxHW: 0, bboxHH: 0, bboxCX: 0, bboxCY: 0,\n          tcA: tcA, tcB: tcB, wTiles: w\n        };\n        // bbox = 整 zone 高 × tile 列范围（三层严格等高、面板间无缝）\n        reg.x0 = tcA * T * cellW;\n        reg.y0 = z * zoneH;\n        reg.x1 = (tcB >= TCOLS) ? W : Math.min(W, tcB * T * cellW);\n        reg.y1 = (z + 1) * zoneH;\n        // 跨 zone 边界扩展：上半 / 下半各 TILE_PAD，跨过的 1px 缝被覆盖。\n        if (z > 0)            reg.y0 = Math.max(0, reg.y0 - TILE_PAD);\n        if (z < CFG.ZONES - 1) reg.y1 = Math.min(H, reg.y1 + TILE_PAD);\n        reg.bboxHW = (reg.x1 - reg.x0) / 2;\n        reg.bboxHH = (reg.y1 - reg.y0) / 2;\n        reg.bboxCX = (reg.x0 + reg.x1) / 2;\n        reg.bboxCY = (reg.y0 + reg.y1) / 2;\n        reg.cx0 = reg.x0; reg.cx1 = reg.x1; reg.cy0 = reg.y0; reg.cy1 = reg.y1;\n        tileRegions.push(reg);\n        regionsByZone[z].push(reg);\n        // 登记该面板覆盖的所有 tile：panelAt（归属）+ tileRoad/tilePat（迷宫图案）\n        for (var tr = z * tPZ; tr < (z + 1) * tPZ; tr++) {\n          if (!panelAt[tr]) panelAt[tr] = [];\n          if (!tileRoad[tr]) tileRoad[tr] = [];\n          if (!tilePat[tr]) tilePat[tr] = [];\n          for (var tc = tcA; tc < tcB; tc++) {\n            panelAt[tr][tc] = reg;\n            var isPath = road[tr][tc];\n            tileRoad[tr][tc] = isPath;\n            // 路面 tile → DOT(0)；墙 tile → X(1) 或 PIN(2)\n            tilePat[tr][tc] = isPath ? 0 : (rndM(tr * 997 + tc * 131 + 7) < CFG.MAZE_X_RATIO ? 1 : 2);\n          }\n        }\n        pcol += w;\n      }\n    }\n  }\n\n  // ===========================================================\n  //  BUILD: cell grid (perfect square, NO jitter)\n  //  COLS / ROWS_PER_ZONE are derived from CELL_SIZE so the grid is\n  //  always a perfect square on any viewport.\n  //\n  //  2026-10-02: cellH is now zoneH/rowsZ, not CELL_SIZE — the cell grid must\n  //  EXACTLY tile each zone vertically, otherwise each zone boundary shows a\n  //  `zoneH - rowsZ*CELL_SIZE` px wide pure-blue strip where the blue field\n  //  bleeds through with no cell on either side. With H=952, ZONES=3, the\n  //  math gives 317.33/26 = 12.205 (vs CELL_SIZE=12 → 5.33 px seam per\n  //  boundary). cellW stays CELL_SIZE so the maze tiles stay near-square\n  //  (12 × 12.205 = ~1.7% taller; glyphs are sized off cellW).\n  // ============================================================\n  function buildGrid() {\n    cellW = CFG.CELL_SIZE;\n    var rowsZ  = Math.max(4, Math.floor(zoneH / CFG.CELL_SIZE));\n    cellH = zoneH / rowsZ;                       // exact-tile vertical cell height\n    var cols   = Math.max(8, Math.floor(W / cellW));\n    CFG.COLS  = cols;\n    CFG.ROWS_PER_ZONE = rowsZ;\n    var total = cols * rowsZ * CFG.ZONES;\n    baseSize = cellW * CFG.GLYPH_SCALE;  // = CELL_SIZE × GLYPH_SCALE（测试页：24×0.5=12）\n    cells = new Array(total);\n    var idx = 0;\n    for (var z = 0; z < CFG.ZONES; z++) {\n      var zTop = z * zoneH;\n      for (var row = 0; row < rowsZ; row++) {\n        for (var col = 0; col < cols; col++) {\n          // exact grid position — ZERO jitter for a perfectly neat array\n          var cx = col * cellW + cellW / 2;\n          var cy = zTop + row * cellH + cellH / 2;\n          cells[idx] = {\n            cx: cx, cy: cy,\n            size: baseSize,\n            zone: z, col: col, row: row,\n            region: null, isEmpty: false\n          };\n          idx++;\n        }\n      }\n    }\n  }\n\n  // ===========================================================\n  //  BUILD: assign each cell to its nearest seed.\n  //  With the TRUE Voronoi cells computed in computeVoronoiCells\n  //  below, nearest-seed is EXACTLY equivalent to point-in-cell\n  //  (the Voronoi cell of seed S is {x : S is nearest to x}).\n  //  This guarantees no orphan cells and a gap-free red overlay.\n  // ===========================================================\n  function assignCellsToRegions() {\n    regionCells = {};\n    var T = CFG.TILE_SIZE;\n    var tcols = CFG.TILE_COLS;\n    // 1) 每个 cell 归属到其所在 tile → 所在面板（大块）region；\n    //    图案仍由 tile 决定（路面 DOT / 墙 X·PIN），动画时机由面板决定。\n    var tPZ2 = Math.max(1, Math.ceil(CFG.ROWS_PER_ZONE / T));   // 与 buildMaze 相同\n    for (var i = 0; i < cells.length; i++) {\n      var cell = cells[i];\n      // 按 zone 内行计算 tile 行：保证 cell 归属于本 zone 的 tile\n      // （当 ROWS_PER_ZONE 不是 T 的倍数时，不能直接 floor(gRow/T)，否则 zone 边界错位）\n      var zz = cell.zone;\n      var kz = Math.min(tPZ2 - 1, Math.floor(cell.row / T));\n      var tr = zz * tPZ2 + kz;\n      var tc = Math.min(tcols - 1, Math.floor(cell.col / T));\n      var reg = panelAt[tr][tc];   // ← 面板 region\n      cell.region = reg;\n      cell.pat = tilePat[tr][tc];  // ← tile 级图案 DOT(0) / X(1) / PIN(2)\n      cell.isEmpty = false;\n      (regionCells[reg.regionId] = regionCells[reg.regionId] || []).push(i);\n    }\n    // 2) 每个路面 tile 缺 1 个 DOT（24/25），墙 tile 全画\n    for (var tr2 = 0; tr2 < CFG.TILE_ROWS; tr2++) {\n      for (var tc2 = 0; tc2 < tcols; tc2++) {\n        if (!tileRoad[tr2][tc2]) continue;\n        var reg2 = panelAt[tr2][tc2];\n        var lst = regionCells[reg2.regionId];\n        if (lst && lst.length) {\n          var drop = Math.floor(rand((tr2 * tcols + tc2) * 13 + 5) * lst.length);\n          cells[lst[drop]].isEmpty = true;\n        }\n      }\n    }\n  }\n\n  // ===========================================================\n  //  BUILD: S-path order (zone0 L->R, zone1 R->L, zone2 L->R)\n  // ===========================================================\n  function assignRegionOrder() {\n    // 镜像 S 路径（原始效果）：\n    //   zone 0: L → R    zone 1: R → L    zone 2: L → R\n    // 每个 zone 先按 px 方向排序（块），走廊 region 排到最后\n    var cumulative = 0;\n    for (var z = 0; z < CFG.ZONES; z++) {\n      var dir = (z === 1) ? -1 : 1;\n      // 将 corridor 分离出去\n      var corridor = null, blocks = [];\n      for (var i = 0; i < regionsByZone[z].length; i++) {\n        if (regionsByZone[z][i].isCorridor) corridor = regionsByZone[z][i];\n        else blocks.push(regionsByZone[z][i]);\n      }\n      blocks.sort(function (a, b) { return dir * (a.px - b.px); });\n      // 块按 S 顺序累加 pathOrder；corridor 排最后\n      for (var k = 0; k < blocks.length; k++) { blocks[k].pathOrder = cumulative; cumulative++; }\n      if (corridor) { corridor.pathOrder = cumulative; cumulative++; }\n      regionsByZone[z] = blocks.concat(corridor ? [corridor] : []);\n    }\n    TOTAL_REGIONS = cumulative;\n    // 自适应时间：现在 region = 面板（大块），数量少（~9-13 个）。\n    // 每个面板的闪烁间隔（系数越小越快）：120/110ms 时 9 个面板约 0.96s 扫完。\n    // 想更快就把数字调小（如 80/70），想更慢就调大（如 300/280）。\n    CFG.DOT_SPAN = Math.max(600, (TOTAL_REGIONS - 1) * 30);\n    CFG.RED_SPAN = Math.max(500, (TOTAL_REGIONS - 1) * 20);\n    computeTimeline();\n    return cumulative;\n  }\n\n  // ===========================================================\n  //  RECTANGULAR TILES via cell-bbox + half-cell padding.\n  //  Red blocks are rectangles (4 sides) with 2D size variation,\n  //  tiling seamlessly (each region's bbox expanded by half a cell\n  //  toward every neighbour; the union covers the whole zone with\n  //  no visible boundary lines).\n  //  TILE_PAD 现在声明在 buildRegions 上方（要保证执行顺序早于此函数）。\n  // ===========================================================\n\n  function computeRectangularTiles() {\n    for (var z = 0; z < CFG.ZONES; z++) {\n      var seeds = regionsByZone[z];\n      var zTop  = z * zoneH;\n      var zBot  = (z + 1) * zoneH;\n      for (var s = 0; s < seeds.length; s++) {\n        var r = seeds[s];\n        var list = regionCells[r.regionId] || [];\n        var mnX, mxX, mnY, mxY;\n        if (list.length === 0) {\n          mnX = r.px - 6; mxX = r.px + 6;\n          mnY = r.py - 6; mxY = r.py + 6;\n        } else {\n          mnX = Infinity; mxX = -Infinity; mnY = Infinity; mxY = -Infinity;\n          for (var i = 0; i < list.length; i++) {\n            var c = cells[list[i]];\n            if (c.cx < mnX) mnX = c.cx;\n            if (c.cx > mxX) mxX = c.cx;\n            if (c.cy < mnY) mnY = c.cy;\n            if (c.cy > mxY) mxY = c.cy;\n          }\n        }\n        // expand by half a cell, clip to canvas/zone\n        r.x0 = Math.max(0,     mnX - TILE_PAD);\n        r.x1 = Math.min(W,     mxX + TILE_PAD);\n        // Internal zone boundaries: force a 1px overlap so the two layers'\n        // tiles always cross the boundary (zone z's bottom edge extends\n        // 1px into zone z+1, zone z+1's top edge starts 1px inside zone z).\n        // Both extensions are red so the overlap is invisible. This\n        // eliminates the sub-pixel seam line that was previously visible\n        // at the zone boundary.\n        if (z === 0) r.y0 = Math.max(zTop, mnY - TILE_PAD);\n        else         r.y0 = Math.min(zTop - 1, mnY - TILE_PAD);\n        if (z === CFG.ZONES - 1) r.y1 = Math.min(zBot, mxY + TILE_PAD);\n        else                     r.y1 = Math.max(zBot + 1, mxY + TILE_PAD);\n        r.bboxHW = (r.x1 - r.x0) / 2;\n        r.bboxHH = (r.y1 - r.y0) / 2;\n        r.bboxCX = (r.x0 + r.x1) / 2;\n        r.bboxCY = (r.y0 + r.y1) / 2;\n        // keep raw cell-bbox for reference\n        r.cx0 = mnX; r.cx1 = mxX; r.cy0 = mnY; r.cy1 = mxY;\n      }\n      // 右侧对齐：该 zone 最靠右的 region 的 tile 右边界扩展到 W，\n      // 覆盖网格右侧空隙（COLS*CELL_SIZE 可能 < W），避免透出纯蓝背景形成竖边\n      var rightmost = null, maxCx1 = -Infinity;\n      for (var si = 0; si < seeds.length; si++) {\n        if (seeds[si].cx1 > maxCx1) { maxCx1 = seeds[si].cx1; rightmost = seeds[si]; }\n      }\n      if (rightmost) {\n        rightmost.x1 = W;\n        rightmost.bboxHW = (rightmost.x1 - rightmost.x0) / 2;\n        rightmost.bboxCX = (rightmost.x0 + rightmost.x1) / 2;\n      }\n    }\n  }\n\n  function buildAll() {\n    zoneH = H / CFG.ZONES;\n    // IMPORTANT: buildGrid FIRST — it sets CFG.COLS / CFG.ROWS_PER_ZONE\n    // from CELL_SIZE. buildMaze() reads those, so it MUST run after\n    // buildGrid, else the tile grid won't match the cells array.\n    buildGrid();\n    buildMaze();                 // 递归回溯迷宫 + tile region + bbox\n    assignCellsToRegions();      // cell → tile region, 路面 tile 缺 1 点\n    assignRegionOrder();         // S 路径排序\n    // NOTE (2026-09-28): computeRectangularTiles() is deliberately NOT called.\n    // The standalone cut defines it and never calls it either — it is dead code\n    // there, and the panel rectangles `buildRegions()` already wrote\n    // (reg.x0 = tcA*T*cellW … reg.y1 = (z+1)*zoneH) are what both cuts actually\n    // paint. Calling it here replaced those exact tiling rects with a padded\n    // cell-bbox that (a) overlaps its neighbours by up to half a cell and\n    // (b) is forced 1px across every zone boundary, and the passes paint with\n    // `globalAlpha`, so every overlap composites the red (and the black backdrop)\n    // twice and turns each panel edge into a brighter 1px frame — a visible\n    // 分层边界 around every panel that the standalone does not have. The padding\n    // was there to bridge 12px gaps between neighbour bboxes; on the panel grid\n    // there are none, because the panel widths are exact multiples of T tiles.\n  }\n\n  // ===========================================================\n  //  UI-ANCHORED GLITCH MARKS — 侧栏十字 + 输入框方框点阵\n  //  挂在**真实 DOM 矩形**上，每帧重新量（侧栏收起/展开、窗口缩放都跟得上），\n  //  不再是原来那套\"贴屏幕四边游走成串\"。\n  // ===========================================================\n  var lastRect = { sidebar: null, composer: null };\n\n  // 元素自己（或任一祖先）被隐藏了吗？DSH 在 hero→active 的过渡里用\n  // `visibility:hidden` 停放 composerSeat，那种\"藏着但量得到\"的元素几何仍然正确，\n  // 所以它只是**降级**条件（见 pickRect 的两趟扫描），不是排除条件。\n  function hiddenTree(el) {\n    var n = el;\n    while (n && n.nodeType === 1) {\n      var s = window.getComputedStyle(n);\n      if (s.display === 'none' || s.visibility === 'hidden') return true;\n      n = n.parentElement;\n    }\n    return false;\n  }\n\n  function rectOf(el) {\n    var r = el.getBoundingClientRect();\n    if (r.width < 4 || r.height < 4) return null;\n    if (r.right < 0 || r.bottom < 0 ||\n        r.left > window.innerWidth || r.top > window.innerHeight) return null;\n    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, hidden: hiddenTree(el) };\n  }\n\n  // 按 UI_ANCHORS 的顺序取第一个可用元素。两趟：先只收\"真的可见\"的，都不行才退回\n  // 隐藏但量得到的（启动那一刻 DSH 还在 settling，可见性判定不该让标记整块消失）。\n  function pickRect(key) {\n    var list = CFG.UI_ANCHORS[key];\n    var fallback = null, i, el, r;\n    for (i = 0; i < list.length; i++) {\n      el = document.querySelector(list[i]);\n      if (!el) continue;\n      r = rectOf(el);\n      if (!r) continue;\n      if (!r.hidden) return r;\n      if (!fallback) fallback = r;\n    }\n    return fallback;\n  }\n\n  // 在 scope 子树里找\"类名 token 以 `_card` 结尾\"并且真的量得到的元素。\n  // 两趟与 pickRect 同口径：真可见的优先，都没有才退回\"藏着但量得到\"的\n  // （DSH 在 hero -> active 的 settling 相位把 composerSeat 停在 visibility:hidden）。\n  function cardIn(scope) {\n    if (!scope || !scope.querySelectorAll) return null;\n    var els = scope.querySelectorAll('[class*=\"_card\"]');\n    var fallback = null;\n    for (var i = 0; i < els.length; i++) {\n      var cls = els[i].className;\n      if (typeof cls !== 'string') continue;   // SVG 的 className 是 SVGAnimatedString\n      var tok = cls.split(/\\s+/), hit = false;\n      for (var j = 0; j < tok.length; j++) {\n        if (/_card$/.test(tok[j])) { hit = true; break; }\n      }\n      if (!hit) continue;\n      var r = rectOf(els[i]);\n      if (!r) continue;\n      if (!r.hidden) return r;\n      if (!fallback) fallback = r;\n    }\n    return fallback;\n  }\n\n  // 输入框矩形：先在 composer 栈里找**真卡片**（现役构建 RlGAzG_card，780 宽），\n  // 找不着才退回旧的整段条带锚点（composerStack / composerHero）。\n  // 2026-10-10（用户）：重启后输入框在底部时，方框点阵压在左侧栏的十字上；\n  // 根因就是条带锚点比卡片宽出一圈，左侧整列方框落到侧栏矩形里。\n  function composerRect() {\n    var r = cardIn(document.querySelector('[class*=\"composerStack\"]')) ||\n            cardIn(document.querySelector('[class*=\"composerHero\"]'));\n    if (r) return r;\n    return pickRect('composer');\n  }\n\n  // 选择器全部落空时回退到上一帧量到的矩形\n  // （DSH 侧栏在指针进入时会摘掉 _quietBars，那一帧不该整块消失）\n  function anchorRect(key) {\n    var r = key === 'composer' ? composerRect() : pickRect(key);\n    if (r) lastRect[key] = r; else r = lastRect[key];\n    return r;\n  }\n\n  // 落点是否落在某个矩形里（用来划定两块标记各自的地盘，见 drawComposerBox）\n  function inRect(x, y, r) {\n    return !!r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;\n  }\n\n  // 落点连同自身半径 hw 是否**碰到**矩形 r —— 比 inRect 严一档：判的是符号的\n  // 实体（含线宽），不是中心点。侧栏那侧必须用这一档：中心点差一格时，方框的边\n  // 仍会探进侧栏、压在十字臂尖上（实测 overlay 场景 3 个格子正是这样漏过去的）。\n  function hitsRect(x, y, hw, r) {\n    return !!r && x + hw > r.x0 && x - hw < r.x1 && y + hw > r.y0 && y - hw < r.y1;\n  }\n\n  // 十字铺在侧栏矩形内：落点取全局 12px 网格的**格心**（与迷宫点阵同一套网格）\n  function drawSidebarCrosses(alpha, rect) {\n    var r = rect || anchorRect('sidebar');\n    if (!r) return;\n    var gs = CFG.CELL_SIZE;\n    var step = gs * CFG.UI_CROSS_STEP;\n    var size = step * CFG.UI_CROSS_SCALE;\n    var x0 = (Math.ceil(r.x0 / gs - 0.5) + 0.5) * gs;\n    var y0 = (Math.ceil(r.y0 / gs - 0.5) + 0.5) * gs;\n    var n = 0;\n    for (var y = y0; y <= r.y1; y += step) {\n      for (var x = x0; x <= r.x1; x += step) {\n        n++;\n        if (CFG.UI_CROSS_DENSITY < 1 &&\n            rand(n * 12.9898 + 78.233) > CFG.UI_CROSS_DENSITY) continue;\n        drawPlus(x, y, size, alpha, CFG.colorRed);\n      }\n    }\n  }\n\n  // 输入框被**一片小方框**铺满：与侧栏十字**同一套网格、同一档尺寸与线宽**，\n  // 只是把形状从\"+\"换成小方框（用户口径：与旁边的十字逻辑一样）。\n  // 不是一个大框套在外面（描边），也不是一整块实心填充。\n  // 2026-10-10（用户）：重启后输入框落在底部时，方框会与左侧栏的十字重叠一部分、\n  // 且铺到输入框之外。两处一起收口：\n  //   ① 矩形改用**真卡片**（见 composerRect，条带锚点只作兜底）；\n  //   ② 落点先和侧栏矩形对一次，连符号实体（含线宽）碰到侧栏的整格**直接丢弃**\n  //      —— 十字留住自己的地盘，方框绝不会压进侧栏（窗口再窄、侧栏展开压住中栏也一样）；\n  //   ③ 只有整格都留在卡片矩形内的点才画，方框不再探出卡片边界。\n  function drawComposerBox(alpha, rect, avoid) {\n    var r = rect || anchorRect('composer');\n    if (!r) return;\n    var bar = avoid || anchorRect('sidebar');\n    var p = CFG.UI_BOX_PAD;\n    var x0 = r.x0 - p, y0 = r.y0 - p, x1 = r.x1 + p, y1 = r.y1 + p;\n    if (x1 - x0 < 2 || y1 - y0 < 2) return;\n    var gs = CFG.CELL_SIZE;\n    var step = gs * CFG.UI_CROSS_STEP;\n    var size = step * CFG.UI_BOX_SCALE;\n    var half = size * 0.85;                 // 与 drawPlus 同一公式：半边长 = 半臂长\n    var lw = Math.max(0.9, size * 0.20);    // 与 drawPlus 同一线宽\n    if (half < 0.5) return;\n    // 起点与十字相同：全局网格的**格心**（同一相位，两块点阵对得上）\n    var gx = (Math.ceil(x0 / gs - 0.5) + 0.5) * gs;\n    var gy = (Math.ceil(y0 / gs - 0.5) + 0.5) * gs;\n    ctx.globalAlpha = alpha;\n    ctx.strokeStyle = CFG.colorRed;\n    ctx.lineWidth = lw;\n    ctx.lineJoin = 'miter';\n    ctx.beginPath();\n    var n = 0;\n    for (var y = gy; y <= y1; y += step) {\n      // 整格（含线宽）必须落在卡片矩形内，否则整行/整列跳过\n      if (y - half - lw < y0 || y + half + lw > y1) continue;\n      for (var x = gx; x <= x1; x += step) {\n        n++;\n        if (CFG.UI_CROSS_DENSITY < 1 &&\n            rand(n * 12.9898 + 78.233) > CFG.UI_CROSS_DENSITY) continue;\n        if (x - half - lw < x0 || x + half + lw > x1) continue;  // 不探出卡片\n        if (hitsRect(x, y, half + lw, bar)) continue;           // 侧栏的地盘留给十字\n        ctx.rect(x - half, y - half, half * 2, half * 2);\n      }\n    }\n    ctx.stroke();\n    ctx.globalAlpha = 1;\n  }\n\n  function rebuildAll() {\n    buildAll();\n    // 标记不再预计算：每帧从真实 DOM 矩形量（见 anchorRect / drawSidebarCrosses）\n  }\n\n  // ===========================================================\n  //  PER-REGION TIMING — each region independent (no global sync)\n  // ===========================================================\n  function regionTimings(r) {\n    var n = Math.max(1, TOTAL_REGIONS - 1);\n    var rDotStart      = CFG.DOT_START + (r.pathOrder / n) * CFG.DOT_SPAN;\n    var rRedStart      = CFG.RED_START + (r.pathOrder / n) * CFG.RED_SPAN;\n    var rRedEnd        = rRedStart + CFG.RED_RISE;\n    var rDissolveStart = rRedEnd + CFG.RED_HOLD;\n    var rDissolveEnd   = rDissolveStart + CFG.RED_EXIT;\n    return {\n      rDotStart: rDotStart, rRedStart: rRedStart,\n      rRedEnd: rRedEnd, rDissolveStart: rDissolveStart, rDissolveEnd: rDissolveEnd\n    };\n  }\n  function regionRedAlpha(r, t) {\n    var tn = regionTimings(r);\n    if (t < tn.rRedStart) return 0;\n    if (t < tn.rRedEnd)   return easeOut(clamp((t - tn.rRedStart) / CFG.RED_RISE, 0, 1));\n    if (t < tn.rDissolveStart) return 1;\n    if (t < tn.rDissolveEnd)   return clamp(1 - easeOut((t - tn.rDissolveStart) / CFG.RED_EXIT), 0, 1);\n    return 0;\n  }\n  function regionDotAlpha(r, t) {\n    var tn = regionTimings(r);\n    var dt = t - tn.rDotStart;\n    var flash = 0, dot = 0;\n    if (dt >= 0) {\n      if (dt < CFG.DOT_FLASH) flash = Math.sin((dt / CFG.DOT_FLASH) * Math.PI);\n      dot = clamp((dt - CFG.DOT_FLASH) / CFG.DOT_SETTLE, 0, 1);\n    }\n    return { flash: flash, dot: dot };\n  }\n\n  // ===========================================================\n  //  GLYPH DRAW — 3 patterns (DOT / X / PIN)\n  // ===========================================================\n  function drawGlyph(pat, cx, cy, size, alpha, color) {\n    if (alpha <= 0.02) return;\n    var s = size;\n    ctx.globalAlpha = alpha;\n    ctx.fillStyle = color;\n    ctx.strokeStyle = color;\n    ctx.lineWidth = CFG.LINE_WIDTH;\n    ctx.lineCap = 'round';\n    ctx.lineJoin = 'round';\n\n    if (pat === PAT.DOT) {\n      // 路面：实心大圆（半径 = size/2 = GLYPH_SCALE * CELL_SIZE / 2）\n      ctx.beginPath();\n      ctx.arc(cx, cy, s * 0.50, 0, 6.283);\n      ctx.fill();\n    } else if (pat === PAT.X) {\n      // 墙壁：缩短的叉号（h = s*0.30 ≈ cell*0.27，cell 内留 ~5px 间隙，不与旁边 X 相连）\n      var hx = s * 0.30;\n      ctx.beginPath();\n      ctx.moveTo(cx - hx, cy - hx); ctx.lineTo(cx + hx, cy + hx);\n      ctx.moveTo(cx + hx, cy - hx); ctx.lineTo(cx - hx, cy + hx);\n      ctx.stroke();\n    } else { // PAT.PIN\n      // 墙壁：小圆点（半径 = size * PIN_SCALE）\n      ctx.beginPath();\n      ctx.arc(cx, cy, s * CFG.PIN_SCALE, 0, 6.283);\n      ctx.fill();\n    }\n    ctx.globalAlpha = 1;\n  }\n\n  function drawPlus(cx, cy, size, alpha, color) {\n    if (alpha <= 0.02) return;\n    var h = size * 0.85;\n    ctx.globalAlpha = alpha;\n    ctx.strokeStyle = color;\n    ctx.lineWidth = Math.max(0.9, size * 0.20);\n    ctx.lineCap = 'round';\n    ctx.beginPath();\n    ctx.moveTo(cx - h, cy); ctx.lineTo(cx + h, cy);\n    ctx.moveTo(cx, cy - h); ctx.lineTo(cx, cy + h);\n    ctx.stroke();\n  }\n\n  function listFor(r) {\n    var idxs = regionCells[r.regionId] || [];\n    var out = [];\n    for (var i = 0; i < idxs.length; i++) {\n      var c = cells[idxs[i]];\n      if (c.isEmpty) continue;\n      out.push(c);\n    }\n    return out;\n  }\n\n  // ===========================================================\n  //  RENDER\n  // ===========================================================\n  function render(now) {\n    if (lastFrame && now - lastFrame < 33) { raf = requestAnimationFrame(render); return; }\n    lastFrame = now;\n    var t = now - t0;\n    ctx.clearRect(0, 0, W, H);\n    // hand-over: the intro's flat blue plate fades out on the canvas itself, so\n    // the block stage starts on the same colour instead of popping to the page.\n    if (t < 520) {\n      ctx.globalAlpha = 1 - Math.min(1, t / 520);\n      ctx.fillStyle = '#4D6CFE';\n      ctx.fillRect(0, 0, W, H);\n      ctx.globalAlpha = 1;\n    }\n\n    // ---- the blue field is painted ONCE, not every frame ----\n    // This is the one place where repainting from scratch every frame made the\n    // animation visibly different from the standalone cut (启动动画.html).\n    //\n    // That cut never clears its canvas: a region's black backdrop, its white\n    // flash and its dot matrix all composite on top of the previous frame. So a\n    // region whose bgFade is a nominal 400ms linear ramp actually lands as a\n    // ~200ms snap (alpha 115 at t=600 reached in one step, 255 when stepped\n    // frame-by-frame), the white flash leaves a wash that the backdrop then eats,\n    // and the dot matrix is at full strength from its first frame. Repainting\n    // every frame instead holds every region on its ramp for the full 400ms, so\n    // the S sweep shows three or four differently-tinted rectangles per zone --\n    // the 分层边界 the standalone does not have.\n    //\n    // Painting the field once and letting the passes accumulate restores the\n    // standalone's compositing. Doing it this way (rather than emulating\n    // accumulated alphas numerically) also keeps the red sweep single-pass, which\n    // is what the standalone does: there a region's red always starts after its\n    // backdrop has reached opaque black, and the opaque black repaint that the\n    // accumulating backdrop performs every frame wipes the previous frame's red.\n    if (!fieldPainted) {\n      fieldPainted = true;\n      ctx.globalAlpha = 1;\n      ctx.fillStyle = CFG.colorBlue;   // blue field the maze sits on (was the DOM\n      ctx.fillRect(0, 0, W, H);        // #mb-solid-bg underlay; painted here now)\n    }\n\n    // NO per-region hole punching any more (2026-09-20): the plate stays opaque\n    // end to end, and the ONE reveal beat is the final cross-fade at the bottom\n    // of render() — 界面整体淡入, not panel by panel.\n\n    // Per-region black backdrop fade-in (one region per white flash). It now\n    // stays for EVERY region to the end — a panel reads 点阵 -> 黑 -> 红扫 ->\n    // 回到黑, and the final cross-fade dissolves that black plate toward the app.\n    for (var zb = 0; zb < CFG.ZONES; zb++) {\n      var seedsB = regionsByZone[zb];\n      for (var sib = 0; sib < seedsB.length; sib++) {\n        var rb = seedsB[sib];\n        var rtnB = regionTimings(rb);\n        var bgFade = clamp((t - (rtnB.rDotStart + CFG.DOT_FLASH)) / 400, 0, 1);\n        if (bgFade > 0) {\n          ctx.globalAlpha = bgFade;\n          ctx.fillStyle = CFG.colorBg;\n          ctx.fillRect(rb.x0, rb.y0, rb.x1 - rb.x0, rb.y1 - rb.y0);\n          ctx.globalAlpha = 1;\n        }\n      }\n    }\n    // 底部余量：网格 cell 行数可能不满画布高（ROWS_PER_ZONE*ZONES*cellH < H），\n    // 跟随最后一个 region 同步补黑，并一直保持到最后一拍\n    var lastR = regionsByZone[CFG.ZONES - 1][regionsByZone[CFG.ZONES - 1].length - 1];\n    var lastTn = regionTimings(lastR);\n    var lastBg = clamp((t - (lastTn.rDotStart + CFG.DOT_FLASH)) / 400, 0, 1);\n    var gridBottom = CFG.ROWS_PER_ZONE * CFG.ZONES * cellH;\n    if (lastBg > 0 && gridBottom < H) {\n      ctx.globalAlpha = lastBg;\n      ctx.fillStyle = CFG.colorBg;\n      ctx.fillRect(0, gridBottom, W, H - gridBottom);\n      ctx.globalAlpha = 1;\n    }\n    // Dots are occluded by that region's red alpha so the red block paints clean.\n    for (var z = 0; z < CFG.ZONES; z++) {\n      var seeds = regionsByZone[z];\n      for (var si = 0; si < seeds.length; si++) {\n        var r = seeds[si];\n        var td = regionDotAlpha(r, t);\n        var tr = regionRedAlpha(r, t);\n        // mark region as \"red-seen\" the first time the red overlay\n        // begins to cover it — once seen, dots are PERMANENTLY hidden\n        // for this region (so after the red dissolves, the area shows\n        // pure black instead of the dot pattern coming back).\n        if (tr > 0.05) r.redSeen = true;\n        // 一旦红覆盖过该 region → 其所有 cells 永久 isEmpty（不再绘制）\n        if (r.redSeen) {\n          var idxsR = regionCells[r.regionId] || [];\n          for (var li = 0; li < idxsR.length; li++) cells[idxsR[li]].isEmpty = true;\n        }\n        // settled alpha (gray dot) — hidden while red covers OR after\n        // the red has ever covered this region\n        var settled = td.dot * (0.85 + 0.15 * r.sizeR);\n        if (tr > 0.15 || r.redSeen) settled = 0;\n        // white flash on the region's tile rectangle (one fill, not per cell)\n        if (td.flash > 0.02 && tr < 0.5) {\n          ctx.globalAlpha = td.flash * 0.80 * (1 - tr);\n          ctx.fillStyle = CFG.colorFlash;\n          ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);\n          ctx.globalAlpha = 1;\n        }\n        if (settled > 0.02) {\n          var list = listFor(r);\n          // sizeR scales glyph slightly; baseSize is the base\n          var sz = baseSize * (0.90 + 0.20 * r.sizeR);\n          // draw every filled cell in this region with its pattern at settled alpha\n          for (var i = 0; i < list.length; i++) {\n            var c = list[i];\n            // 用 cell.pat（块内 cell.pat=0=DOT; 走廊 cell.pat ∈ {1=X, 2=PIN}）\n            drawGlyph(c.pat, c.cx, c.cy, sz, settled, CFG.colorGray);\n          }\n        }\n      }\n    }\n    ctx.globalAlpha = 1;\n\n    // ---- PASS 2: red overlay (RECTANGLE per region, no black glyphs) ----\n    // Per-region independent fade-in / hold / dissolve.\n    // Rectangular tiles (not polygons) — sized like marathon-boot123.html.\n    // Adjacent tiles overlap in the seam area (both are red, invisible),\n    // so the three layers have no boundary lines.\n    for (var z2 = 0; z2 < CFG.ZONES; z2++) {\n      var seeds2 = regionsByZone[z2];\n      for (var si2 = 0; si2 < seeds2.length; si2++) {\n        var r2 = seeds2[si2];\n        // 走廊 region 不画红色（其 bbox 是整个 zone，画出来是整屏大红块）\n        // 走廊的 X/PIN 通过 PASS 1 的 redSeen 机制永久消失\n        if (r2.isCorridor) continue;\n        var ra = regionRedAlpha(r2, t);\n        if (ra <= 0.02) continue;\n        ctx.globalAlpha = ra;  // fully opaque at full coverage (was 0.95 — the\n                                // 5% transparency let the static bg dots bleed\n                                // through and formed a visible line at zone boundaries)\n        ctx.fillStyle = CFG.colorRed;\n        ctx.fillRect(r2.x0, r2.y0, r2.x1 - r2.x0, r2.y1 - r2.y0);\n      }\n    }\n    ctx.globalAlpha = 1;\n\n    // ---- PASS 2.5: the final beat. The whole plate (blue field + black slabs\n    // + red sweep + dots) dissolves UNIFORMLY toward the live app, so the UI\n    // rises in one piece — 界面整体淡入 — while the marks leave ahead of it.\n    // `destination-out` erases by alpha regardless of how many layers were\n    // painted above; nothing else would give a single clean cross-fade.\n    var fadeT = clamp((t - CFG.FADE_AT) / CFG.UI_FADE, 0, 1);\n    if (fadeT > 0) {\n      // Settle the plate in one opaque black pass first. `destination-out` on an\n      // accumulating canvas erases a little more every frame, which would compress\n      // this 620ms cross-fade exactly the way accumulation compresses a region's\n      // backdrop ramp. By now every region's backdrop is opaque black (the last red\n      // dissolves at SWEEP_END, 400ms earlier), so settling changes nothing on\n      // screen — it only makes the erase a single, frame-rate-independent pass.\n      ctx.globalAlpha = 1;\n      ctx.fillStyle = CFG.colorBg;\n      ctx.fillRect(0, 0, W, H);\n      ctx.globalCompositeOperation = 'destination-out';\n      ctx.globalAlpha = fadeT;\n      ctx.fillRect(0, 0, W, H);\n      ctx.globalCompositeOperation = 'source-over';\n      ctx.globalAlpha = 1;\n    }\n\n    // ---- PASS 3: UI-anchored glitch marks. 十字铺在左侧栏上、方框点阵铺在输入框上，\n    // 两者都挂在真实 DOM 矩形上（anchorRect），并比黑幕先退（UI_MARK_LEAD），\n    // 读起来就是\"红色十字先没、界面随后整块升起\"。\n    if (t > CFG.MARK_AT) {\n      var markA = clamp((t - CFG.MARK_AT) / CFG.UI_MARK_IN, 0, 1)\n                * (1 - clamp(fadeT * CFG.UI_MARK_LEAD, 0, 1));\n      if (markA > 0.02) {\n        // 两块标记各自量一次：方框那边要拿侧栏矩形做减法（见 drawComposerBox）\n        var markSidebar = anchorRect('sidebar');\n        var markComposer = anchorRect('composer');\n        drawSidebarCrosses(markA * CFG.UI_MARK_ALPHA, markSidebar);\n        drawComposerBox(markA * CFG.UI_MARK_ALPHA, markComposer, markSidebar);\n      }\n    }\n\n    // (intentionally NO drawGridFaint, NO zone dividers, NO scan-line pulse)\n\n    // ---- chrome (DOM HUD, CSS-hidden) ----\n    updateChrome(t);\n\n    // ---- end of sequence: freeze frame, stop, notify the driver ----\n    if (t >= CFG.END + 80) {\n      if (!finished) { finished = true; if (typeof window.__mbBootDone === 'function') window.__mbBootDone(); }\n      raf = null;\n      return;\n    }\n    raf = requestAnimationFrame(render);\n  }\n\n  // ---------------- CHROME ----------------\n  function updateChrome(t) {\n    var total = CFG.END - CFG.PRE_DELAY;\n    var mp = clamp((t - CFG.PRE_DELAY) / total, 0, 1);\n    elProg.style.width = (mp * 100).toFixed(1) + '%';\n\n    var lat = (47 + 0.5 * Math.sin(t * 0.0007)).toFixed(4);\n    var lon = (122 + 0.5 * Math.cos(t * 0.0009)).toFixed(4);\n    var pct = (mp * 100).toFixed(1);\n    elReadout.textContent = 'LAT ' + lat + '\\nLON -' + lon + '\\nGRID ' + pct + '%';\n\n    var st;\n    if      (t < CFG.PRE_DELAY)      st = 'INITIALIZING';\n    else if (t < CFG.DOT_START)      st = 'PARTITION GRID';\n    else if (t < CFG.RED_START)      st = 'LOADING SECTORS';\n    else if (t < CFG.RED_START + 200) st = 'REDACT // SIGNAL LOCK';\n    else if (t < CFG.LOCKUP_AT - 200) st = 'ROLLING DISSOLVE';\n    else                              st = 'SYSTEM ONLINE';\n    elStatus.textContent = st;\n\n    while (lastShown < LOG.length && t >= LOG[lastShown].t) {\n      var d = hostEl.ownerDocument.createElement('div');\n      d.className = 'mb-line';\n      d.innerHTML = LOG[lastShown].text + '<span class=\"mb-cursor\"></span>';\n      elLog.appendChild(d);\n      lastShown++;\n    }\n    if (lastShown > 0) {\n      var cur = elLog.querySelectorAll('.mb-cursor');\n      for (var i = 0; i < cur.length; i++) cur[i].style.display = (i === cur.length - 1) ? 'inline-block' : 'none';\n    }\n\n    if (!lockupShown && t >= CFG.LOCKUP_AT) {\n      elLockup.classList.add('mb-show'); lockupShown = true;\n    }\n    if (!replayShown && t >= CFG.END + 300) {\n      elReplay.classList.add('mb-show'); replayShown = true;\n    }\n  }\n\n  // ---------------- LIFECYCLE ----------------\n  function resize() {\n    DPR = Math.min(1, window.devicePixelRatio || 1);\n    W = window.innerWidth;\n    H = window.innerHeight;\n    canvas.width  = W * DPR;\n    canvas.height = H * DPR;\n    canvas.style.width  = W + 'px';\n    canvas.style.height = H + 'px';\n    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);\n    // Setting canvas.width above wiped the backing store, so the accumulated\n    // plate is gone and render() has to lay the blue field down again.\n    fieldPainted = false;\n    rebuildAll();\n  }\n\n  var lastFrame = 0;\n\n  function reset() {\n    if (raf) cancelAnimationFrame(raf);\n    t0 = performance.now();\n    lastShown = 0; lockupShown = false; replayShown = false;\n    // The plate accumulates, so a replay has to start from a clean canvas and\n    // lay the blue field down again.\n    ctx.clearRect(0, 0, W, H);\n    fieldPainted = false;\n    // clear \"red has covered this region\" flags so dots can appear\n    // again on replay (before the red sweeps back over)\n    for (var z = 0; z < CFG.ZONES; z++) {\n      for (var s = 0; s < regionsByZone[z].length; s++) {\n        regionsByZone[z][s].redSeen = false;\n      }\n    }\n    elLog.innerHTML = '';\n    elLockup.classList.remove('mb-show');\n    elReplay.classList.remove('mb-show');\n    raf = requestAnimationFrame(render);\n  }\n\n  // ---------------- bindings ----------------\n  // NOTE: no Space/Enter / click-to-replay handlers here on purpose — inside the\n  // harness the boot overlay must never swallow keystrokes or clicks.\n  var resizing = false;\n  function onResize() {\n    if (resizing) return;\n    resizing = true;\n    requestAnimationFrame(function () { resize(); resizing = false; });\n  }\n  window.addEventListener('resize', onResize);\n\n  var started = false, finished = false, runClassed = false, runTimer = null;\n\n  // resize() runs at load so the cell grid / regions exist; the render loop\n  // only begins when the intro orchestrator calls start().\n  resize();\n\n  function start() {\n    if (started || finished) return;\n    started = true;\n    reset();\n    // #mb-boot fades in over 300ms (CSS). Only AFTER that fade can the intro's\n    // fullscreen blue layer + host black backdrop be dropped (.mb-run): during\n    // the fade the boot content is semi-transparent, so the DOM underlay must\n    // stay put to avoid ghosting the live UI through it. From .mb-run on, the\n    // canvas owns the backdrop and transparent pixels reveal the app.\n    if (!runClassed) {\n      runTimer = setTimeout(function () {\n        if (!runClassed) { runClassed = true; hostEl.classList.add('mb-run'); }\n        runTimer = null;\n      }, 360);\n    }\n  }\n  function stop() {\n    if (raf) { cancelAnimationFrame(raf); raf = null; }\n    if (runTimer) { clearTimeout(runTimer); runTimer = null; }\n    window.removeEventListener('resize', onResize);\n  }\n\n  // expose for the intro orchestrator (engine-intro.js) and the driver\n  window.__mbMarathon = { start: start, stop: stop, cfg: CFG };\n\n  // keep a debug hook (mirrors the standalone's __engine_state)\n  window.__mbEngineState = function () {\n    return {\n      CFG: CFG, cells: cells, regionsByZone: regionsByZone,\n      regionCells: regionCells, TOTAL_REGIONS: TOTAL_REGIONS,\n      W: W, H: H, zoneH: zoneH, baseSize: baseSize\n    };\n  };\n})();\n</script><script>/* ===========================================================================\n * dsh-theme-mls-desktop — Boot payload: intro stage engine + orchestrator\n * -----------------------------------------------------------------------------\n * Desktop cut of the standalone intro (启动动画.html). The timeline is not\n * duplicated here: every delay/duration is read back from the CSS custom\n * properties on #dshMarBootHost that the keyframes themselves use, so retiming\n * the reveal is a one-file change in src/boot/boot.css.\n *\n * Reveal contract (the whole point of this stage on desktop):\n *      first     the green whale logo, alone on a TRANSPARENT window\n *      then      caption -> the five HUI frames, one after another -> blue tile\n *      then      the blue tile zooms to full screen and hands over to the\n *                marathon stage through one opaque #mb-solid-bg beat\n *\n * Desktop-only duties handled here:\n *   - html/body/#root backgrounds are forced to `transparent` for the duration,\n *     so the Electron window's alpha surface is what shows the desktop.\n *   - the native Windows caption buttons are hidden for the animation and\n *     restored on every exit path (end, failure, dispose).\n *   - `window.__mbIntroStop()` is the single teardown hook the host driver calls\n *     on normal end, on the watchdog, and on plugin dispose.\n *\n * Every desktop-only step degrades to a no-op on a stock shell or in a browser:\n * `dshDesktopBoot.chrome` simply does not exist there, and the animation still\n * plays — just with the window's own chrome and background.\n *\n * If the marathon engine failed to load, the orchestrator still calls\n * window.__mbBootDone() so the overlay is never left stuck on screen.\n * ========================================================================= */\n(function () {\n  'use strict';\n\n  var hostEl = document.getElementById('dshMarBootHost');\n  if (!hostEl) return;\n  function q(s) { return hostEl.querySelector(s); }\n\n  var HUI = [1, 2, 3, 4, 5];\n  var HUI_END_SCALE = 7, HUI_LAYER_STEP = 0.3;\n  var HUI_SPEED = 0.03, HUI_POWER = 6;\n  var BLUE_SPEED = 0.01, BLUE_POWER = 30;\n  var HOLD_MS = 1000;    // how long the flat blue plate sits before the handover\n  var LOGO_FADE_MS = 400;\n\n  var rafIds = [];\n  var timers = [];\n\n  // ---- timeline read back from CSS ------------------------------------------\n  function cssNumber(name, fallback) {\n    var raw = '';\n    try { raw = (getComputedStyle(hostEl).getPropertyValue(name) || '').trim(); } catch (e) { raw = ''; }\n    var value = parseFloat(raw);\n    return isFinite(value) ? value : fallback;\n  }\n  function cssMs(name, fallbackSeconds) {\n    return Math.round(cssNumber(name, fallbackSeconds) * 1000);\n  }\n  var T = {\n    hui:      cssMs('--mb-t-hui', 2.35),\n    huiStep:  cssMs('--mb-t-hui-step', 0.10),\n    huiRush:  cssMs('--mb-t-hui-rush', 2.86),\n    huiDur:   cssMs('--mb-t-hui-dur', 2.80),\n    blueRush: cssMs('--mb-t-blue-rush', 2.88),\n    blueDur:  cssMs('--mb-t-blue-dur', 2.85)\n  };\n\n  // ---- desktop window chrome -----------------------------------------------\n  // Root attribute + the `html[data-mar-boot]` rule in boot.css let the\n  // stylesheet drop DSH's own backgrounds while the overlay is up, so the window\n  // has nothing opaque over its alpha surface.\n  var rootEl = document.documentElement;\n  var forcedTransparent = false;\n  function forceTransparent(on) {\n    if (!rootEl) return;\n    if (on) {\n      if (!forcedTransparent) {\n        rootEl.setAttribute('data-mar-boot', '');\n        forcedTransparent = true;\n      }\n      return;\n    }\n    if (forcedTransparent) {\n      rootEl.removeAttribute('data-mar-boot');\n      forcedTransparent = false;\n    }\n  }\n\n  // Resolved once: `false` means \"this shell has no boot-chrome bridge\" (stock\n  // desktop build, browser, or jsdom in tests), so every later call is a no-op.\n  // `chromeSent` drops repeats: the start hook is called both by this engine and,\n  // as a fallback, by the host, and one IPC per actual state change is enough.\n  //\n  // Two names are accepted. `dshDesktopBootChrome` is the one the desktop patch\n  // actually installs; it exists because `dshDesktopBoot` belongs to the shell\n  // and is exposed in the MAIN world, so a preload cannot add a method to it --\n  // `globalThis.dshDesktopBoot` is undefined in the preload's own isolated world,\n  // and re-exposing the same name throws \"Cannot bind an API on top of an\n  // existing property\". The fallback covers a shell that ever implements it\n  // natively.\n  //\n  // The second argument names the caller. It is optional and exists only so the\n  // shell's stdout can tell this call apart from the packaged-document patch,\n  // which speaks the same two-state language over the same channel; before it,\n  // a cold-start trace showed two identical `boot chrome hidden` lines with no\n  // way to attribute either.\n  var chrome = null;\n  var chromeSent = null;\n  function setChrome(visible) {\n    if (chrome === null) {\n      var bridge = (typeof window !== 'undefined') ? window.dshDesktopBootChrome : null;\n      var boot = (typeof window !== 'undefined') ? window.dshDesktopBoot : null;\n      if (bridge && typeof bridge.chrome === 'function') chrome = bridge.chrome;\n      else if (boot && typeof boot.chrome === 'function') chrome = boot.chrome;\n      else chrome = false;\n    }\n    if (chrome === false) return;\n    if (chromeSent === visible) return;\n    try { chrome(visible, 'theme'); chromeSent = visible; } catch (e) { chrome = false; }\n  }\n\n  function later(fn, ms) {\n    var id = setTimeout(fn, ms);\n    timers.push(id);\n    return id;\n  }\n\n  // ---- zoom engines --------------------------------------------------------\n  function makeEase(endScale, initialSpeed, power) {\n    return function (t) {\n      var p = initialSpeed * t + (1 - initialSpeed) * Math.pow(t, power);\n      return 1 + (endScale - 1) * p;\n    };\n  }\n  function rush(els, startMs, endScale, initialSpeed, power, durationMs) {\n    later(function () {\n      var t0 = performance.now();\n      for (var i = 0; i < els.length; i++) {\n        if (els[i]) els[i].classList.add('mb-rush');\n      }\n      var ease = makeEase(endScale, initialSpeed, power);\n      function step(now) {\n        var t = Math.min((now - t0) / durationMs, 1);\n        var scale = ease(t);\n        for (var j = 0; j < els.length; j++) {\n          if (els[j]) if (els[j] && els[j].classList.contains('mb-hui')) { els[j].style.setProperty('--mb-scale', String(scale)); var bu = Math.min(t / 0.72, 1), bs = Math.sin(Math.PI * bu); bs = bs * bs; hostEl.style.setProperty('--mb-bend-y', (8 * bs).toFixed(3) + 'deg'); hostEl.style.setProperty('--mb-bend-x', (-5.5 * bs).toFixed(3) + 'deg'); } else { els[j].style.transform = 'translate(-50%, -50%) scale(' + scale + ')'; }\n        }\n        if (t < 1) rafIds.push(requestAnimationFrame(step));\n      }\n      rafIds.push(requestAnimationFrame(step));\n    }, startMs);\n  }\n\n  // All five frames start zooming at the SAME instant, each carrying its own end\n  // scale. The standalone does `[1..5].forEach(... run(..., 2860, ...))`, i.e. it\n  // does not stagger the zoom at all -- only the hard-cut appearance is\n  // staggered (2.35s .. 2.75s, via the CSS delays). Staggering the zoom as well\n  // (which this used to do, one frame every 220ms from 1.28s) turns the five\n  // nested frames into a visible cascade instead of one simultaneous flare.\n  for (var n = 0; n < HUI.length; n++) {\n    var order = HUI[n];\n    var endScale = HUI_END_SCALE * (1 + (5 - order) * HUI_LAYER_STEP);\n    rush([q('.mb-hui-' + order)], T.huiRush, endScale, HUI_SPEED, HUI_POWER, T.huiDur);\n  }\n  // Both blue elements start together at 2.88s. The tile's opacity fade-in is\n  // its own CSS animation at 3.06s; only its transform is driven from here.\n  rush([q('.mb-logo-blue')], T.blueRush, 40, BLUE_SPEED, BLUE_POWER, T.blueDur);\n  rush([q('.mb-logo-blue-bg')], T.blueRush, 40, BLUE_SPEED, BLUE_POWER, T.blueDur);\n\n  // ---- orchestration: intro -> flat blue -> handover to marathon ------------\n  var solidBg = q('#mb-solid-bg');\n  var logoBlueBg = q('.mb-logo-blue-bg');\n  var logoTop = q('.mb-logo-top');\n  var caption = q('.mb-caption');\n  if (logoTop) logoTop.classList.add('mb-perspective-entry');\n  if (caption) caption.classList.add('mb-perspective-entry');\n  if (logoBlueBg) logoBlueBg.classList.add('mb-perspective-warp');\n  var boot = q('#mb-boot');\n\n  // The blue plate is fully covering once the slowest zoom has landed\n  // (2.88s + 2.85s = 5.73s, the standalone's SOLID_COVER_AT).\n  var COVER_AT = T.blueRush + T.blueDur;\n\n  function stop() {\n    for (var i = 0; i < rafIds.length; i++) cancelAnimationFrame(rafIds[i]);\n    rafIds = [];\n    for (var j = 0; j < timers.length; j++) clearTimeout(timers[j]);\n    timers = [];\n  }\n\n  // 1) the zoom has covered the window: make the plate opaque and drop the\n  //    scaling blue tile underneath it (blue on blue, so no discontinuity).\n  //    This is also where the page stops being see-through: from here on the\n  //    opaque #mb-solid-bg (then the marathon canvas, which paints the same\n  //    blue) covers the window, so the theme's own field canvas and DSH's page\n  //    plates can come back underneath without anything popping. Releasing the\n  //    attribute this early is deliberate -- holding it until teardown would\n  //    make the dot field reappear only after the overlay had already faded,\n  //    i.e. as a visible flash on an otherwise settled screen.\n  later(function () {\n    if (solidBg) solidBg.style.opacity = '1';\n    if (logoBlueBg) logoBlueBg.style.display = 'none';\n    forceTransparent(false);\n  }, COVER_AT);\n\n  // 2) the flat plate holds for a beat, then the green marks fade off it.\n  //\n  // 2026-09-26 — the fade is declared `!important` because the two marks are\n  // the only intro elements that could ever grow a CSS animation of their own\n  // (they have none today, deliberately: the standalone shows them from frame 0),\n  // and a finished animation's forwards fill sits above every normal author\n  // declaration *including inline styles*. Important inline declarations are the\n  // one thing that outranks an animation, so this stays correct either way.\n  // The block stage must hand over to the live DSH page, not to the desktop\n  // showing through the transparent window. Hold the flat plate until the app\n  // has actually mounted a child under #root (or the shell boot promise fired).\n  function waitForApp(cb) {\n    var waited = 0;\n    (function poll() {\n      var root = document.getElementById('root');\n      var painted = !!(root && root.childElementCount > 0);\n      if (!painted) {\n        try { painted = !!(window.__DSH_BOOT_READY__ && window.__DSH_BOOT_READY__.settled); } catch (e) {}\n      }\n      if (painted || waited >= 20000) { cb(); return; }\n      waited += 100;\n      setTimeout(poll, 100);\n    })();\n  }\n\n  function fadeOut(el) {\n    if (!el) return;\n    el.style.transition = 'opacity ' + LOGO_FADE_MS + 'ms ease';\n    try { el.style.setProperty('opacity', '0', 'important'); }\n    catch (e) { el.style.opacity = '0'; }\n  }\n  var handedOver = false;\n  window.__mlsStartBlocks = function () { handOver(); };\n  function handOver() {\n    if (handedOver) return;\n    handedOver = true;\n    fadeOut(logoTop);\n    fadeOut(caption);\n    later(function () {\n      if (boot) boot.style.opacity = '1';\n      if (typeof window.__mbMarathon.start === 'function') {\n        window.__mbMarathon.start();\n      } else if (typeof window.__mbBootDone === 'function') {\n        window.__mbBootDone();\n      }\n    }, LOGO_FADE_MS);\n  }\n  later(function () {\n    if (window.__mbOverlayMode) { window.__mlsCovered = true; return; }\n    waitForApp(function () { later(handOver, HOLD_MS); });\n  }, COVER_AT);\n\n\n  // ---- lifecycle hooks -----------------------------------------------------\n  // Called by host buildBoot() before the payload runs: hide the window buttons,\n  // make the page transparent, and never leave either stuck.\n  window.__mbIntroStart = function () {\n    forceTransparent(true);\n    setChrome(false);\n  };\n  // Called by host teardown (normal end, watchdog, or plugin dispose).\n  window.__mbIntroStop = function () {\n    stop();\n    forceTransparent(false);\n    setChrome(true);\n  };\n\n  // 2026-09-26 — announce ourselves. The host used to call __mbIntroStart()\n  // *before* appending this script (it appends the marathon engine, calls the\n  // hook, then appends the intro), so the hook did not exist yet, the call was\n  // an undefined-guarded no-op, and neither half of the desktop contract ever\n  // happened: html/body/#root kept DSH's opaque background (so the transparent\n  // window showed nothing) and the native caption buttons stayed visible for the\n  // whole animation.\n  //\n  // Running it at the end of this IIFE is still inside the same synchronous task\n  // as mounting the overlay — classic scripts execute on append — so no frame is\n  // painted in between and the very first one is already transparent. Both steps\n  // are idempotent, so the host may keep calling the hook.\n  window.__mbIntroStart();\n})();\n</script></body></html>";
function mlsBootOverlay(opts) {
	const win = opts.win;
	try { win.webContents.setBackgroundThrottling(false); } catch (error) {}
	let overlay = null;
	try {
		win.webContents.on("dom-ready", () => {
			win.webContents.executeJavaScript("try{sessionStorage.setItem('mar.boot.played','1')}catch(e){}").catch(() => {});
		});
	} catch (error) {}
	let finished = false;
	const bounds = screen.getPrimaryDisplay().bounds;
	try {
		overlay = new BrowserWindow({
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			frame: false,
			transparent: true,
			hasShadow: false,
			show: false,
			skipTaskbar: true,
			alwaysOnTop: true,
			focusable: false,
			resizable: false,
			movable: false,
			minimizable: false,
			maximizable: false,
			fullscreenable: false,
			backgroundColor: "#00000000",
			title: "DSH NEXT",
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: false,
				backgroundThrottling: false,
				spellcheck: false
			}
		});
		overlay.setIgnoreMouseEvents(true);
		overlay.setAlwaysOnTop(true, "screen-saver");
		overlay.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(MLS_BOOT_HTML));
		overlay.webContents.on("did-fail-load", () => { try { done(true) } catch (error) {} });
		overlay.once("ready-to-show", () => {
			try {
				overlay.showInactive();
				const screenBounds = screen.getPrimaryDisplay().bounds;
				overlay.setBounds({ x: screenBounds.x - 1, y: screenBounds.y - 1, width: screenBounds.width + 2, height: screenBounds.height + 2 });
				overlay.setAlwaysOnTop(true, "screen-saver");
			} catch (error) {}
		});
	} catch (error) {
		overlay = null;
	}
	const done = (reveal) => {
		if (finished) return;
		finished = true;
		if (reveal) {
			try { opts.reveal(); } catch (error) {}
		}
		const closing = overlay;
		overlay = null;
		if (closing && !closing.isDestroyed()) {
			setTimeout(() => { try { if (!closing.isDestroyed()) closing.destroy(); } catch (error) {} }, 240);
		}
		try { win.focus(); } catch (error) {}
	};
	if (!overlay) {
		try { opts.reveal(); } catch (error) {}
		return;
	}
	const run = (code) => {
		if (!overlay || overlay.isDestroyed()) return Promise.resolve(null);
		return overlay.webContents.executeJavaScript(code, true).catch(() => null);
	};
	const bootReady = async () => {
		const value = await run("(async () => { try { const b = globalThis.__DSH_BOOT_READY__; if (!b || !b.promise) return true; return (await Promise.race([b.promise.then(() => true), new Promise((r) => setTimeout(() => r(false), 40))])) === true } catch (error) { return true } })()");
		return value === true;
	};
	const painted = async () => {
		try {
			const image = await win.webContents.capturePage();
			if (image.isEmpty()) return false;
			const bitmap = image.toBitmap();
			let opaque = 0;
			let total = 0;
			for (let index = 3; index < bitmap.length; index += 4 * 53) {
				total += 1;
				if (bitmap[index] > 8) opaque += 1;
			}
			return total > 0 && opaque / total > 0.6;
		} catch (error) {
			return false;
		}
	};
	let covered = false;
	let shown = false;
	let started = false;
	const tick = async () => {
		if (finished) return;
		if (!covered) {
			covered = (await run("!!window.__mlsCovered")) === true;
		} else if (!shown) {
			shown = true;
			try { opts.reveal(); } catch (error) {}
			setTimeout(tick, 280);
			return;
		} else if (!started) {
			if ((await bootReady()) && (await painted())) {
				started = true;
				setTimeout(() => { run("window.__mlsStartBlocks && window.__mlsStartBlocks()"); }, 200);
			}
		} else if ((await run("!!window.__mlsDone")) === true) {
			done(false);
			return;
		}
		setTimeout(tick, 160);
	};
	setTimeout(tick, 120);
	setTimeout(() => {
		if (!finished && !started) done(true);
	}, 45000);
}

function createWindow(preload, primary = false) {
	const window = new BrowserWindow({
		width: 1280,
		height: 840,
		minWidth: 800,
		minHeight: 580,
		show: false,
		title: "DSH NEXT",
		...process.platform !== "darwin" ? { icon: unpackedPath(join(root, "build", process.platform === "win32" ? "app-icon.ico" : "app-icon.png")) } : {},
		...!primary ? auxiliaryWindowChromeOptions() : {},
		...process.platform === "win32" && primary ? {
			titleBarStyle: "hidden",
			titleBarOverlay: {
				height: 40,
				color: WINDOWS_CAPTION_FILL,
				symbolColor: nativeTheme.shouldUseDarkColors ? "#f9fafb" : "#0f1115"
			}
		} : {},
		...process.platform === "darwin" ? {
			...primary ? {
				titleBarStyle: "hiddenInset",
				trafficLightPosition: {
					x: 16,
					y: 18
				}
			} : {},
			vibrancy: runtime.preferences.macosMaterial === "transparent" ? "sidebar" : void 0,
			visualEffectState: "active",
			backgroundColor: "#00000000"
		} : {},
		webPreferences: {
			preload: join(root, "lib", preload),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webviewTag: primary
		}
	});
	let intervalStart = Date.now();
	let count = 0;
	let failureCount = 0;
	window.webContents.on("console-message", (event, _level, legacyMessage) => {
		const message = typeof legacyMessage === "string" ? legacyMessage : event?.message;
		if (typeof message !== "string") return;
		const level = typeof event?.level === "string" ? event.level : _level;
		const failure = level === "error" || level === 3 || message.includes("[next-ui-error]") || message.includes("slot entry crashed") || message.includes("slot factory occurrence crashed");
		if (!failure && !runtime.preferences.developerLogging) return;
		if (Date.now() - intervalStart >= 1e3) {
			intervalStart = Date.now();
			count = 0;
			failureCount = 0;
		}
		const currentCount = failure ? ++failureCount : ++count;
		if (currentCount > 100) {
			if (currentCount === 101) runtime.diagnostics.record({
				source: "renderer",
				event: "console.rate-limited",
				level: "warn"
			});
			return;
		}
		runtime.diagnostics.record({
			source: "renderer",
			event: "console",
			level: failure ? "error" : level === "warning" || level === 2 ? "warn" : "info",
			message: message.slice(0, 8192),
			developer: !failure,
			fields: { webContentsId: window.webContents.id }
		});
	});
	window.once("ready-to-show", () => {
		if (primary && process.platform === "win32") {
			mlsBootOverlay({
				win: window,
				reveal: () => { try { window.maximize(); } catch (error) {} show(window); }
			});
			return;
		}
		if (primary) window.maximize();
		show(window);
	});
	applyWindowMaterial(window, runtime.preferences);
	if (primary) {
		window.webContents.on("before-input-event", (event, input) => {
			if (input.type === "keyDown" && input.key === "," && (input.control || input.meta) && !input.alt) {
				event.preventDefault();
				openControls();
			}
		});
		window.on("close", (event) => {
			if (!quitting && runtime.preferences.closeToTray && native.available) {
				event.preventDefault();
				window.hide();
			} else if (!quitting) {
				event.preventDefault();
				app.quit();
			}
		});
	}
	const openExternal = (url) => {
		try {
			if ([
				"https:",
				"http:",
				"mailto:"
			].includes(new URL(url).protocol)) shell.openExternal(url).catch((error) => runtime.report(error));
		} catch {}
	};
	window.webContents.setWindowOpenHandler(({ url }) => {
		openExternal(url);
		return { action: "deny" };
	});
	window.webContents.on("will-navigate", (event, url) => {
		if (!url.startsWith(primary ? "dsh-app://app/" : "dsh-app://shell/index.html")) {
			event.preventDefault();
			openExternal(url);
		}
	});
	window.webContents.on("will-redirect", (event, url) => {
		if (!url.startsWith(primary ? "dsh-app://app/" : "dsh-app://shell/index.html")) event.preventDefault();
	});
	installEditingContextMenu(window.webContents, window, {
		platform: process.platform,
		labels: () => resolveDesktopLocale(windowsLanguage).messages,
		menu: () => Menu
	});
	return window;
}
function openSettings(page = "general") {
	if (quitting) return;
	if (onboarding) {
		openControls("onboarding");
		return;
	}
	if (runtime.recoveryMode || runtime.state().phase === "error") {
		openControls("recovery");
		return;
	}
	pendingSettings = page;
	openMain();
	mainWindow?.webContents.send(IPC.settingsOpen);
}
function openControls(page = "general") {
	if (quitting) return;
	if (page === "general" || page === "tools" || page === "permissions") {
		openSettings(page === "permissions" ? "permissions" : "general");
		return;
	}
	if (page === "recovery" && !runtime.safeMode && !runtime.recoveryMode) {
		rendererRecovery?.stop();
		runtime.recoveryMode = true;
		onboarding = false;
		const previousMain = mainWindow;
		mainWindow = void 0;
		replacingWindow = true;
		try {
			previousMain?.destroy();
		} finally {
			replacingWindow = false;
		}
		const stopping = runtime.backend.stop().finally(() => {
			if (recoveryStopping === stopping) recoveryStopping = void 0;
		});
		recoveryStopping = stopping;
		stopping.catch((error) => runtime.diagnostics.append(String(error), "error"));
		native.refresh();
	}
	const locale = nativeLocale.resolve(runtime.selected, windowsLanguage);
	windowsLanguage = locale;
	const url = `${SHELL_URL}?locale=${locale}&platform=${process.platform}&frame=${auxiliaryWindowHasCustomFrame()}#${page}`;
	const resize = (window) => {
		const creating = page === "create-profile";
		window.setResizable(!creating);
		window.setMinimumSize(creating ? 420 : 680, creating ? 330 : 560);
		window.setSize(creating ? 480 : page === "onboarding" ? 1040 : 850, creating ? 360 : page === "onboarding" ? 720 : 800);
		if (process.platform === "darwin") window.setWindowButtonPosition?.({
			x: 16,
			y: page === "onboarding" ? 18 : 12
		});
		applyWindowMaterial(window, runtime.preferences);
	};
	if (shellWindow && !shellWindow.isDestroyed()) {
		if (page === "onboarding" && shellWindow.webContents.getURL() === url) {
			show(shellWindow);
			return;
		}
		resize(shellWindow);
		shellWindow.loadURL(url).catch((error) => runtime.diagnostics.append(String(error), "error"));
		show(shellWindow);
		return;
	}
	shellWindow = createWindow("preload-shell.cjs");
	resize(shellWindow);
	shellWindow.on("closed", () => {
		shellWindow = void 0;
	});
	shellWindow.loadURL(url).catch((error) => runtime.diagnostics.append(String(error), "error"));
}
function openMain() {
	if (quitting || confirmingDataDirectory) return;
	if (runtime.recoveryMode || runtime.state().phase === "error") {
		openControls("recovery");
		return;
	}
	if (onboarding) {
		openControls("onboarding");
		return;
	}
	if (mainWindow && !mainWindow.isDestroyed()) {
		show(mainWindow);
		return;
	}
	mainWindow = createWindow("preload-app.cjs", true);
	const owner = mainWindow;
	browserGuests.bind(owner, (guest, name) => desktopShortcuts.attachGuest(owner, guest, name));
	desktopShortcuts.attach(owner);
	resetRendererRecovery(owner);
	mainWindow.on("closed", () => {
		if (mainWindow !== owner) return;
		rendererRecovery?.stop();
		mainWindow = void 0;
		onboardingSurfaceActive = false;
	});
	mainWindow.webContents.on("did-start-navigation", (_event, _url, inPlace, isMain) => {
		if (!isMain || inPlace || mainWindow !== owner) return;
		rendererDocumentId = randomUUID();
		rendererRecovery?.navigating();
	});
	mainWindow.webContents.on("did-finish-load", () => {
		if (mainWindow !== owner) return;
		rendererRecovery?.loaded();
		if (runtime.backend.state.phase === "ready") rendererRecovery?.booted();
	});
	mainWindow.webContents.on("render-process-gone", (_event, details) => {
		if (quitting || mainWindow !== owner || owner.isDestroyed() || runtime.recoveryMode) return;
		runtime.diagnostics.record({
			source: "renderer",
			event: "process-gone",
			level: "error",
			fields: {
				reason: details.reason,
				exitCode: details.exitCode
			}
		});
		if (details.reason !== "clean-exit") failRenderer(owner, /* @__PURE__ */ new Error(`Renderer: ${details.reason}`));
	});
	mainWindow.webContents.on("preload-error", (_event, _path, error) => failRenderer(owner, error));
	mainWindow.webContents.on("did-fail-load", (_event, code, message, _url, isMain) => {
		if (isMain && code !== -3) failRenderer(owner, new Error(message));
	});
	loadMainDocument(owner).catch((error) => failRenderer(owner, error));
}
function resetRendererRecovery(owner) {
	rendererRecovery?.stop();
	rendererDocumentId = randomUUID();
	rendererRecovery = new NextRendererRecovery({
		available: () => !quitting && !runtime.recoveryMode && mainWindow === owner && !owner.isDestroyed() && runtime.backend.state.phase !== "error",
		reload: () => loadMainDocument(owner),
		exhausted: (detail) => runtime.report(/* @__PURE__ */ new Error(`Renderer recovery exhausted: ${detail}`)),
		record: (event, fields) => runtime.diagnostics.record({
			source: "renderer",
			event,
			fields
		})
	});
}
function failRenderer(owner, error) {
	if (quitting || runtime.recoveryMode || mainWindow !== owner || owner.isDestroyed()) return;
	rendererRecovery?.fail(error instanceof Error ? error.message : String(error));
}
/** Cancelled or retired window navigations are not Host failures. */
async function loadMainDocument(owner) {
	try {
		await owner.loadURL(APP_URL);
	} catch (error) {
		if (quitting || owner.isDestroyed() || mainWindow !== owner) return;
		const failure = error;
		if (failure?.code === "ERR_ABORTED" || failure?.errno === -3) return;
		throw error;
	}
}
async function reloadMain() {
	onboardingSurfaceActive = false;
	const existing = mainWindow;
	openMain();
	if (existing && existing === mainWindow && !existing.isDestroyed()) {
		resetRendererRecovery(existing);
		await loadMainDocument(existing).catch((error) => failRenderer(existing, error));
	}
}
/**
* Raise the window a modal dialog must belong to, and return it as its owner.
*
* Electron's `dialog.*` overloads that take no `BrowserWindow` open an unowned
* top-level window. On Windows that window disables nothing and is ordered
* against every other top-level window, so one click on the app sends the
* prompt behind it leaving no taskbar hint and no visual trace. Every recovery
* action waits on `confirmed()` before it touches a single file, so an occluded
* prompt is indistinguishable from an action that hung forever: no file change,
* no diagnostic line, no error, and no timeout to end it. Owning the dialog
* makes it window-modal, which is what the recovery UI's own busy state already
* promises the user.
*
* Recovery, safe mode and onboarding all run in `shellWindow` while
* `mainWindow` is destroyed, and `shellWindow` is only open while the user is
* looking at it, so preferring it puts the prompt on the surface that raised it.
*
* @returns the owning window, or `undefined` when no window is alive and an
*   unowned dialog is the only thing left.
*/
function raiseDialogOwner() {
	for (const window of [shellWindow, mainWindow]) {
		if (window === void 0 || window.isDestroyed()) continue;
		show(window);
		return window;
	}
}
async function confirmed(message, detail = t("将停止当前 Host，正在运行的任务会被中断。", "This stops the current Host and interrupts running tasks.")) {
	const owner = raiseDialogOwner();
	const options = {
		type: "question",
		title: "DSH NEXT",
		message,
		detail,
		buttons: [t("继续", "Continue"), t("取消", "Cancel")],
		defaultId: 1,
		cancelId: 1
	};
	return (await (owner === void 0 ? dialog.showMessageBox(options) : dialog.showMessageBox(owner, options))).response === 0 && !quitting;
}
function confirmLanAccess() {
	return confirmed(t("允许局域网 HTTPS 访问？", "Allow LAN access over HTTPS?"), t("同一网络中的设备可以连接。请仅向可信设备分享登录链接，并在设备上核对和信任 CA 证书。", "Devices on your local network can connect. Share login links only with trusted devices, and verify and trust the CA certificate on each device."));
}
async function promptAvailableUpdate() {
	if (quitting || runtime.busy) return;
	const snapshot = updates.snapshot();
	if (snapshot.phase !== "available" || !snapshot.installable) return;
	const owner = raiseDialogOwner();
	const options = {
		type: "info",
		title: "DSH NEXT",
		message: updateLabel(snapshot, windowsLanguage),
		buttons: [t("下载更新", "Download update"), t("稍后", "Later")],
		defaultId: 0,
		cancelId: 1,
		detail: t("下载完成后可一键安装并重启。", "When the download finishes, choose Install and restart.")
	};
	if ((await (owner === void 0 ? dialog.showMessageBox(options) : dialog.showMessageBox(owner, options))).response === 0 && !quitting && !runtime.busy) updates.download();
}
async function openPath(path) {
	const error = await shell.openPath(path);
	if (error) throw new Error(error);
}
async function command(value, source = "app") {
	if (!value || typeof value !== "object" || !("type" in value)) throw new Error("Invalid Next command");
	const input = value;
	const type = input.type;
	if (typeof type !== "string") throw new Error("Invalid Next command");
	if ([
		"safe-mode",
		"normal-mode",
		"recover",
		"restart",
		"rollback",
		"repair-global",
		"restart-app",
		"restart-recovery"
	].includes(type)) {
		if (recoveryRequest !== void 0) return recoveryRequest;
		const request = loggedCommand(input, type, source).finally(() => {
			if (recoveryRequest === request) recoveryRequest = void 0;
		});
		recoveryRequest = request;
		return request;
	}
	return loggedCommand(input, type, source);
}
async function loggedCommand(input, type, source) {
	const end = runtime.diagnostics.operation("electron.commands", type, { caller: source }, true);
	try {
		const result = await performCommand(input, type, source);
		end();
		return result;
	} catch (error) {
		end(error);
		throw error;
	}
}
async function performCommand(input, type, source) {
	if (type === "confirm-lan") return confirmLanAccess();
	if (type === "controls") {
		if (input.page !== void 0 && (typeof input.page !== "string" || ![
			"general",
			"profiles",
			"create-profile",
			"tools",
			"recovery",
			"permissions"
		].includes(input.page))) throw new Error("Invalid controls page");
		openControls(input.page);
		return;
	}
	if (type === "close-controls") {
		shellWindow?.close();
		return;
	}
	if (type === "quit") {
		app.quit();
		return;
	}
	if ([
		"check-updates",
		"download-update",
		"install-update"
	].includes(type)) {
		if (!["darwin", "win32"].includes(process.platform) || quitting || runtime.busy) return;
		if (type === "check-updates") updates.check().then(async () => {
			if (source !== "native" || quitting) return;
			const snapshot = updates.snapshot();
			if (snapshot.phase === "available" && snapshot.installable) await promptAvailableUpdate();
			else {
				const owner = raiseDialogOwner();
				const options = {
					type: "info",
					title: "DSH NEXT",
					message: updateLabel(snapshot, windowsLanguage)
				};
				await (owner === void 0 ? dialog.showMessageBox(options) : dialog.showMessageBox(owner, options));
			}
		}).catch((error) => runtime.diagnostics.append(String(error), "warn"));
		else if (type === "download-update") updates.download();
		else {
			if (updates.snapshot().phase !== "ready") return;
			updates.install();
		}
		return;
	}
	if (runtime.busy || quitting) throw new Error(t("另一项操作正在进行，请稍候。", "Another operation is in progress."));
	runtime.busy = true;
	native.refresh();
	try {
		if (type === "onboarding-complete" || type === "onboarding-skip") {
			if (!onboarding || runtime.safeMode || runtime.recoveryMode || input.profile !== runtime.selected) throw new Error("Onboarding is unavailable for this Profile");
			if (type === "onboarding-complete" && (input.browserAccess !== void 0 && typeof input.browserAccess !== "boolean" || input.networkExposure !== void 0 && input.networkExposure !== "loopback" && input.networkExposure !== "lan")) throw new Error("Invalid setup choices");
			runtime.profiles.finishOnboarding(runtime.selected, type === "onboarding-complete" ? {
				features: input.features,
				computerUse: input.computerUse
			} : void 0);
			if (type === "onboarding-complete" && typeof input.browserAccess === "boolean") runtime.writePreferences({
				...runtime.preferences,
				browserAccess: input.browserAccess,
				networkExposure: input.browserAccess ? input.networkExposure ?? runtime.preferences.networkExposure : "loopback"
			});
			onboarding = false;
			shellWindow?.hide();
			runtime.start().catch(() => {});
			openMain();
			shellWindow?.close();
			return;
		}
		if (type === "restart-onboarding") {
			if (runtime.safeMode || runtime.recoveryMode) throw new Error("Onboarding is unavailable in safe or recovery mode");
			if (onboarding) {
				openControls("onboarding");
				return;
			}
			if (!await confirmed(t("重新打开设置向导？", "Reopen the setup wizard?"), t("应用将重启，并带入当前 Profile 的设置。正在运行的任务会中断。", "The app will restart with your current Profile settings selected. Running tasks will be interrupted."))) return;
			relaunch = relaunchArguments(process.argv.slice(1), false, false, true);
			app.quit();
			return;
		}
		if (type === "restart-app" || type === "restart-recovery") {
			if (!await confirmed(type === "restart-recovery" ? t("重启应用并进入恢复模式？", "Restart the application in recovery mode?") : t("现在重启 DSH NEXT？", "Restart DSH NEXT now?"), type === "restart-recovery" ? t("应用将先打开恢复助手，暂不加载当前 Profile 和插件。正在运行的任务会中断。", "The recovery assistant will open before loading the current Profile and plugins. Running tasks will be interrupted.") : void 0)) return;
			relaunch = relaunchArguments(process.argv.slice(1), type === "restart-recovery", runtime.safeMode);
			app.quit();
			return;
		}
		if (type === "create") {
			runtime.profiles.create(profileName(input.name));
			return;
		}
		if (type === "delete") {
			const name = profileName(input.name);
			if (name === runtime.selected || name === "desktop") throw new Error(t("不能移除当前或默认 Profile。", "Cannot remove the active or default Profile."));
			if (await confirmed(t(`移除 Profile「${name}」？`, `Remove Profile “${name}”?`), t("其文件将移入恢复备份目录。共享的会话和设置会保留。", "Its files move to recovery backups. Shared sessions and settings are retained."))) runtime.recovery.removeProfile(name, runtime.selected);
			return;
		}
		if (type === "reload") {
			if (runtime.recoveryMode || onboarding) {
				openMain();
				return;
			}
			await reloadMain();
			return;
		}
		if (type === "devtools") {
			openMain();
			(runtime.recoveryMode || onboarding ? shellWindow : mainWindow).webContents.toggleDevTools();
			return;
		}
		if (type === "recovery-action") {
			await recoveryAction(input);
			return;
		}
		if (type === "terminal") {
			await prepareHostEnvironment();
			const target = runtime.terminalTarget(source === "shell");
			openDesktopTerminal({
				platform: process.platform,
				appExecutable: process.execPath,
				dshBootstrapPath: join(root, "lib", "desktop-cli.js"),
				pnpmBinPath: bundledPnpmEntry(NEXT_PACKAGE),
				electronVersion: process.versions.electron,
				...target,
				productVersion: version,
				stateDir: desktopTerminalStateDirectory(join(target.homeDir, "electron-user-data"), target.profileName),
				spawn,
				onLaunchError: (error) => runtime.report(error)
			});
			return;
		}
		if (type === "open-home") {
			await openPath(home);
			return;
		}
		if (type === "open-profile") {
			await openPath(runtime.profiles.directory(runtime.selected));
			return;
		}
		if (type === "open-logs") {
			runtime.diagnostics.flush();
			await openPath(dirname(runtime.diagnostics.file));
			return;
		}
		if (type === "open-backups") {
			privateDirectory(runtime.recovery.directory);
			await openPath(runtime.recovery.directory);
			return;
		}
		if (type === "change-data-directory" || type === "backup-data-directory") {
			if (runtime.safeMode || runtime.recoveryMode) throw new Error(t("安全模式和恢复模式下请使用恢复助手。", "In Safe Mode or recovery mode, use the recovery assistant."));
			if (type === "change-data-directory") await changeDataDirectory(false);
			else await backupDataDirectory();
			return;
		}
		if (type === "open-browser" || type === "open-lan") {
			await shell.openExternal(runtime.browserLink(type === "open-lan"));
			return;
		}
		if (type === "copy-browser" || type === "copy-lan") {
			clipboard.writeText(runtime.browserLink(type === "copy-lan"));
			return;
		}
		if (type === "open-browser-url" || type === "copy-browser-url") {
			const url = runtime.resolveBrowserLink(input.url);
			if (type === "copy-browser-url") clipboard.writeText(url);
			else await shell.openExternal(url);
			return;
		}
		if (type === "export-ca" || type === "diagnostics") {
			const certificate = runtime.lan?.caCertificate;
			if (type === "export-ca" && !certificate) throw new Error("LAN certificate is unavailable");
			const owner = raiseDialogOwner();
			const options = {
				title: type === "export-ca" ? t("导出局域网 CA 证书", "Export LAN CA certificate") : t("导出诊断（分享前请检查内容）", "Export diagnostics (review before sharing)"),
				defaultPath: type === "export-ca" ? "dsh-desktop-next-ca.crt" : `dsh-desktop-next-diagnostics-${Date.now()}.json`,
				filters: [{
					name: type === "export-ca" ? "CA certificate" : "Diagnostics",
					extensions: [type === "export-ca" ? "crt" : "json"]
				}]
			};
			const result = await (owner === void 0 ? dialog.showSaveDialog(options) : dialog.showSaveDialog(owner, options));
			if (!result.canceled && result.filePath && !quitting) {
				if (type === "export-ca") await writeFile(result.filePath, certificate, { mode: 384 });
				else await runtime.diagnostics.exportTo(result.filePath, state());
				if (type === "diagnostics") diagnosticsFile = result.filePath;
			}
			return;
		}
		if (type === "preferences") {
			if (runtime.safeMode) throw new Error(t("安全模式使用固定的桌面设置。", "Safe Mode uses fixed desktop settings."));
			const preferences = parsePreferences(input.preferences);
			if (portsChanged(runtime.preferences, preferences)) {
				if (!await confirmed(t("应用访问设置并重启 Host？", "Apply access settings and restart the Host?"), preferences.browserAccess && preferences.networkExposure === "lan" ? t("开启后，同一网络中的设备可通过 HTTPS 访问。登录链接可授予访问权限，请仅与可信设备共享。正在运行的任务会被中断。", "Devices on your network can connect over HTTPS. Login links grant access; share only with trusted devices. Running tasks will be interrupted.") : void 0)) return;
				rendererRecovery?.stop();
				await runtime.restart(() => runtime.writePreferences(preferences));
				if (mainWindow) await reloadMain();
			} else {
				if (preferences.browserAccess && preferences.networkExposure === "lan" && (!runtime.preferences.browserAccess || runtime.preferences.networkExposure !== "lan") && !await confirmLanAccess()) return;
				await runtime.applyPreferences(preferences);
			}
			for (const window of [mainWindow, shellWindow]) if (window && !window.isDestroyed()) applyWindowMaterial(window, preferences);
			return;
		}
		if (![
			"switch",
			"features",
			"restart",
			"recover",
			"safe-mode",
			"normal-mode",
			"rollback",
			"repair-global"
		].includes(String(type))) throw new Error("Invalid Next command");
		const next = type === "switch" ? profileName(input.name) : runtime.selected;
		if (type === "switch" && next === runtime.selected && !runtime.safeMode && !runtime.recoveryMode && runtime.backend.state.phase === "ready") return;
		if (type === "switch" && !runtime.profiles.selectable(next)) throw new Error("Profile is unavailable for Desktop Next");
		const features = type === "features" ? parseFeatures(input.features) : void 0;
		if (type === "rollback" && !runtime.recovery.latest(next)) throw new Error(t("尚无成功启动的配置备份。", "No successful-start configuration is available."));
		if (!await confirmed({
			switch: t(`切换到 Profile「${next}」并重启应用？`, `Switch to Profile “${next}” and restart the application?`),
			recover: t("备份并修复当前 Profile？将禁用第三方插件、远控和市场。", "Back up and repair this Profile? Third-party plugins, remote control and Market will be disabled."),
			"repair-global": t("备份并停用全局补丁？这会影响所有 Next Profile。", "Back up and disable the global patch? This affects every Next Profile."),
			rollback: t("恢复最近成功启动的 Profile 配置？当前配置会先备份。", "Restore the last successful-start Profile configuration? The current configuration will be backed up first."),
			"safe-mode": t("在独立的临时环境中进入安全模式？原有数据和配置会保留。", "Enter safe mode in a separate temporary environment? Existing data and configuration are preserved."),
			"normal-mode": t("退出安全模式并重启原 Profile？", "Exit Safe Mode and restart the original Profile?")
		}[String(type)] ?? t("重启工作环境以应用更改？", "Restart the environment to apply this change?"))) return;
		if (type === "switch") {
			runtime.profiles.select(next);
			relaunch = relaunchArguments(process.argv.slice(1), false, false);
			app.quit();
			return;
		}
		if (type === "safe-mode" || type === "normal-mode") {
			if (type === "safe-mode" && runtime.safeMode) return;
			rendererRecovery?.stop();
			await recoveryStopping;
			await runtime.backend.stop();
			relaunch = relaunchArguments(process.argv.slice(1), false, type === "safe-mode");
			app.quit();
			return;
		}
		rendererRecovery?.stop();
		onboarding = false;
		await recoveryStopping;
		const change = async () => {
			if (type === "recover") await runtime.profiles.recover(next);
			if (type === "rollback") await restoreCheckpoint();
			if (type === "repair-global") runtime.recovery.repairGlobalPatch();
			if (features) runtime.profiles.setFeatures(next, features);
		};
		if (runtime.safeMode) {
			await runtime.backend.stop();
			await change();
			relaunch = relaunchArguments(process.argv.slice(1), false, type === "restart");
			app.quit();
			return;
		}
		await runtime.restart(change);
		await reloadMain();
		if (!runtime.safeMode && mainWindow) shellWindow?.close();
	} catch (error) {
		if ([
			"recovery-action",
			"change-data-directory",
			"backup-data-directory"
		].includes(type) || onboarding && (type === "onboarding-complete" || type === "onboarding-skip")) runtime.diagnostics.append(String(error), "error");
		else runtime.report(error);
		throw error;
	} finally {
		runtime.busy = false;
		native.refresh();
	}
}
async function restoreCheckpoint(id) {
	await runtime.recovery.restore(runtime.selected, id);
	try {
		await runRecoveryPlugin(["install", "--no-frozen-lockfile"]);
	} catch (error) {
		throw new Error(t("配置已恢复，但插件依赖安装失败。请检查以下错误并重试恢复：", "Configuration was restored, but plugin dependencies could not be installed. Check the error and retry recovery:") + "\n" + String(error));
	}
	recoveryNotice = {
		tone: "success",
		title: t("检查点已恢复", "Checkpoint restored"),
		body: runtime.safeMode ? t("配置和所需插件依赖已恢复。请点击“退出安全模式并重启”使恢复生效。", "Configuration and required plugin dependencies have been restored. Choose “Exit Safe Mode and Restart” to apply them.") : t("配置和所需插件依赖已恢复。请点击“退出并重启”使恢复生效。", "Configuration and required plugin dependencies have been restored. Choose “Quit and restart” to apply them.")
	};
	runtime.diagnostics.append(`Recovered checkpoint ${id} for ${runtime.selected}`);
}
/** Reconcile dependencies through the same official CLI for recovery install and removal. */
async function runRecoveryPlugin(args) {
	await prepareHostEnvironment();
	const directory = runtime.profiles.directory(runtime.selected);
	const runner = recoveryRunner = createPackageRunner({
		command: process.execPath,
		args: [],
		env: { ELECTRON_RUN_AS_NODE: "1" }
	}, directory);
	let output = "";
	try {
		const operation = runner.runPlugin(args, directory, AbortSignal.timeout(12e4));
		const append = (chunk) => {
			output = (output + String(chunk)).slice(-16384);
			runtime.diagnostics.hostChunk(String(chunk));
		};
		operation.stdout.on("data", append);
		operation.stderr.on("data", append);
		const result = await operation.done;
		if (result.exitCode !== 0) throw new Error(maskSecrets(`Plugin ${args[0]} failed (exit ${result.exitCode}): ${output}`));
	} finally {
		await runner.dispose();
		if (recoveryRunner === runner) recoveryRunner = void 0;
	}
}
async function recoveryAction(input) {
	if (!runtime.recoveryMode && !runtime.safeMode) throw new Error("Open recovery before changing its configuration");
	const action = input.action;
	recoveryNotice = void 0;
	if (action === "restart") {
		if (!await confirmed(runtime.safeMode ? t("退出安全模式并重启？", "Exit Safe Mode and restart?") : t("现在重启 DSH NEXT？", "Restart DSH NEXT now?"), runtime.safeMode ? t("应用将返回原 Profile，并移除临时环境。临时数据不会保留，正在运行的任务会中断。", "The app will return to the original Profile and remove the temporary environment. Temporary data will not be kept, and running tasks will be interrupted.") : t("应用将退出恢复助手，重新启动原 Profile。", "The app will leave the recovery assistant and restart the original Profile."))) return;
		relaunch = relaunchArguments(process.argv.slice(1), false, false);
		app.quit();
		return;
	}
	const directory = runtime.profiles.directory(runtime.selected);
	const files = {
		"open-settings-document": join(home, "settings.yaml"),
		"open-profile-patch": join(directory, "cordis.patch.yml"),
		"open-profile-manifest": join(directory, "package.json")
	};
	if (typeof action !== "string") throw new Error("Invalid recovery action");
	if (Object.hasOwn(files, action)) {
		await openPath(files[action]);
		return;
	}
	if (action === "show-diagnostics") {
		if (!diagnosticsFile) throw new Error("No exported diagnostics");
		shell.showItemInFolder(diagnosticsFile);
		return;
	}
	if (action === "open-checkpoint" || action === "preview-checkpoint") {
		const checkpoint = runtime.recovery.checkpoints(runtime.selected).find((item) => item.id === input.id);
		if (!checkpoint) throw new Error("Recovery checkpoint is no longer available");
		if (action === "open-checkpoint") {
			await openPath(checkpoint.directory);
			return;
		}
		if (!await confirmed(t("还原所选配置备份？", "Restore the selected configuration backup?"), t(`备份时间：${checkpoint.created}。当前配置会先备份，然后恢复配置并安装所需插件依赖。共享数据不会回滚。`, `Saved: ${checkpoint.created}. Current configuration will be backed up, then the saved configuration and required plugin dependencies will be restored. Shared data is not rolled back.`))) return;
		await recoveryStopping;
		if (!runtime.safeMode) await runtime.backend.stop();
		await restoreCheckpoint(checkpoint.id);
		return;
	}
	if (action === "preview-disable" || action === "preview-enable") {
		const enable = action === "preview-enable";
		const bundle = runtime.recovery.bundles(runtime.selected).find((item) => item.bundleId === input.id);
		if (!bundle || bundle.toggle !== (enable ? "enable" : "disable") || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(bundle.packageName)) throw new Error("This plugin cannot be changed");
		await recoveryStopping;
		if (!runtime.safeMode) await runtime.backend.stop();
		await runtime.recovery.setBundleSelected(runtime.selected, bundle.packageName, enable);
		recoveryNotice = {
			tone: "success",
			title: bundle.packageName,
			body: enable ? t("插件已重新启用。请点击“退出并重启”使其生效。", "The plugin is enabled again. Choose “Quit and restart” to apply it.") : t("插件已禁用，安装内容仍然保留。请点击“退出并重启”使其生效。", "The plugin is disabled and still installed. Choose “Quit and restart” to apply it.")
		};
		runtime.diagnostics.append(`${enable ? "Enabled" : "Disabled"} bundle for ${runtime.selected}`);
		return;
	}
	if (action === "preview-uninstall") {
		const bundle = runtime.recovery.bundles(runtime.selected).find((item) => item.bundleId === input.id);
		if (!bundle || bundle.action !== "uninstall" || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(bundle.packageName)) throw new Error("This bundle cannot be uninstalled");
		if (!await confirmed(t(`卸载插件「${bundle.packageName}」？`, `Uninstall “${bundle.packageName}”?`), t("先备份当前 Profile 配置，然后卸载所选插件。", "Back up the Profile configuration, then uninstall the selected plugin."))) return;
		await recoveryStopping;
		if (!runtime.safeMode) await runtime.backend.stop();
		runtime.recovery.backup(runtime.selected, "before-plugin-uninstall");
		await runRecoveryPlugin(["remove", bundle.packageName]);
		return;
	}
	if (action === "begin-change-data-directory" || action === "restore-default-data-directory") {
		await changeDataDirectory(action === "restore-default-data-directory");
		return;
	}
	if (action === "factory-reset") {
		if (!await confirmed(t("重置当前数据目录并重启？", "Reset the current data directory and restart?"), t("Profile、会话、设置和凭据将移入 recovery 备份目录，应用将重新初始化。", "Profiles, sessions, settings and credentials will move to a recovery backup. The app will initialize again."))) return;
		await recoveryStopping;
		await runtime.backend.stop();
		runtime.diagnostics.flush();
		runtime.recovery.factoryReset();
		relaunch = relaunchArguments(process.argv.slice(1), false, false);
		app.quit();
		return;
	}
	throw new Error("Unknown recovery action");
}
function rememberLaunchDirectory(directory) {
	try {
		rememberDataDirectory(locationRoot, directory);
	} catch (error) {
		runtime.diagnostics.append(`Data directory record: ${String(error)}`, "warn");
	}
}
/**
* Ask before a launch sets up another data directory than the last one used. An in-app relaunch
* inherits the environment of the process that started it, and a removed choice falls back to the
* variable or the default, so either could otherwise start over in a new directory silently.
* @returns false when this process ends to reopen the last directory or to quit.
*/
async function confirmDataDirectory() {
	if (safeModeRequested || dataLocation.error) return true;
	const change = dataDirectoryChange(locationRoot, home, environmentHome);
	if (change === void 0) {
		rememberLaunchDirectory(home);
		return true;
	}
	const { previous, reachable } = change;
	const source = {
		desktop: t("应用内选择", "chosen in the app"),
		environment: DATA_DIRECTORY_VARIABLE,
		default: t("默认目录", "default")
	}[dataSource];
	if (process.platform === "darwin") app.focus({ steal: true });
	confirmingDataDirectory = true;
	const { response } = await dialog.showMessageBox({
		type: "warning",
		title: "DSH NEXT",
		noLink: true,
		message: t("数据目录与上次不同", "The data directory differs from the last launch"),
		detail: [
			t(`本次：${home}（${source}）`, `This launch: ${home} (${source})`),
			t(`上次：${previous}${reachable ? "" : "（当前无法访问）"}`, `Last launch: ${previous}${reachable ? "" : " (unavailable now)"}`),
			"",
			t("继续使用本次目录不会移动或删除上次目录中的数据。", "Continuing does not move or delete data in the last directory."),
			...reachable ? [] : [t("上次的目录如在移动硬盘或网络位置上，请先连接，再选择“改用上次的目录”。", "If the last directory is on a removable or network drive, connect it before choosing “Use the last directory”.")],
			t(`如果刚修改了 ${DATA_DIRECTORY_VARIABLE}：应用内重启会沿用修改前的环境变量，请完全退出后再重新打开。`, `If you just changed ${DATA_DIRECTORY_VARIABLE}: an in-app restart keeps the previous environment, so quit completely and open the app again.`)
		].join("\n"),
		buttons: [
			t("改用上次的目录", "Use the last directory"),
			t("继续使用本次目录", "Continue with this directory"),
			t("退出", "Quit")
		],
		defaultId: 0,
		cancelId: 2
	}).finally(() => {
		confirmingDataDirectory = false;
	});
	if (response === 1) {
		rememberLaunchDirectory(home);
		return true;
	}
	if (response === 0) {
		atomicJson(locationFile, { home: previous });
		rememberLaunchDirectory(previous);
		relaunchApp(app, process.argv.slice(1));
	}
	runtime.diagnostics.end(true);
	app.exit(0);
	return false;
}
/** Choose another data directory, or forget the in-app choice, for the next launch. No data moves. */
async function changeDataDirectory(restoreDefault) {
	let target = dataLocation.fallback;
	if (!restoreDefault) {
		const owner = raiseDialogOwner();
		const options = { properties: ["openDirectory", "createDirectory"] };
		const choice = await (owner === void 0 ? dialog.showOpenDialog(options) : dialog.showOpenDialog(owner, options));
		const selected = choice.canceled ? void 0 : choice.filePaths[0];
		if (!selected || !isAbsolute(selected)) return;
		target = selected;
	}
	const destination = validateDataDirectory(target, home, dataLocation.fallback);
	if (sameDirectory(destination, home) && !dataLocation.error) {
		if (restoreDefault && dataSource === "desktop") {
			rmSync(locationFile, { force: true });
			dataSource = environmentHome ? "environment" : "default";
		}
		return;
	}
	if (!await confirmed(t("切换数据目录并重启？", "Change data directory and restart?"), t(`新目录：${destination}。原目录的数据会保留，不会自动迁移。`, `New directory: ${destination}. Existing data remains in its original directory and is not moved.`))) return;
	if (restoreDefault) rmSync(locationFile, { force: true });
	else atomicJson(locationFile, { home: destination });
	rememberLaunchDirectory(destination);
	relaunch = relaunchArguments(process.argv.slice(1), false, false);
	app.quit();
}
/** Copy the data directory while the Host is stopped; the Host starts again even when copying fails. */
async function backupDataDirectory() {
	const owner = raiseDialogOwner();
	const options = {
		title: t("选择备份保存位置", "Choose where to save the backup"),
		properties: ["openDirectory", "createDirectory"]
	};
	const choice = await (owner === void 0 ? dialog.showOpenDialog(options) : dialog.showOpenDialog(owner, options));
	const parent = choice.canceled ? void 0 : choice.filePaths[0];
	if (!parent || !isAbsolute(parent)) return;
	const destination = join(parent, backupDirectoryName(home));
	try {
		assertBackupLocation(home, destination);
	} catch {
		throw new Error(t("请选择当前数据目录以外的位置。", "Choose a location outside the current data directory."));
	}
	if (!await confirmed(t("备份当前数据目录？", "Back up the current data directory?"), t(`备份位置：${destination}\n复制期间工作环境会暂停，正在运行的任务会中断，完成后自动恢复。electron-user-data 中的窗口和浏览器缓存不会备份。`, `Backup location: ${destination}\nThe environment pauses while copying, interrupting running tasks, and resumes afterwards. Window and browser caches in electron-user-data are not included.`))) return;
	rendererRecovery?.stop();
	await recoveryStopping;
	let failure;
	const progress = (value) => {
		if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(value);
	};
	progress(2);
	try {
		await runtime.restart(async () => {
			try {
				await copyDataDirectory(home, destination);
			} catch (error) {
				failure = error instanceof Error ? error : new Error(String(error));
			}
		});
	} finally {
		progress(-1);
	}
	await reloadMain();
	if (failure) throw new Error(t("备份未完成：", "Backup failed: ") + failure.message);
	runtime.diagnostics.append(`Backed up the data directory to ${destination}`);
	const done = raiseDialogOwner();
	const notice = {
		type: "info",
		title: "DSH NEXT",
		message: t("数据目录已备份", "Data directory backed up"),
		detail: destination,
		buttons: [t("在文件夹中显示", "Show in folder"), t("完成", "Done")],
		defaultId: 1,
		cancelId: 1,
		noLink: true
	};
	(done === void 0 ? dialog.showMessageBox(notice) : dialog.showMessageBox(done, notice)).then((result) => {
		if (result.response === 0) shell.showItemInFolder(destination);
	}).catch((error) => runtime.diagnostics.append(String(error), "warn"));
}
/**
* Finder and Dock launches carry no login-shell exports, so the Host, its terminals and tool subprocesses
* would run with the minimal system PATH and no locale. Recover the exports the Desktop variants
* recover, then make sure a UTF-8 locale is set, as Terminal.app does for the shells it opens.
* Probe the system proxy in parallel: a proxy client's "system proxy" switch sets no environment
* variable, and only Chromium can evaluate it (PAC/WPAD included).
*/
function prepareHostEnvironment() {
	return hostEnvironmentReady ??= (async () => {
		const [shellEnvironment, resolvedProxy] = await Promise.all([resolveDesktopShellEnvironment({
			environment: process.env,
			home: app.getPath("home"),
			isPackaged: app.isPackaged,
			platform: process.platform
		}), probeSystemProxy(session.defaultSession)]);
		for (const [name, value] of Object.entries(shellEnvironment.updates)) process.env[name] = value;
		const fallbackLocale = ensureUtf8Locale(process.env, process.platform, app.getPreferredSystemLanguages());
		systemProxy = resolvedProxy;
		runtime.diagnostics.record({
			source: "desktop",
			event: "shell-environment.resolved",
			fields: {
				source: shellEnvironment.source,
				fallbackReason: shellEnvironment.fallbackReason ?? null,
				recovered: Object.keys(shellEnvironment.updates).join(" ") || null,
				fallbackLocale: fallbackLocale ?? null
			}
		});
	})();
}
async function main() {
	await app.whenReady();
	if (quitting) return;
	let inputRevision = 0;
	let inputBlocked = false;
	desktopShortcuts = installDesktopShortcuts(() => mainWindow, app.getPath("userData"), process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux", () => {}, () => {
		const blocked = runtime.recoveryMode || onboarding || onboardingSurfaceActive;
		if (blocked !== inputBlocked) {
			inputBlocked = blocked;
			inputRevision++;
		}
		return {
			revision: inputRevision,
			blocked
		};
	});
	app.once("will-quit", () => {
		desktopShortcuts?.dispose();
	});
	if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(join(root, "build", "app-icon-mac.png"));
	windowsLanguage = preferredDesktopLocale([...app.getPreferredSystemLanguages(), app.getLocale()]);
	if (!await confirmDataDirectory()) return;
	protocol.handle("dsh-app", async (request) => {
		const url = new URL(request.url);
		if (url.hostname === "shell") {
			const response = await serveWebDocument(request, join(root, "lib/native-ui"), false);
			response.headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-src 'none'; base-uri 'none'");
			return response;
		}
		if (url.hostname !== "app") return new Response(null, { status: 404 });
		if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/assets/") || ["/favicon.svg", "/manifest.webmanifest"].includes(url.pathname)) return serveWebDocument(request, webRoot);
		const auth = runtime.auth;
		if (!runtime.backend.host || !auth) return new Response(null, { status: 503 });
		return forwardWebRequest(request, auth.url, auth.cookie, auth.token);
	});
	ipcMain.handle(IPC.boot, async (event) => {
		assertSender(event, mainWindow, APP_URL);
		const documentId = rendererDocumentId;
		await runtime.startup;
		if (!runtime.backend.host || !runtime.auth) throw new Error("Next Host is unavailable");
		const injections = await runtime.injections();
		assertSender(event, mainWindow, APP_URL);
		if (documentId !== rendererDocumentId || quitting || runtime.recoveryMode) throw new Error("Next document was superseded");
		rendererRecovery?.booted();
		return {
			injections,
			streamBaseUrl: new URL(runtime.auth.url).origin,
			documentId,
			profile: runtime.selected
		};
	});
	ipcMain.handle(IPC.rendererStatus, (event, documentId, status) => {
		assertSender(event, mainWindow, APP_URL);
		if (!isDesktopRendererStatus(status)) throw new Error("Invalid renderer status");
		if (documentId !== rendererDocumentId || !documentId) return;
		rendererRecovery?.report(status);
	});
	ipcMain.handle(IPC.failed, (event, message, documentId) => {
		assertSender(event, mainWindow, APP_URL);
		if (typeof message !== "string") throw new Error("Invalid boot error");
		if (documentId !== void 0 && documentId !== rendererDocumentId) return;
		failRenderer(mainWindow, new Error(message.slice(0, 4096)));
	});
	ipcMain.handle(IPC.state, (event) => {
		assertDesktopSender(event);
		return state();
	});
	ipcMain.handle("dsh-desktop:setup-onboarding", async (event, request) => {
		assertSender(event, mainWindow, APP_URL);
		if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Invalid setup request");
		const value = request;
		if (value.action === "active") {
			if (typeof value.active !== "boolean") throw new Error("Invalid onboarding state");
			onboardingSurfaceActive = value.active;
			return;
		}
		if (value.action === "read") {
			if (runtime.safeMode || runtime.recoveryMode) return null;
			const features = runtime.profiles.features(runtime.selected);
			return {
				required: onboarding,
				edition: "next",
				profile: runtime.selected,
				accountPending: !onboarding && runtime.profiles.accountSetupPending(runtime.selected),
				computerUse: runtime.profiles.computerUseEnabled(runtime.selected),
				...features.officialMarket ? { officialMarket: true } : {},
				input: {
					appVersion: version,
					profileName: runtime.selected,
					platform: process.platform,
					mode: "compatibility",
					macosMaterial: "off",
					windowsMaterial: "off",
					openBrowser: runtime.preferences.browserAccess,
					networkExposure: runtime.preferences.browserAccess ? runtime.preferences.networkExposure : "loopback",
					market: features.market ? "community-market" : features.dshMarket ? "dsh-market" : features.officialMarket ? "official-market" : "disabled",
					aaEnabled: features.remoteControl,
					notifications: {
						enabled: true,
						notifyOnTurnCompletion: true,
						notifyOnTurnFailure: true,
						notifyOnJobCompletion: false,
						notifyOnJobFailure: false,
						notifyOnScheduleCompletion: true,
						notifyOnScheduleFailure: true
					}
				}
			};
		}
		if (value.action === "dismiss-account") {
			if (onboarding || value.profile !== runtime.selected || runtime.safeMode || runtime.recoveryMode) throw new Error("Account setup is unavailable");
			runtime.profiles.dismissAccountSetup(runtime.selected);
			return;
		}
		throw new Error("Setup is unavailable");
	});
	ipcMain.handle(IPC.settingsTake, (event) => {
		assertSender(event, mainWindow, APP_URL);
		const page = pendingSettings;
		pendingSettings = void 0;
		return page;
	});
	ipcMain.handle(IPC.browserLinks, (event) => {
		assertDesktopSender(event);
		return runtime.browserLinks();
	});
	ipcMain.handle(IPC.browserAcquire, (event, workspace) => {
		assertSender(event, mainWindow, APP_URL);
		if (quitting) throw new Error("Desktop browser is unavailable");
		return browserGuests.acquire(event.sender, workspace);
	});
	ipcMain.handle(IPC.browserRelease, (event, lease) => {
		assertSender(event, mainWindow, APP_URL);
		return browserGuests.release(event.sender, lease);
	});
	ipcMain.handle(IPC.permissionQuery, (event, permission) => {
		assertDesktopSender(event);
		return permissions.query(permission);
	});
	const permissionGesture = async (event) => {
		assertDesktopSender(event);
		if (!event.sender.isFocused() || !await event.sender.executeJavaScript("navigator.userActivation.isActive")) throw new Error("Desktop permission requests require a focused window and user gesture");
		assertDesktopSender(event);
	};
	ipcMain.handle(IPC.permissionRequest, async (event, permission) => {
		await permissionGesture(event);
		return permissions.request(permission);
	});
	ipcMain.handle(IPC.permissionSettings, async (event, permission) => {
		await permissionGesture(event);
		await permissions.openSettings(permission);
	});
	installMediaPermissions(session.defaultSession, {
		window: () => mainWindow,
		language: () => windowsLanguage,
		warn: (error) => runtime.diagnostics.append(String(error), "warn")
	});
	installAppDownloads(session.defaultSession, {
		window: () => mainWindow,
		language: () => windowsLanguage,
		downloads: () => app.getPath("downloads"),
		warn: (error) => runtime.diagnostics.append(String(error), "warn"),
		forward: async (url) => {
			const auth = runtime.auth;
			if (!runtime.backend.host || !auth) return new Response(null, { status: 503 });
			return forwardWebRequest(new Request(url, { headers: { [NATIVE_ACCESS_HEADER]: auth.token } }), auth.url, auth.cookie, auth.token);
		}
	});
	ipcMain.handle(IPC.material, (event) => {
		assertSender(event, mainWindow, APP_URL);
		return windowMaterial(runtime.preferences);
	});
	ipcMain.handle(IPC.command, (event, value) => {
		assertDesktopSender(event);
		return command(value, event.sender === shellWindow?.webContents ? "shell" : "app");
	});
	let picking;
	ipcMain.handle(IPC.directory, (event) => {
		assertSender(event, mainWindow, APP_URL);
		const window = mainWindow;
		show(window);
		picking ??= dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] }).then((result) => result.canceled ? null : result.filePaths[0] ?? null).finally(() => {
			picking = void 0;
		});
		return picking;
	});
	session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, callback) => {
		const auth = runtime.auth;
		const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : void 0;
		const requestHeaders = appRequestHeaders(details, owner, auth?.token);
		const target = new URL(details.url);
		if (target.protocol !== "ws:" || target.hostname !== "127.0.0.1" || !auth || details.webContentsId !== owner?.id) return callback({ requestHeaders });
		const host = new URL(auth.url);
		if (target.host !== host.host) return callback({ requestHeaders });
		const headers = Object.fromEntries(Object.entries(requestHeaders).map(([key, value]) => [key.toLowerCase(), value]));
		if (headers.origin !== "dsh-app://app") return callback({ cancel: true });
		callback({ requestHeaders: {
			...headers,
			origin: host.origin,
			cookie: auth.cookie,
			[NATIVE_ACCESS_HEADER]: auth.token,
			"sec-fetch-site": "same-origin"
		} });
	});
	ipcMain.on(IPC.nativeThemeSet, (event, source) => {
		try {
			assertSender(event, mainWindow, APP_URL);
		} catch {
			return;
		}
		if (source === "light" || source === "dark" || source === "system") nativeTheme.themeSource = source;
	});
	ipcMain.on(IPC.locale, (event, language) => {
		try {
			assertSender(event, mainWindow, APP_URL);
		} catch {
			return;
		}
		if (typeof language !== "string" || !/^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language)) return;
		if (!runtime.safeMode) try {
			nativeLocale.remember(runtime.selected, language);
		} catch (error) {
			runtime.diagnostics.append(String(error), "warn");
		}
		if (language === windowsLanguage) return;
		windowsLanguage = language;
		native.refresh();
	});
	ipcMain.handle(IPC.localeRead, (event) => {
		assertSender(event, mainWindow, APP_URL);
		return {
			languages: [...app.getPreferredSystemLanguages(), app.getLocale()],
			preference: null
		};
	});
	nativeTheme.on("updated", () => {
		for (const window of [mainWindow, shellWindow]) if (window && !window.isDestroyed()) applyWindowMaterial(window, runtime.preferences);
	});
	runtime.safeMode = safeModeRequested;
	runtime.recoveryMode = process.argv.includes(RECOVERY_ARGUMENT);
	runtime.initialize();
	prepareHostEnvironment();
	if (dataLocation.error && !runtime.safeMode) {
		runtime.recoveryMode = true;
		runtime.report(dataLocation.error);
	}
	if (app.isPackaged) try {
		verifyPackagedRuntimeIdentity(join(root, DESKTOP_RUNTIME_FILE), {
			version,
			dshVersion: readInstalledPackageVersion(root, "@deepseek-ai/dsh"),
			platform: process.platform,
			arch: process.arch
		});
	} catch (error) {
		runtime.recoveryMode = true;
		runtime.report(error);
	}
	if (!runtime.safeMode && !runtime.recoveryMode) try {
		runtime.profiles.ensure(runtime.selected);
		onboarding = process.argv.includes("--next-onboarding") || runtime.profiles.onboardingRequired(runtime.selected);
		if (onboarding) onboardingComputerUse = runtime.profiles.computerUseEnabled(runtime.selected);
	} catch (error) {
		onboarding = false;
		runtime.recoveryMode = true;
		runtime.report(error);
	}
	native.createTray();
	updates.start();
	Menu.setApplicationMenu(process.platform === "win32" ? null : Menu.buildFromTemplate([
		{
			label: "DSH NEXT",
			submenu: native.items()
		},
		{ role: "editMenu" },
		{ role: "viewMenu" },
		{ role: "windowMenu" }
	]));
	if (process.platform === "win32") {
		ipcMain.handle(IPC.windowsMenu, (event, name, x, y) => {
			assertSender(event, mainWindow, APP_URL);
			if (name !== "application" && name !== "edit" || typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 1e5 || y > 1e5) throw new Error("Invalid native menu request");
			const window = mainWindow;
			const messages = resolveDesktopLocale(windowsLanguage).messages;
			const editItem = (label, keyCode, modifiers, accelerator) => ({
				label,
				accelerator,
				click: () => {
					window.webContents.focus();
					desktopShortcuts.sendEditingKey(keyCode, modifiers);
				}
			});
			const items = name === "application" ? native.items() : [
				editItem(messages.undo, "Z", ["control"], "Ctrl+Z"),
				editItem(messages.redo, "Y", ["control"], "Ctrl+Y"),
				{ type: "separator" },
				editItem(messages.cut, "X", ["control"], "Ctrl+X"),
				editItem(messages.copy, "C", ["control"], "Ctrl+C"),
				editItem(messages.paste, "V", ["control"], "Ctrl+V"),
				editItem(messages.delete, "Delete", []),
				{ type: "separator" },
				editItem(messages.selectAll, "A", ["control"], "Ctrl+A")
			];
			const zoom = window.webContents.getZoomFactor();
			return new Promise((resolvePopup) => {
				Menu.buildFromTemplate(items).popup({
					window,
					x: Math.round(x * zoom),
					y: Math.round(y * zoom),
					callback: resolvePopup
				});
			});
		});
		ipcMain.on(IPC.windowsAppearance, (event, language, sidebarFill, symbolColor) => {
			try {
				assertSender(event, mainWindow, APP_URL);
			} catch {
				return;
			}
			const validColor = (value) => typeof value === "string" && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value);
			if (validColor(symbolColor)) mainWindow.setTitleBarOverlay({
				color: WINDOWS_CAPTION_FILL,
				symbolColor
			});
		});
	}
	if (runtime.recoveryMode) openControls("recovery");
	else if (onboarding) openControls("onboarding");
	else {
		runtime.start().catch(() => {});
		openMain();
	}
	app.on("activate", openMain);
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin" && !native.available && !replacingWindow) app.quit();
	});
}
app.on("before-quit", (event) => {
	if (quitting || !ownsInstance) return;
	event.preventDefault();
	quitting = true;
	rendererRecovery?.stop();
	runtime.diagnostics.record({
		source: "electron",
		event: "shutdown.start"
	});
	runtime.diagnostics.flush();
	let finished = false;
	const timeout = setTimeout(() => {
		if (finish()) {
			runtime.diagnostics.record({
				source: "electron",
				event: "shutdown.timeout",
				level: "error",
				message: "Shutdown exceeded five seconds",
				fields: { pending: JSON.stringify(runtime.diagnostics.pendingOperations()) }
			});
			completeShutdown(false);
		}
	}, DESKTOP_SHUTDOWN_TIMEOUT_MS);
	timeout.unref();
	function finish() {
		if (finished) return false;
		finished = true;
		clearTimeout(timeout);
		return true;
	}
	async function completeShutdown(clean) {
		if (installingUpdate) {
			const installerDone = runtime.diagnostics.operation("electron", "installer.launch");
			try {
				await updateInstaller.launch();
				installerDone();
			} catch (error) {
				installerDone(error);
				runtime.diagnostics.record({
					source: "electron",
					event: "installer.failed",
					level: "error",
					error
				});
				runtime.diagnostics.end(clean);
				dialog.showErrorBox(t("更新未能安装", "Update could not be installed"), t("应用将重新打开，请在设置中重试更新。", "The application will reopen. Retry the update in Settings."));
				relaunchApp(app, relaunchArguments(process.argv.slice(1), false, false));
				if (clean) app.quit();
				else app.exit(1);
				return;
			}
		}
		runtime.diagnostics.end(clean);
		if (!clean) {
			app.exit(1);
			return;
		}
		if (relaunch) relaunchApp(app, relaunch);
		app.quit();
	}
	for (const window of [mainWindow, shellWindow]) if (window && !window.isDestroyed()) window.hide();
	native.close();
	platformLogin.close();
	const updatesDone = runtime.diagnostics.operation("electron", "updates.dispose");
	const recoveryDone = runtime.diagnostics.operation("electron", "recovery.dispose");
	Promise.all([updates.dispose(installingUpdate).then(() => updatesDone(), (error) => {
		updatesDone(error);
		throw error;
	}), (async () => {
		try {
			await recoveryRunner?.dispose();
			recoveryDone();
		} catch (error) {
			recoveryDone(error);
			throw error;
		}
		await runtime.close();
	})()]).then(async () => {
		if (!finish()) return;
		if (safeModeRequested && !installingUpdate) try {
			cleanupDisposableTree(safeElectronData);
		} catch (error) {
			runtime.diagnostics.append(`Safe Mode desktop state cleanup failed: ${String(error)}`, "warn");
			runtime.diagnostics.flush();
		}
		await completeShutdown(true);
	}).catch((error) => {
		if (finish()) {
			runtime.diagnostics.record({
				source: "electron",
				event: "shutdown.failed",
				level: "error",
				error
			});
			completeShutdown(false);
		}
	});
});
if (ownsInstance) {
	process.on("uncaughtExceptionMonitor", (error, origin) => {
		runtime.diagnostics.record({
			source: "electron",
			event: "uncaught-exception",
			level: "error",
			error,
			fields: { origin }
		});
		runtime.diagnostics.end(false);
	});
	const reportSandboxLaunchFailure = createSandboxLaunchReporter({
		elevation: windowsElevation,
		context: () => ({
			startup: startupElevationState,
			argv: process.argv,
			executable: process.execPath,
			language: preferredDesktopLocale([...app.getPreferredSystemLanguages(), app.getLocale()])
		}),
		record: (failure, elevation) => runtime.diagnostics.record({
			source: "electron",
			event: "sandbox.launch-failed",
			level: "error",
			fields: {
				process: failure.process,
				code: failure.code,
				elevated: elevation?.elevated ?? null,
				elevationType: elevation?.type ?? null
			}
		}),
		show: (text) => {
			dialog.showMessageBoxSync({
				type: "error",
				title: text.title,
				message: text.message,
				detail: text.detail,
				buttons: [text.button],
				defaultId: 0,
				noLink: true
			});
		},
		exit: () => {
			runtime.diagnostics.end(false);
			app.exit(1);
		}
	});
	app.on("child-process-gone", (_event, details) => {
		runtime.diagnostics.record({
			source: "electron",
			event: "child-process-gone",
			level: "error",
			fields: {
				type: details.type,
				reason: details.reason,
				exitCode: details.exitCode,
				service: details.serviceName ?? null
			}
		});
		const failure = gpuLaunchFailure(process.platform, details);
		if (failure && !quitting) reportSandboxLaunchFailure(failure);
	});
	app.on("render-process-gone", (_event, contents, details) => {
		const failure = rendererLaunchFailure(process.platform, details);
		if (failure && !quitting && [mainWindow, shellWindow].some((window) => window !== void 0 && !window.isDestroyed() && window.webContents === contents)) reportSandboxLaunchFailure(failure);
	});
	app.once("will-quit", () => runtime.diagnostics.flush());
	const { elevation, kept, error, win32Code } = startupElevationState;
	runtime.diagnostics.begin({
		version,
		platform: process.platform,
		electron: process.versions.electron ?? "",
		node: process.version,
		safeMode: safeModeRequested,
		...dshVersion === void 0 ? {} : { dsh: dshVersion },
		...elevation === void 0 ? {} : {
			elevated: elevation.elevated,
			elevationType: elevation.type
		},
		...process.argv.includes("--next-de-elevated") ? { deElevated: true } : {}
	});
	if (kept !== void 0 || error !== void 0) runtime.diagnostics.record({
		source: "electron",
		event: elevation === void 0 ? "elevation.unknown" : "elevation.kept",
		level: "warn",
		...error === void 0 ? {} : { message: error },
		fields: {
			reason: kept ?? null,
			win32Code: win32Code ?? null
		}
	});
	main().catch((error) => runtime.report(error));
}
//#endregion
export {};
