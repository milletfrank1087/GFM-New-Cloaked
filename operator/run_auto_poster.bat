@echo off
REM RiseHope Twice-Daily Facebook Auto-Poster Runner
cd /d "C:\Users\iakwv\Downloads\GFM New Cloaked"
python "operator\fb_auto_poster.py" --publish >> "operator\auto_poster.log" 2>&1
