using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

// DSH NEXT cold-start launcher (MLS transparent boot overlay).
// Swaps in resources\app.asar.mls-transparent, starts the app, and rolls back
// to the pristine archive if the patched shell does not produce a window.
static class Program
{
    static string logFile;
    static string stateDir;
    static string appDir;

    [STAThread]
    static int Main(string[] args)
    {
        stateDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "mls-boot");
        Directory.CreateDirectory(stateDir);
        logFile = Path.Combine(stateDir, "launcher.log");
        string stateFile = Path.Combine(stateDir, "state.json");

        Log("launcher start");
        appDir = ResolveApp();
        if (appDir == null)
        {
            Fail("找不到 DSH NEXT 安装目录。\n如果在其他位置安装，可设置环境变量 DSH_NEXT_APP 指向该目录。");
            return 1;
        }

        string res = Path.Combine(appDir, "resources");
        string exe = Path.Combine(appDir, "DSH NEXT.exe");
        string stock = Path.Combine(res, "app.asar");
        string backup = Path.Combine(res, "app.asar.stock-mls");
        string variant = Path.Combine(res, "app.asar.mls-transparent");
        Log("app=" + appDir);

        try
        {
            if (File.Exists(stateFile) && File.ReadAllText(stateFile).Contains("\"failed\":true"))
            {
                Log("previous attempt failed, starting stock");
                StartStock(exe);
                return 0;
            }

            if (!File.Exists(variant))
            {
                Log("variant missing, starting stock");
                Fail("没有找到补丁包 app.asar.mls-transparent。\n请先在装配目录运行 install.cmd。");
                StartStock(exe);
                return 0;
            }

            if (!File.Exists(stock))
            {
                Fail("安装目录里的 app.asar 缺失。");
                return 1;
            }

            if (RunningCount() > 0)
            {
                DialogResult answer = MessageBox.Show(
                    "DSH NEXT 正在运行。\n\n播放冷启动动画需要先关闭它，当前会话会被中断。\n\n现在重启吗？",
                    "DSH NEXT 冷启动",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button2);
                if (answer != DialogResult.Yes)
                {
                    Log("user cancelled restart");
                    return 0;
                }
                KillAll(20);
            }

            long variantLen = new FileInfo(variant).Length;
            long stockLen = new FileInfo(stock).Length;

            if (stockLen != variantLen)
            {
                if (!File.Exists(backup))
                {
                    CopyWithRetry(stock, backup, false);
                    Log("stock archive backed up");
                }
                CopyWithRetry(variant, stock, true);
                Log("patched archive in place");
            }
            else
            {
                Log("patched archive already in place");
            }
        }
        catch (Exception ex)
        {
            Log("setup failed: " + ex.Message);
            Fail("准备补丁失败：" + ex.Message);
            return 1;
        }

        Process proc;
        try
        {
            proc = Process.Start(new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = appDir });
            Log("app started pid=" + proc.Id);
        }
        catch (Exception ex)
        {
            Log("start failed: " + ex.Message);
            Restore(stock, backup, stateFile);
            Fail("启动 DSH NEXT 失败：" + ex.Message + "\n已恢复原版。");
            return 1;
        }

        if (WaitWindow(proc, 45))
        {
            Log("patched shell running");
            TryWrite(stateFile, "{\"failed\":false,\"at\":\"" + DateTime.Now.ToString("o") + "\"}");
            return 0;
        }

        Log("no window, restoring stock");
        KillAll(15);
        Thread.Sleep(1200);
        Restore(stock, backup, stateFile);
        StartStock(exe);
        Fail("冷启动界面没有出现，已自动恢复原版并启动。\n下次启动将直接使用原版。");
        return 0;
    }

    static string ResolveApp()
    {
        string[] candidates = new string[]
        {
            Environment.GetEnvironmentVariable("DSH_NEXT_APP"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs\\DSH NEXT"),
            "C:\\Program Files\\DSH NEXT",
            "D:\\DSH NEXT"
        };
        foreach (string c in candidates)
        {
            if (string.IsNullOrEmpty(c)) continue;
            if (File.Exists(Path.Combine(c, "DSH NEXT.exe")) &&
                File.Exists(Path.Combine(Path.Combine(c, "resources"), "app.asar")))
            {
                return c;
            }
        }
        return null;
    }

    static int RunningCount()
    {
        return Process.GetProcessesByName("DSH NEXT").Length;
    }

    static void KillAll(int seconds)
    {
        Process[] procs = Process.GetProcessesByName("DSH NEXT");
        Log("closing " + procs.Length + " instance(s)");
        foreach (Process p in procs)
        {
            try { if (p.MainWindowHandle != IntPtr.Zero) p.CloseMainWindow(); } catch { }
        }
        for (int i = 0; i < 8; i++)
        {
            Thread.Sleep(500);
            if (RunningCount() == 0) { Log("all instances closed gracefully"); return; }
        }
        foreach (Process p in Process.GetProcessesByName("DSH NEXT"))
        {
            try { p.Kill(); } catch { }
        }
        Log("force-closing remaining instances");
        for (int i = 0; i < seconds * 2; i++)
        {
            Thread.Sleep(500);
            if (RunningCount() == 0) { Log("all instances closed"); return; }
        }
        Log("WARNING: some instances still alive");
    }

    static void CopyWithRetry(string from, string to, bool overwrite)
    {
        Exception last = null;
        for (int i = 0; i < 12; i++)
        {
            try
            {
                File.Copy(from, to, overwrite);
                return;
            }
            catch (Exception ex)
            {
                last = ex;
                Thread.Sleep(700);
            }
        }
        throw new IOException("复制失败（文件可能仍被占用）：" + last.Message, last);
    }

    static bool WaitWindow(Process proc, int seconds)
    {
        for (int i = 0; i < seconds; i++)
        {
            Thread.Sleep(1000);
            try
            {
                if (proc.HasExited) { Log("process exited after " + i + "s"); return false; }
                proc.Refresh();
                if (proc.MainWindowHandle != IntPtr.Zero) { Log("window up after " + i + "s"); return true; }
            }
            catch { return false; }
        }
        return false;
    }

    static void Restore(string stock, string backup, string stateFile)
    {
        try
        {
            if (File.Exists(backup)) CopyWithRetry(backup, stock, true);
            Log("stock archive restored");
        }
        catch (Exception ex) { Log("restore failed: " + ex.Message); }
        TryWrite(stateFile, "{\"failed\":true,\"why\":\"no window\",\"at\":\"" + DateTime.Now.ToString("o") + "\"}");
    }

    static void StartStock(string exe)
    {
        if (RunningCount() == 0)
        {
            try { Process.Start(new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = appDir }); }
            catch (Exception ex) { Log("stock start failed: " + ex.Message); }
        }
    }

    static void TryWrite(string path, string text)
    {
        try { File.WriteAllText(path, text); } catch { }
    }

    static void Log(string line)
    {
        try
        {
            File.AppendAllText(logFile, DateTime.Now.ToString("HH:mm:ss") + " " + line + Environment.NewLine);
        }
        catch { }
    }

    static void Fail(string message)
    {
        Log("ERROR " + message.Replace("\n", " "));
        MessageBox.Show(message + "\n\n日志：" + logFile, "DSH NEXT 冷启动", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }
}
