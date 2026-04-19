    // ══════════════════════════════════════════
    //  TEXT TIMELINE
    // ══════════════════════════════════════════
    const textTimelineContainer = $('text-timeline-container');
    const textDropZone = $('text-drop-zone');
    const textCountEl = $('text-count');
    const btnAddText = $('btn-add-text');
    const textPropsEl = $('text-props');
    const tpropText = $('tprop-text'), tpropFont = $('tprop-font'), tpropSize = $('tprop-size');
    const tpropColor = $('tprop-color'), tpropStroke = $('tprop-stroke'), tpropStrokeW = $('tprop-stroke-w');
    const tpropBg = $('tprop-bg'), tpropBgAlpha = $('tprop-bg-alpha');
    const tpropBold = $('tprop-bold'), tpropPosition = $('tprop-position');
    const tpropStart = $('tprop-start'), tpropDuration = $('tprop-duration');
    const tpropAnim = $('tprop-anim'), tpropAnimDur = $('tprop-anim-dur');
    const tpropDelete = $('tprop-delete');

    // Text items: { id, text, font, fontSize, color, strokeColor, strokeWidth, bgColor, bgAlpha, bold, position, startTime, duration, animation, animDur }
    let textItems = [];
    let nextTextId = 1;
    let selectedTextIds = new Set();
    let isTextMarqueeSelecting = false, textMarqueeState = {};
    let isTextDragging = false, isTextResizing = false, textDragState = {};
    const textBlockElements = new Map();

    function createTextBlock(item) {
      const block = document.createElement('div');
      block.className = 'text-block';
      block.dataset.id = item.id;

      const preview = document.createElement('div');
      preview.className = 'text-preview';
      block.appendChild(preview);

      const durLabel = document.createElement('div');
      durLabel.className = 'duration-label';
      block.appendChild(durLabel);

      const resL = document.createElement('div');
      resL.className = 'resize-handle-left';
      block.appendChild(resL);

      const resR = document.createElement('div');
      resR.className = 'resize-handle-right';
      block.appendChild(resR);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn'; delBtn.textContent = '×';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        textItems = textItems.filter(t => t.id !== item.id);
        selectedTextIds.delete(item.id);
        if (selectedTextIds.size === 0) hideTextProps();
        updateDeleteSelectedTextsBtn();
        renderTexts();
      };
      block.appendChild(delBtn);

      block.addEventListener('mousedown', (e) => {
        if (e.target === resL || e.target === resR || e.target === delBtn) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          toggleTextSelection(item.id);
        } else if (!selectedTextIds.has(item.id)) {
          selectText(item.id);
        }
        isTextDragging = true;
        const rect = textTimelineContainer.getBoundingClientRect();
        textDragState = { id: item.id, offsetX: e.clientX - rect.left - secToPx(item.startTime), el: block };
      });

      resR.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!selectedTextIds.has(item.id)) selectText(item.id);
        isTextResizing = true;
        textDragState = { id: item.id, edge: 'right', startX: e.clientX, origDuration: item.duration, el: block };
      });
      resL.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!selectedTextIds.has(item.id)) selectText(item.id);
        isTextResizing = true;
        textDragState = { id: item.id, edge: 'left', startX: e.clientX, origStart: item.startTime, origDuration: item.duration, el: block };
      });

      block.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!e.ctrlKey && !e.metaKey) selectText(item.id);
      });

      block._preview = preview;
      block._durLabel = durLabel;
      return block;
    }

    function updateTextBlockStyle(block, item) {
      const left = secToPx(item.startTime);
      const width = Math.max(durToPx(item.duration), 30);
      block.style.left = left + 'px';
      block.style.width = width + 'px';
      block._preview.textContent = item.text || '(empty)';
      block._preview.style.fontFamily = item.font;
      block._preview.style.color = item.color;
      block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
      block.classList.toggle('selected', selectedTextIds.size === 1 && selectedTextIds.has(item.id));
      block.classList.toggle('multi-selected', selectedTextIds.size > 1 && selectedTextIds.has(item.id));
    }

    function renderTexts() {
      textDropZone.classList.toggle('empty', textItems.length === 0);
      textCountEl.textContent = `${textItems.length} text${textItems.length !== 1 ? 's' : ''}`;

      const currentIds = new Set(textItems.map(t => t.id));
      for (const [id, el] of textBlockElements) {
        if (!currentIds.has(id)) { el.remove(); textBlockElements.delete(id); }
      }
      for (const item of textItems) {
        let block = textBlockElements.get(item.id);
        if (!block) {
          block = createTextBlock(item);
          textTimelineContainer.appendChild(block);
          textBlockElements.set(item.id, block);
        }
        updateTextBlockStyle(block, item);
      }
    }

    // Text drag/resize handlers
    document.addEventListener('mousemove', (e) => {
      if (isTextDragging) {
        const item = textItems.find(t => t.id === textDragState.id);
        if (!item) return;
        const rect = textTimelineContainer.getBoundingClientRect();
        const x = e.clientX - rect.left - textDragState.offsetX;
        item.startTime = Math.max(0, pxToSec(x));
        const block = textDragState.el;
        if (block) {
          block.style.left = secToPx(item.startTime) + 'px';
          block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
        }
        showTextProps(item.id);
      }
      if (isTextResizing) {
        const item = textItems.find(t => t.id === textDragState.id);
        if (!item) return;
        const dx = e.clientX - textDragState.startX;
        const dSec = pxToDur(dx);
        if (textDragState.edge === 'right') {
          item.duration = Math.max(0.3, textDragState.origDuration + dSec);
        } else {
          const newStart = Math.max(0, textDragState.origStart + dSec);
          const endTime = textDragState.origStart + textDragState.origDuration;
          item.startTime = newStart;
          item.duration = Math.max(0.3, endTime - newStart);
        }
        const block = textDragState.el;
        if (block) {
          block.style.left = secToPx(item.startTime) + 'px';
          block.style.width = Math.max(durToPx(item.duration), 30) + 'px';
          block._durLabel.textContent = `${item.duration.toFixed(1)}s · ${fmtShort(item.startTime)}–${fmtShort(item.startTime + item.duration)}`;
        }
        showTextProps(item.id);
      }
    });
    document.addEventListener('mouseup', () => {
      if (isTextDragging || isTextResizing) {
        isTextDragging = false; isTextResizing = false;
        renderTexts();
      }
    });

    function selectText(id) {
      selectedTextIds.clear(); selectedTextIds.add(id);
      renderTexts(); showTextProps(id); updateDeleteSelectedTextsBtn();
    }
    function toggleTextSelection(id) {
      if (selectedTextIds.has(id)) selectedTextIds.delete(id);
      else selectedTextIds.add(id);
      if (selectedTextIds.size === 1) showTextProps([...selectedTextIds][0]);
      else hideTextProps();
      renderTexts(); updateDeleteSelectedTextsBtn();
    }
    const btnDeleteSelectedTexts = $('btn-delete-selected-texts');
    function updateDeleteSelectedTextsBtn() {
      btnDeleteSelectedTexts.style.display = selectedTextIds.size > 1 ? '' : 'none';
      btnDeleteSelectedTexts.textContent = `🗑 Delete ${selectedTextIds.size} Selected`;
    }
    btnDeleteSelectedTexts.addEventListener('click', () => {
      textItems = textItems.filter(t => !selectedTextIds.has(t.id));
      selectedTextIds.clear(); hideTextProps(); updateDeleteSelectedTextsBtn(); renderTexts();
    });
    function showTextProps(id) {
      const item = textItems.find(t => t.id === id);
      if (!item) { hideTextProps(); return; }
      tpropText.value = item.text;
      tpropFont.value = item.font;
      tpropSize.value = item.fontSize;
      tpropColor.value = item.color;
      tpropStroke.value = item.strokeColor;
      tpropStrokeW.value = item.strokeWidth;
      tpropBg.value = item.bgColor;
      tpropBgAlpha.value = item.bgAlpha;
      tpropBold.checked = item.bold;
      tpropStart.value = item.startTime.toFixed(1);
      tpropDuration.value = item.duration.toFixed(1);
      tpropAnim.value = item.animation;
      tpropAnimDur.value = item.animDur;
      // Update position grid
      tpropPosition.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.pos === item.position));
      textPropsEl.classList.add('visible');
    }
    function hideTextProps() { textPropsEl.classList.remove('visible'); }
    function getSelectedText() {
      if (selectedTextIds.size !== 1) return null;
      return textItems.find(t => t.id === [...selectedTextIds][0]);
    }

    // Text property change handlers
    tpropText.addEventListener('input', () => { const it = getSelectedText(); if (it) { it.text = tpropText.value; renderTexts(); } });
    tpropFont.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.font = tpropFont.value; renderTexts(); } });
    tpropSize.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.fontSize = Math.max(12, parseInt(tpropSize.value) || 48); } });
    tpropColor.addEventListener('input', () => { const it = getSelectedText(); if (it) { it.color = tpropColor.value; renderTexts(); } });
    tpropStroke.addEventListener('input', () => { const it = getSelectedText(); if (it) { it.strokeColor = tpropStroke.value; } });
    tpropStrokeW.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.strokeWidth = Math.max(0, parseInt(tpropStrokeW.value) || 0); } });
    tpropBg.addEventListener('input', () => { const it = getSelectedText(); if (it) { it.bgColor = tpropBg.value; } });
    tpropBgAlpha.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.bgAlpha = Math.max(0, Math.min(1, parseFloat(tpropBgAlpha.value) || 0)); } });
    tpropBold.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.bold = tpropBold.checked; } });
    tpropStart.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.startTime = Math.max(0, parseFloat(tpropStart.value) || 0); renderTexts(); showTextProps(it.id); } });
    tpropDuration.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.duration = Math.max(0.3, parseFloat(tpropDuration.value) || 1); renderTexts(); showTextProps(it.id); } });
    tpropAnim.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.animation = tpropAnim.value; } });
    tpropAnimDur.addEventListener('change', () => { const it = getSelectedText(); if (it) { it.animDur = Math.max(0.1, Math.min(5, parseFloat(tpropAnimDur.value) || 0.5)); } });
    $('tprop-close').addEventListener('click', () => {
      selectedTextIds.clear(); hideTextProps(); updateDeleteSelectedTextsBtn(); renderTexts();
    });
    tpropDelete.addEventListener('click', () => {
      const it = getSelectedText();
      if (it) {
        textItems = textItems.filter(t => t.id !== it.id);
        selectedTextIds.clear(); hideTextProps(); renderTexts(); updateDeleteSelectedTextsBtn();
      }
    });
    tpropPosition.addEventListener('click', (e) => {
      if (e.target.dataset.pos) {
        const it = getSelectedText();
        if (it) { it.position = e.target.dataset.pos; showTextProps(it.id); }
      }
    });
    let textMarqueeJustFinished = false;
    textTimelineContainer.addEventListener('click', (e) => {
      if (textMarqueeJustFinished) { textMarqueeJustFinished = false; return; }
      if (e.target === textTimelineContainer) { selectedTextIds.clear(); hideTextProps(); renderTexts(); updateDeleteSelectedTextsBtn(); }
    });

    // Text marquee selection
    const textMarqueeBox = $('text-marquee-box');
    textTimelineContainer.addEventListener('mousedown', (e) => {
      if (e.target !== textTimelineContainer && e.target !== textMarqueeBox) return;
      e.preventDefault();
      const rect = textTimelineContainer.getBoundingClientRect();
      isTextMarqueeSelecting = true;
      textMarqueeState = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, rect };
      textMarqueeBox.style.display = 'block';
      textMarqueeBox.style.left = textMarqueeState.startX + 'px';
      textMarqueeBox.style.top = '0px';
      textMarqueeBox.style.width = '0px';
      textMarqueeBox.style.height = textTimelineContainer.clientHeight + 'px';
      if (!e.ctrlKey && !e.metaKey) { selectedTextIds.clear(); renderTexts(); }
    });
    document.addEventListener('mousemove', (e) => {
      if (!isTextMarqueeSelecting) return;
      const currentX = e.clientX - textMarqueeState.rect.left;
      const x = Math.min(textMarqueeState.startX, currentX);
      const w = Math.abs(currentX - textMarqueeState.startX);
      textMarqueeBox.style.left = x + 'px';
      textMarqueeBox.style.width = w + 'px';
      const startSec = pxToSec(x);
      const endSec = pxToSec(x + w);
      if (!e.ctrlKey && !e.metaKey) selectedTextIds.clear();
      for (const t of textItems) {
        const tEnd = t.startTime + t.duration;
        if (t.startTime < endSec && tEnd > startSec) selectedTextIds.add(t.id);
      }
      renderTexts(); updateDeleteSelectedTextsBtn();
    });
    document.addEventListener('mouseup', () => {
      if (isTextMarqueeSelecting) {
        isTextMarqueeSelecting = false;
        textMarqueeJustFinished = true;
        textMarqueeBox.style.display = 'none';
        if (selectedTextIds.size === 1) showTextProps([...selectedTextIds][0]);
        else hideTextProps();
      }
    });

    // ══════════════════════════════════════════
    //  SUBTITLE TIMELINE (separate from user text)
    // ══════════════════════════════════════════
    const subTimelineContainer = $('sub-timeline-container');
    const subDropZone = $('sub-drop-zone');
    const subtitleCountEl = $('subtitle-count');
    const subPropsEl = $('sub-props');
    const spropText = $('sprop-text');
    const spropStart = $('sprop-start'), spropDuration = $('sprop-duration');
    const spropDelete = $('sprop-delete');

    let selectedSubIds = new Set();
    let isSubDragging = false, isSubResizing = false, subDragState = {};
    const subBlockElements = new Map();

    function createSubBlock(item) {
      const block = document.createElement('div');
      block.className = 'sub-block';
      block.dataset.id = item.id;

      const preview = document.createElement('div');
      preview.className = 'sub-preview';
      block.appendChild(preview);

      const durLabel = document.createElement('div');
      durLabel.className = 'duration-label';
      block.appendChild(durLabel);

      const resL = document.createElement('div');
      resL.className = 'resize-handle-left';
      block.appendChild(resL);
      const resR = document.createElement('div');
      resR.className = 'resize-handle-right';
      block.appendChild(resR);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn'; delBtn.textContent = '×';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        subtitleItems = subtitleItems.filter(s => s.id !== item.id);
        selectedSubIds.delete(item.id);
        if (selectedSubIds.size === 0) hideSubProps();
        updateDeleteSelectedSubsBtn();
        renderSubtitles();
      };
      block.appendChild(delBtn);

      block.addEventListener('mousedown', (e) => {
        if (e.target === resL || e.target === resR || e.target === delBtn) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { toggleSubSelection(item.id); }
        else if (!selectedSubIds.has(item.id)) { selectSub(item.id); }
        isSubDragging = true;
        const rect = subTimelineContainer.getBoundingClientRect();
        subDragState = { id: item.id, offsetX: e.clientX - rect.left - secToPx(item.startTime), el: block };
      });

      resR.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!selectedSubIds.has(item.id)) selectSub(item.id);
        isSubResizing = true;
        subDragState = { id: item.id, edge: 'right', startX: e.clientX, origDuration: item.duration, el: block };
      });
      resL.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!selectedSubIds.has(item.id)) selectSub(item.id);
        isSubResizing = true;
        subDragState = { id: item.id, edge: 'left', startX: e.clientX, origStart: item.startTime, origDuration: item.duration, el: block };
      });

      block.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!e.ctrlKey && !e.metaKey) selectSub(item.id);
      });

      block._preview = preview;
      block._durLabel = durLabel;
      return block;
    }

    function updateSubBlockStyle(block, item) {
      const left = secToPx(item.startTime);
      const width = Math.max(durToPx(item.duration), 30);
      block.style.left = left + 'px';
      block.style.width = width + 'px';
      block._preview.textContent = item.text || '(empty)';
      block._durLabel.textContent = `${item.duration.toFixed(1)}s`;
      block.classList.toggle('selected', selectedSubIds.size === 1 && selectedSubIds.has(item.id));
    }

    function renderSubtitles() {
      if (!subDropZone) return;
      subDropZone.classList.toggle('empty', subtitleItems.length === 0);
      subtitleCountEl.textContent = `${subtitleItems.length} subtitle${subtitleItems.length !== 1 ? 's' : ''}`;

      const currentIds = new Set(subtitleItems.map(s => s.id));
      for (const [id, el] of subBlockElements) {
        if (!currentIds.has(id)) { el.remove(); subBlockElements.delete(id); }
      }
      for (const item of subtitleItems) {
        let block = subBlockElements.get(item.id);
        if (!block) {
          block = createSubBlock(item);
          subTimelineContainer.appendChild(block);
          subBlockElements.set(item.id, block);
        }
        updateSubBlockStyle(block, item);
      }
    }

    // Subtitle drag/resize
    document.addEventListener('mousemove', (e) => {
      if (isSubDragging) {
        const item = subtitleItems.find(s => s.id === subDragState.id);
        if (!item) return;
        const rect = subTimelineContainer.getBoundingClientRect();
        item.startTime = Math.max(0, pxToSec(e.clientX - rect.left - subDragState.offsetX));
        const block = subDragState.el;
        if (block) {
          block.style.left = secToPx(item.startTime) + 'px';
          block._durLabel.textContent = `${item.duration.toFixed(1)}s`;
        }
        showSubProps(item.id);
      }
      if (isSubResizing) {
        const item = subtitleItems.find(s => s.id === subDragState.id);
        if (!item) return;
        const dx = e.clientX - subDragState.startX;
        const dSec = pxToDur(dx);
        if (subDragState.edge === 'right') {
          item.duration = Math.max(0.3, subDragState.origDuration + dSec);
        } else {
          const newStart = Math.max(0, subDragState.origStart + dSec);
          const endTime = subDragState.origStart + subDragState.origDuration;
          item.startTime = newStart;
          item.duration = Math.max(0.3, endTime - newStart);
        }
        const block = subDragState.el;
        if (block) {
          block.style.left = secToPx(item.startTime) + 'px';
          block.style.width = Math.max(durToPx(item.duration), 30) + 'px';
          block._durLabel.textContent = `${item.duration.toFixed(1)}s`;
        }
        showSubProps(item.id);
      }
    });
    document.addEventListener('mouseup', () => {
      if (isSubDragging || isSubResizing) {
        isSubDragging = false; isSubResizing = false;
        renderSubtitles();
      }
    });

    function selectSub(id) {
      selectedSubIds.clear(); selectedSubIds.add(id);
      renderSubtitles(); showSubProps(id); updateDeleteSelectedSubsBtn();
    }
    function toggleSubSelection(id) {
      if (selectedSubIds.has(id)) selectedSubIds.delete(id);
      else selectedSubIds.add(id);
      if (selectedSubIds.size === 1) showSubProps([...selectedSubIds][0]);
      else hideSubProps();
      renderSubtitles(); updateDeleteSelectedSubsBtn();
    }
    const btnDeleteSelectedSubs = $('btn-delete-selected-subs');
    function updateDeleteSelectedSubsBtn() {
      if (btnDeleteSelectedSubs) {
        btnDeleteSelectedSubs.style.display = selectedSubIds.size > 1 ? '' : 'none';
        btnDeleteSelectedSubs.textContent = `🗑 Delete ${selectedSubIds.size} Selected`;
      }
    }
    if (btnDeleteSelectedSubs) {
      btnDeleteSelectedSubs.addEventListener('click', () => {
        subtitleItems = subtitleItems.filter(s => !selectedSubIds.has(s.id));
        selectedSubIds.clear(); hideSubProps(); updateDeleteSelectedSubsBtn(); renderSubtitles();
      });
    }

    function showSubProps(id) {
      const item = subtitleItems.find(s => s.id === id);
      if (!item) { hideSubProps(); return; }
      spropText.value = item.text;
      spropStart.value = item.startTime.toFixed(1);
      spropDuration.value = item.duration.toFixed(1);
      subPropsEl.classList.add('visible');
    }
    function hideSubProps() { subPropsEl.classList.remove('visible'); }
    function getSelectedSub() {
      if (selectedSubIds.size !== 1) return null;
      return subtitleItems.find(s => s.id === [...selectedSubIds][0]);
    }

    // Subtitle property handlers
    spropText.addEventListener('input', () => { const it = getSelectedSub(); if (it) { it.text = spropText.value; renderSubtitles(); } });
    spropStart.addEventListener('change', () => { const it = getSelectedSub(); if (it) { it.startTime = Math.max(0, parseFloat(spropStart.value) || 0); renderSubtitles(); showSubProps(it.id); } });
    spropDuration.addEventListener('change', () => { const it = getSelectedSub(); if (it) { it.duration = Math.max(0.3, parseFloat(spropDuration.value) || 1); renderSubtitles(); showSubProps(it.id); } });
    spropDelete.addEventListener('click', () => {
      const it = getSelectedSub();
      if (it) { subtitleItems = subtitleItems.filter(s => s.id !== it.id); selectedSubIds.clear(); hideSubProps(); renderSubtitles(); updateDeleteSelectedSubsBtn(); }
    });
    $('sprop-close').addEventListener('click', () => {
      selectedSubIds.clear(); hideSubProps(); updateDeleteSelectedSubsBtn(); renderSubtitles();
    });

    // Click empty area to deselect
    if (subTimelineContainer) {
      subTimelineContainer.addEventListener('click', (e) => {
        if (e.target === subTimelineContainer) { selectedSubIds.clear(); hideSubProps(); renderSubtitles(); updateDeleteSelectedSubsBtn(); }
      });
    }

    // Global subtitle style controls
    const btnSubStyle = $('btn-sub-style');
    const subGlobalStyle = $('sub-global-style');
    if (btnSubStyle) {
      btnSubStyle.addEventListener('click', () => {
        subGlobalStyle.style.display = subGlobalStyle.style.display === 'none' ? '' : 'none';
      });
    }
    const btnSubApplyStyle = $('btn-sub-apply-style');
    if (btnSubApplyStyle) {
      btnSubApplyStyle.addEventListener('click', () => {
        const presetEl = $('sub-global-preset');
        if (presetEl && presetEl.value) { applyEditorSubPreset(presetEl.value); return; }
        const size = Math.max(16, Math.min(72, parseInt($('sub-global-size').value) || 32));
        const color = $('sub-global-color').value;
        const stroke = $('sub-global-stroke').value;
        const strokeW = Math.max(0, parseInt($('sub-global-stroke-w').value) || 2);
        const bgAlpha = Math.max(0, Math.min(1, parseFloat($('sub-global-bg-alpha').value) || 0.5));
        const fontEl = $('sub-global-font');
        const posEl = $('sub-global-pos');
        const animEl = $('sub-global-anim');
        const animDurEl = $('sub-global-anim-dur');
        const allCapsEl = $('sub-global-all-caps');
        const boldEl = $('sub-global-bold');
        for (const sub of subtitleItems) {
          sub.fontSize = size;
          sub.color = color;
          sub.strokeColor = stroke;
          sub.strokeWidth = strokeW;
          sub.bgAlpha = bgAlpha;
          if (fontEl) sub.font = fontEl.value;
          if (posEl) sub.position = posEl.value;
          if (animEl) sub.animation = animEl.value;
          if (animDurEl) sub.animDur = Math.max(0, parseFloat(animDurEl.value) || 0.3);
          if (allCapsEl) sub.allCaps = allCapsEl.checked;
          if (boldEl) sub.bold = boldEl.checked;
        }
        setStatus(`Subtitle style applied to ${subtitleItems.length} subtitles`);
      });
    }

    function applyEditorSubPreset(preset) {
      const presets = {
        'hormozi': { fontSize: 48, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, bgAlpha: 0, font: 'Anton', position: 'bot-center', animation: 'fade', animDur: 0.2, allCaps: true, bold: true },
        'classic': { fontSize: 32, color: '#ffffff', strokeColor: '#000000', strokeWidth: 2, bgAlpha: 0.5, font: 'Poppins', position: 'bot-center', animation: 'fade', animDur: 0.3, allCaps: false, bold: true },
        'karaoke': { fontSize: 28, color: '#ffffff', strokeColor: '#000000', strokeWidth: 2, bgAlpha: 0.5, font: 'Poppins', position: 'bot-center', animation: 'fade', animDur: 0.3, allCaps: false, bold: false },
        'bold':    { fontSize: 42, color: '#ffffff', strokeColor: '#000000', strokeWidth: 2, bgAlpha: 0.6, font: 'Poppins', position: 'center',     animation: 'scale', animDur: 0.3, allCaps: true, bold: true },
        'minimal': { fontSize: 28, color: '#ffffff', strokeColor: '#000000', strokeWidth: 0, bgAlpha: 0, font: 'Inter',   position: 'bot-center', animation: 'fade', animDur: 0.3, allCaps: false, bold: false },
      };
      // Reel word-subtitle properties for each preset (must match REEL_SUB_PRESETS in 20-reels-creator.js)
      const reelPresets = {
        'hormozi': { style: 'word-by-word', subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'shadow', subSize: 5,   subPosition: 85, subFont: 'Anton',   subAllCaps: true,  subAccent: '#f7c204' },
        'classic': { style: 'highlight',    subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'dark',   subSize: 4,   subPosition: 85, subFont: 'Poppins', subAllCaps: false, subAccent: '#7c3aed' },
        'karaoke': { style: 'karaoke',      subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'dark',   subSize: 3.5, subPosition: 85, subFont: 'Poppins', subAllCaps: false, subAccent: '#7c3aed' },
        'bold':    { style: 'bold-center',  subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'dark',   subSize: 5,   subPosition: 52, subFont: 'Poppins', subAllCaps: true,  subAccent: '#f7c204' },
        'minimal': { style: 'highlight',    subColor: '#ffffff', subOutline: '#000000', subBackdrop: 'none',   subSize: 3.5, subPosition: 85, subFont: 'Inter',   subAllCaps: false, subAccent: '#7c3aed' },
      };
      const p = presets[preset];
      if (!p) return;
      for (const sub of subtitleItems) Object.assign(sub, p);
      // Sync UI controls to show the applied values
      const sz = $('sub-global-size'); if (sz) sz.value = p.fontSize;
      const col = $('sub-global-color'); if (col) col.value = p.color;
      const str = $('sub-global-stroke'); if (str) str.value = p.strokeColor;
      const strW = $('sub-global-stroke-w'); if (strW) strW.value = p.strokeWidth;
      const bg = $('sub-global-bg-alpha'); if (bg) bg.value = p.bgAlpha;
      const fn = $('sub-global-font'); if (fn) fn.value = p.font;
      const pos = $('sub-global-pos'); if (pos) pos.value = p.position;
      const an = $('sub-global-anim'); if (an) an.value = p.animation;
      const ad = $('sub-global-anim-dur'); if (ad) ad.value = p.animDur;
      const ac = $('sub-global-all-caps'); if (ac) ac.checked = p.allCaps;
      const bo = $('sub-global-bold'); if (bo) bo.checked = p.bold;
      // Apply to reel word-subtitle if present
      const rp = reelPresets[preset];
      const rs = window._editorReelSubtitle;
      if (rp && rs) {
        rs.style = rp.style; rs.subColor = rp.subColor; rs.subOutline = rp.subOutline;
        rs.subBackdrop = rp.subBackdrop; rs.subSize = rp.subSize; rs.subPosition = rp.subPosition;
        rs.subFont = rp.subFont; rs.subAllCaps = rp.subAllCaps; rs.subAccent = rp.subAccent;
        // Sync sub-reel-row controls
        const srs = $('sub-reel-style'); if (srs) srs.value = rp.style;
        const srf = $('sub-reel-font'); if (srf) srf.value = rp.subFont;
        const srca = $('sub-reel-all-caps'); if (srca) srca.checked = rp.subAllCaps;
        const src = $('sub-reel-color'); if (src) src.value = rp.subColor;
        const sracc = $('sub-reel-accent'); if (sracc) sracc.value = rp.subAccent;
        const sro = $('sub-reel-outline'); if (sro) sro.value = rp.subOutline;
        const srb = $('sub-reel-backdrop'); if (srb) srb.value = rp.subBackdrop;
        const srz = $('sub-reel-size'); if (srz) srz.value = rp.subSize;
        const srl = $('sub-reel-size-label'); if (srl) srl.textContent = rp.subSize;
        const srp2 = $('sub-reel-pos'); if (srp2) srp2.value = (rp.subPosition <= 20 ? 'top' : rp.subPosition <= 65 ? 'center' : 'bottom');
        const srpn = $('sub-reel-pos-num'); if (srpn) { srpn.value = rp.subPosition; const srpl = $('sub-reel-pos-label'); if (srpl) srpl.textContent = rp.subPosition + '%'; }
        // Sync reel globals
        if (typeof reelSubtitleStyle !== 'undefined') {
          reelSubtitleStyle = rp.style; reelSubColor = rp.subColor; reelSubOutline = rp.subOutline;
          reelSubBackdrop = rp.subBackdrop; reelSubSize = rp.subSize; reelSubPosition = rp.subPosition;
          reelSubFont = rp.subFont; reelSubAllCaps = rp.subAllCaps; reelSubAccent = rp.subAccent;
        }
        // Re-render inline preview
        if (typeof renderInlineFrame === 'function' && typeof previewPlaying !== 'undefined' && !previewPlaying) {
          const t = (inlineScrub?.value / 1000) * (currentBuffer?.duration || 1);
          renderInlineFrame(t);
        }
      }
      setStatus(`${preset.charAt(0).toUpperCase() + preset.slice(1)} preset applied to ${subtitleItems.length} subtitles`);
    }

    // Auto-apply preset on dropdown change
    const subGlobalPresetEl = $('sub-global-preset');
    if (subGlobalPresetEl) {
      subGlobalPresetEl.addEventListener('change', () => {
        if (subGlobalPresetEl.value) applyEditorSubPreset(subGlobalPresetEl.value);
      });
    }

    // Add text button
    btnAddText.addEventListener('click', () => {
      const dur = aDur();
      const defaultDur = Math.min(5, dur / 4);
      textItems.push({
        id: nextTextId++,
        text: 'Text',
        font: "'Noto Sans Tamil', sans-serif",
        fontSize: 48,
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 2,
        bgColor: '#000000',
        bgAlpha: 0,
        bold: false,
        position: 'center',
        startTime: 0,
        duration: defaultDur,
        animation: 'fade',
        animDur: 0.5,
      });
      selectText(textItems[textItems.length - 1].id);
      renderTexts();
    });
