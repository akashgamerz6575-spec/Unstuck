/**
 * Unstuck - Window Scoping & Geometry Guard
 * 
 * Inspects the active foreground window on Windows to enforce target application scoping:
 * - Identifies whether LibreOffice Calc (or an associated Calc dialog like Chart Wizard)
 *   is currently the foreground application.
 * - Collects target window geometry (desktop pixel bounds).
 * - Restricts OCR candidates strictly to the active Calc window and its attached menus/dialogs,
 *   preventing text from arbitrary background or competing applications from becoming targets.
 */

import { execFileSync } from 'node:child_process';

export interface WindowBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ForegroundWindowInfo {
  hWnd: number;
  title: string;
  process: string;
  bounds: WindowBounds;
  isCalc: boolean;
}

const POWERSHELL_WIN_INFO_SCRIPT = `
$code = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinScoper {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
'@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
$h = [WinScoper]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[WinScoper]::GetWindowText($h, $sb, 256) | Out-Null
$targetPid = [uint32]0
[WinScoper]::GetWindowThreadProcessId($h, [ref]$targetPid) | Out-Null
$r = New-Object WinScoper+RECT
[WinScoper]::GetWindowRect($h, [ref]$r) | Out-Null
$pName = ""
if ($targetPid -gt 0) { $pName = (Get-Process -Id $targetPid -ErrorAction SilentlyContinue).ProcessName }

# If the foreground window is Unstuck itself (due to user clicking Check/Start in our own window),
# locate the active LibreOffice Calc window rather than falsely rejecting the user click.
$isSelf = ($pName -eq "electron" -or $pName -eq "unstuck" -or $sb.ToString() -match "Unstuck" -or $h -eq [IntPtr]::Zero)
if ($isSelf) {
    $calcProc = Get-Process -Name soffice, soffice.bin -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($calcProc) {
        $h = $calcProc.MainWindowHandle
        $sb = New-Object System.Text.StringBuilder 256
        [WinScoper]::GetWindowText($h, $sb, 256) | Out-Null
        $targetPid = [uint32]$calcProc.Id
        [WinScoper]::GetWindowRect($h, [ref]$r) | Out-Null
        $pName = $calcProc.ProcessName
    }
}

@{
    hWnd = $h.ToInt64()
    title = $sb.ToString()
    process = $pName
    left = $r.Left
    top = $r.Top
    right = $r.Right
    bottom = $r.Bottom
    width = ($r.Right - $r.Left)
    height = ($r.Bottom - $r.Top)
} | ConvertTo-Json -Compress
`;

/**
 * Checks whether the detected window title or process belongs to LibreOffice Calc.
 */
export function isCalcWindow(process: string, title: string): boolean {
  const p = (process || '').toLowerCase().trim();
  const t = (title || '').toLowerCase().trim();

  const isCalcProcess = p === 'soffice' || p === 'soffice.bin';
  const isCalcTitle =
    t.includes('calc') ||
    t.includes('libreoffice') ||
    t.includes('chart wizard') ||
    t.includes('insert chart') ||
    t.includes('untitled') ||
    t.includes('.ods') ||
    t.includes('.xlsx') ||
    t.includes('.csv');

  return isCalcProcess || isCalcTitle;
}

/**
 * Queries the active foreground window geometry and identity.
 */
export function getForegroundWindowInfo(): ForegroundWindowInfo {
  try {
    const stdout = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_WIN_INFO_SCRIPT], {
      encoding: 'utf-8',
      timeout: 3000
    });

    const parsed = JSON.parse(stdout.trim());
    const bounds: WindowBounds = {
      left: Number(parsed.left) || 0,
      top: Number(parsed.top) || 0,
      right: Number(parsed.right) || 0,
      bottom: Number(parsed.bottom) || 0,
      width: Number(parsed.width) || 0,
      height: Number(parsed.height) || 0
    };

    const isCalc = isCalcWindow(parsed.process, parsed.title);

    return {
      hWnd: Number(parsed.hWnd) || 0,
      title: String(parsed.title || ''),
      process: String(parsed.process || ''),
      bounds,
      isCalc
    };
  } catch (err) {
    // Fallback if PowerShell call fails
    return {
      hWnd: 0,
      title: '',
      process: '',
      bounds: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
      isCalc: false
    };
  }
}

/**
 * Checks if a bounding box (in physical capture pixel space) falls within the window bounds.
 * Allows a small tolerance for attached menus, dropdown popups, and titlebar margins.
 */
export function isBoxWithinWindow(
  box: { x: number; y: number; width: number; height: number },
  windowBounds: WindowBounds,
  scaleFactor = 1.25,
  toleranceLogical = 120
): boolean {
  // If window bounds are 0x0 (e.g. desktop unqueried), do not filter out
  if (windowBounds.width <= 0 || windowBounds.height <= 0) {
    return true;
  }

  // Convert box to logical desktop space for comparison with OS window bounds
  const logicalX = box.x / scaleFactor;
  const logicalY = box.y / scaleFactor;
  const logicalRight = (box.x + box.width) / scaleFactor;
  const logicalBottom = (box.y + box.height) / scaleFactor;

  const minX = windowBounds.left - toleranceLogical;
  const maxX = windowBounds.right + toleranceLogical;
  const minY = windowBounds.top - toleranceLogical;
  const maxY = windowBounds.bottom + toleranceLogical;

  return (
    logicalX >= minX &&
    logicalRight <= maxX &&
    logicalY >= minY &&
    logicalBottom <= maxY
  );
}
