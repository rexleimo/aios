# Jimeng Selectors and Error Patterns (Updated 2026-03-13)

## Current UI Structure

### Prompt Input
- Selector: `div.tiptap.ProseMirror`
- Note: NOT a textarea, it's a rich text editor div

### Bottom Toolbar (Generation Options)
Located at bottom of viewport (y:647), contains:
- Model selector (x:344): `div.lv-select.lv-select-single:has-text("图片")` or `div.lv-select:first-child`
- Version selector (x:458): Second `div.lv-select.lv-select-single`, shows "图片 4.1" or "图片 5.0"
- Ratio button (x:553): `button:has-text("1:1")`, `button:has-text("3:4")`, etc.
- Generate button (x:976): `button.lv-btn.lv-btn-primary`

### Selector Priority
1. Prompt: `div.tiptap.ProseMirror`
2. Model/Version: `div.lv-select.lv-select-single`
3. Generate: `button.lv-btn.lv-btn-primary`
4. Ratio: `button.lv-btn.lv-btn-secondary:has-text("3:4")`

## Known Issues & Workarounds

### Element Not Visible Error
- Elements at y:647 may show `clickable: false` in snapshot
- Workaround: Click anyway, or try clicking prompt box first to "wake up" the toolbar
- The tool may report timeout but the click still succeeds

### Collapsed Submit Button
- Button has class `collapsed-submit-button-o26OIS`
- Only enabled after prompt is entered
- May show as disabled initially, becomes enabled after prompt

### Navigation
- Use home page first: `https://jimeng.jianying.com/ai-tool/home/`
- Click "图片生成" button: `button.button-RNHVcx:has-text("图片生成")`

## Completion Signals
- Success: new task card with prompt text + image tiles + `重新编辑`/`再次生成` actions.
- Policy reject: explicit warning string about platform rules.
- Still running: `生成中` or `智能创意中`.

## Common Failure Modes
- `No active page`: browser not launched or profile lost.
- Selector timeout: page changed layout or hidden composer state.
- Policy block: prompt contains disallowed phrasing.
- Session expired: redirected state or login wall appears.
- Element not visible: common for bottom toolbar, try alternative selectors or force click
