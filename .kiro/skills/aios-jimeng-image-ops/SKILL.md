---
name: aios-jimeng-image-ops
description: Use when generating images on jimeng.jianying.com through browser automation, or when diagnosing unstable Jimeng execution in aios.
---

# AIOS Jimeng Image Ops

## Overview
Use this runbook for stable image generation on Jimeng. It includes selectors, completion signals, policy-failure handling, and evidence requirements verified in a live run.

## Preconditions
- Browser profile has valid Jimeng login session.
- `default` profile should connect to fingerprint browser via CDP (port `9222` by default).
- MCP tools available: `chrome.launch_cdp`, `browser.connect_cdp`, `page.goto`, `page.click`, `page.type`, `page.extract_text`, `page.get_html`, `page.screenshot`, `browser.close`.
- For page understanding, prefer `page.extract_text` first, then `page.get_html` for structure details.
- Use `page.screenshot` only when text/HTML evidence is insufficient, and prefer target-area capture over full-page screenshots when supported.
- Prompt is policy-safe (avoid risky terms, political/person-identifiable/sensitive wording).

## Execution Flow (Updated 2026-03-13)
1. Open generation page:
   - Navigate to home: `https://jimeng.jianying.com/ai-tool/home/`
   - Click "图片生成" button (selector: `button.button-RNHVcx:has-text("图片生成")`)
   - Or use direct URL: `https://jimeng.jianying.com/ai-tool/generate?enter_from=ai_feature&from_page=explore&ai_feature_name=image`
2. Use `page.extract_text` / `page.get_html` to detect login/challenge markers (captcha, risk check, 2FA, login wall); if detected, ask user to complete human action and resume.
3. Confirm prompt box exists:
   - Selector: `div.tiptap.ProseMirror` (NOT textarea, this is a rich text editor)
4. Click prompt box to activate, then fill prompt.
5. **Model & Ratio Selection (Bottom Toolbar)**:
   - Model selector: `div.lv-select:has-text("图片")` (first one, position x:344)
   - Ratio selector: Second `div.lv-select` (position x:458, shows "图片 4.1" or "图片 5.0")
   - Note: These may show `clickable: false` in snapshot but are still interactive
6. **Generate Button**:
   - Primary: `button.lv-btn.lv-btn-primary` (position x:976, y:647)
   - Note: Button may show as `collapsed-submit-button` class, enabled only after prompt is entered
7. Poll `page.extract_text` (and `page.get_html` when needed) until completion:
   - Success markers: latest task has image tiles + `重新编辑` and `再次生成`
   - Policy failure: `你输入的文字不符合平台规则，请修改后重试`
   - Timeout: still `生成中` after budget

## Error Handling
- Policy failure: rewrite prompt to neutral scene/style terms and retry once.
- Timeout: refresh generation page and retry with same prompt once.
- Selector failure: recapture snapshot and update selectors from visible controls.

## Evidence Standard
- Keep at least one snapshot proving success or failure.
- Save one screenshot for run summary.
- Record prompt, outcome, and retry path in final doc.

## Resources
- `references/run-report-2026-03-02.md`: verified live-run record.
- `references/selectors-and-errors.md`: selector cookbook and failure taxonomy.
