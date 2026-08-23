# PowerShell script to register RiseHope FB Auto-Poster in Windows Task Scheduler
# Schedules twice-daily runs at 09:00 AM and 07:00 PM local time

$TaskName = "RiseHope_FB_AutoPoster"
$ScriptPath = "C:\Users\iakwv\Downloads\GFM New Cloaked\operator\run_auto_poster.bat"

# Trigger 1: Morning 09:00 AM
$TriggerMorning = New-ScheduledTaskTrigger -Daily -At "09:00"

# Trigger 2: Evening 07:00 PM
$TriggerEvening = New-ScheduledTaskTrigger -Daily -At "19:00"

# Action
$Action = New-ScheduledTaskAction -Execute $ScriptPath

# Settings
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Write-Host "Registering Scheduled Task: $TaskName ..." -ForegroundColor Cyan

# Unregister if already exists
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Register task
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerMorning, $TriggerEvening) -Settings $Settings -Description "Twice-daily AI content generator and publisher for RiseHope Facebook Page via OpenRouter and Residential Proxy."

Write-Host "Task '$TaskName' successfully registered for 09:00 AM and 07:00 PM daily." -ForegroundColor Green
