Visual Health Clinic Tools - v2.26.8
====================================
Full Electron project, including Weekly and Monthly Reports.

HOTFIX: Fixes Monthly Confirm and Save failing with:
TypeError: excel.requireFile is not a function

The Monthly Excel adapter now exposes the file validation method used by
the real IPC backend; a new regression test checks the complete save path.
No other reporting rules, data locations, or files are changed.

WINDOWS (Node.js 22.12+):
1. Extract this ZIP to a NEW directory, keeping the folder structure.
2. Run VALIDAR_SEM_BUILD.bat.
3. If successful, run BUILD_WINDOWS.bat.
4. EXE is created at dist\VHLC Clinic Tools.exe.
5. Close Excel and test Confirm and Save with a COPY of the workbook first.

The ZIP includes source and build scripts, not a Windows EXE.
See docs/RELEASE_V2_26_7.md.
