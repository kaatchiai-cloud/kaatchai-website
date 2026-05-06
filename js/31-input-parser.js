// Input Formats — Phases 1-5: Format detection, prose/screenplay parsing,
// AI classification, confidence aggregation, review gate UI.
// Reference: input-formats-plan.md §6-10.
// Produces window.createJobState.inputDoc.parsed for downstream pipelines.

(function () {
'use strict';

// ── Phase 1: Text normalization + format detection ────────────────────────

function normalizeRawText(text) {
  return text
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/—/g, '---')
    .replace(/–/g, '--')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/\r\n|\r/g, '\n');
}

function detectInputFormat(rawText) {
  const norm = normalizeRawText(rawText);
  const screenplayHeading = /^\s*(INT\.|EXT\.|INT\/EXT\.|I\/E\s|FADE IN:|FADE OUT)/m;
  // Character cue: ALL-CAPS line 4+ spaces indent followed by another indented line
  const characterCue = /^\s{4,}([A-Z][A-Z\s]{2,30})\s*(\([^)]*\))?\s*$\n^\s{4,}/m;
  if (screenplayHeading.test(norm) || characterCue.test(norm)) {
    return { format: 'screenplay', confidence: 0.95 };
  }
  return { format: 'prose', confidence: 0.95 };
}

// ── Phase 2: Prose parser ─────────────────────────────────────────────────

function normalizeSpeakerCasing(rawName, lockedCast) {
  const normalized = rawName.trim();
  const match = (lockedCast || []).find(c => c.name.toLowerCase() === normalized.toLowerCase());
  return match ? match.name : normalized;
}

function parseProse(rawText, lockedCast) {
  const lines = rawText.split('\n');
  const dialogueLines = [];
  const actionLines = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // Pass 1 — bracket tokens
    const btResult = (typeof window.castParseBracketTokens === 'function')
      ? window.castParseBracketTokens(trimmed)
      : { tokens: [] };
    const hasBrackets = btResult.tokens.length > 0;

    // Pass 2 — Speaker-tagged: "Maya: dialogue text"
    const speakerTagMatch = trimmed.match(/^([A-Z][A-Za-z0-9 _-]{0,30}):\s+(.+)$/);
    if (speakerTagMatch) {
      dialogueLines.push({
        speakerName: normalizeSpeakerCasing(speakerTagMatch[1], lockedCast),
        text: speakerTagMatch[2],
        speakerConfidence: 1.0,
        sourceLineNum: i + 1,
        performanceCue: null,
        mood: 'matter-of-fact',
        moodConfidence: null,
        bracketAdjacent: hasBrackets,
      });
      continue;
    }

    // Pass 3 — [BracketName] said "dialogue"
    if (hasBrackets) {
      const speechVerb = /(?:said|replied|asked|whispered|shouted|murmured|muttered|exclaimed|added|noted|sighed)/i;
      const quotedMatch = trimmed.match(/"([\s\S]*?)"|'([\s\S]*?)'/);
      if (speechVerb.test(trimmed) && quotedMatch) {
        const firstToken = btResult.tokens[0];
        if (firstToken) {
          dialogueLines.push({
            speakerName: normalizeSpeakerCasing(firstToken, lockedCast),
            text: quotedMatch[1] || quotedMatch[2],
            speakerConfidence: 1.0,
            sourceLineNum: i + 1,
            performanceCue: null,
            mood: 'matter-of-fact',
            moodConfidence: null,
            bracketAdjacent: true,
          });
          continue;
        }
      }
    }

    // Pass 4 — Orphan quoted dialogue (no speaker tag — AI infers later)
    const orphanMatch = trimmed.match(/"([^"]+)"|'([^']+)'/);
    if (orphanMatch) {
      dialogueLines.push({
        speakerName: null,
        text: orphanMatch[1] || orphanMatch[2],
        speakerConfidence: 0.0,
        sourceLineNum: i + 1,
        performanceCue: null,
        mood: 'matter-of-fact',
        moodConfidence: null,
        bracketAdjacent: false,
      });
      continue;
    }

    // Pass 5 — Action line
    actionLines.push({ text: trimmed, sourceLineNum: i + 1, confidence: 1.0 });
  }

  // Pass 6 — Multi-line continuation merge
  const merged = mergeContinuations(dialogueLines, actionLines);
  return {
    sceneHeadings: null,
    sceneBreaks: null,
    dialogueLines: merged.dialogueLines,
    actionLines: merged.actionLines,
    detectedSpeakers: buildDetectedSpeakers(merged.dialogueLines, lockedCast),
  };
}

function mergeContinuations(dialogueLines, actionLines) {
  const all = [
    ...dialogueLines.map(d => ({ kind: 'dialogue', ...d })),
    ...actionLines.map(a => ({ kind: 'action', ...a })),
  ].sort((x, y) => x.sourceLineNum - y.sourceLineNum);

  const result = [];
  for (const item of all) {
    const prev = result[result.length - 1];
    if (prev && prev.kind === 'dialogue' && item.kind === 'action') {
      const prevEndsClean = /[.!?"]$/.test(prev.text.trim());
      const itemStartsLower = /^[a-z]/.test(item.text.trim());
      if (!prevEndsClean || itemStartsLower) {
        prev.text = (prev.text.trim() + ' ' + item.text.trim()).trim();
        continue;
      }
    }
    result.push(item);
  }
  return {
    dialogueLines: result.filter(r => r.kind === 'dialogue').map(({ kind, ...rest }) => rest),
    actionLines: result.filter(r => r.kind === 'action').map(({ kind, ...rest }) => rest),
  };
}

// ── Phase 3: Screenplay parser via fountain-js ─────────────────────────────

function parseScreenplay(rawText, lockedCast) {
  if (typeof Fountain === 'undefined') {
    console.warn('[InputParser] fountain-js not loaded; falling back to prose parser');
    return parseProse(rawText, lockedCast);
  }
  let tokens;
  try {
    const f = new Fountain();
    const result = f.parse(rawText, true);
    tokens = result.tokens || [];
  } catch (e) {
    console.warn('[InputParser] fountain-js parse error; falling back to prose:', e.message);
    return parseProse(rawText, lockedCast);
  }

  const sceneHeadings = [];
  const dialogueLines = [];
  const actionLines = [];
  let sceneIdx = -1;
  let currentChar = null;
  let lineNum = 0;

  for (const tok of tokens) {
    lineNum++;
    if (tok.type === 'scene_heading') {
      sceneIdx++;
      const locStr = (tok.location || tok.text || '').trim();
      const indoor = /^INT/i.test(locStr);
      sceneHeadings.push({
        location: locStr,
        timeOfDay: tok.time_of_day || null,
        sceneIdx,
        sourceLineNum: lineNum,
        indoor,
        confidence: 1.0,
      });
      currentChar = null;
    } else if (tok.type === 'character') {
      currentChar = {
        name: normalizeSpeakerCasing(tok.text || '', lockedCast),
        extension: tok.extension || null,
      };
    } else if (tok.type === 'parenthetical') {
      if (currentChar) {
        // Attach to the last dialogue line if same character
        const last = dialogueLines[dialogueLines.length - 1];
        if (last && last.speakerName === currentChar.name) {
          last.performanceCue = tok.text || null;
        }
      }
    } else if (tok.type === 'dialogue') {
      if (currentChar) {
        dialogueLines.push({
          speakerName: currentChar.name,
          speakerCharacterId: null,
          text: tok.text || '',
          performanceCue: null,
          mood: 'matter-of-fact',
          moodConfidence: null,
          speakerConfidence: 1.0,
          sourceLineNum: lineNum,
          isVoiceOver: (currentChar.extension || '').toUpperCase().includes('V.O'),
          isExtraSpeaker: false,
        });
      }
    } else if (tok.type === 'action') {
      actionLines.push({ text: tok.text || '', sourceLineNum: lineNum, confidence: 1.0 });
      currentChar = null;
    } else {
      // transition, section, etc — reset character context
      if (tok.type !== 'parenthetical') currentChar = null;
    }
  }

  return {
    sceneHeadings,
    sceneBreaks: sceneHeadings.map(s => s.sceneIdx),
    dialogueLines,
    actionLines,
    detectedSpeakers: buildDetectedSpeakers(dialogueLines, lockedCast),
  };
}

function buildDetectedSpeakers(dialogueLines, lockedCast) {
  const map = {};
  for (const dl of dialogueLines) {
    if (!dl.speakerName) continue;
    if (!map[dl.speakerName]) {
      const castMatch = (lockedCast || []).find(c => c.name === dl.speakerName);
      map[dl.speakerName] = {
        name: dl.speakerName,
        lineCount: 0,
        firstAppearanceLineNum: dl.sourceLineNum,
        isInUserCast: !!castMatch,
        characterId: castMatch ? castMatch.id : null,
      };
    }
    map[dl.speakerName].lineCount++;
  }
  return Object.values(map);
}

// ── Phase 4: AI classification (mood + speaker inference) ─────────────────

async function runAIClassification(parsed, geminiKey) {
  if (!geminiKey) return parsed;

  const cues = parsed.dialogueLines
    .map((d, i) => ({ i, cue: d.performanceCue }))
    .filter(x => x.cue);
  const unattributed = parsed.dialogueLines
    .map((d, i) => ({ i, text: d.text, lineNum: d.sourceLineNum }))
    .filter(x => parsed.dialogueLines[x.i].speakerConfidence === 0.0);

  const hasCues = cues.length > 0;
  const hasUnattributed = unattributed.length > 0;
  if (!hasCues && !hasUnattributed) return parsed;

  // Build single batched prompt
  let promptParts = [];
  if (hasCues) {
    promptParts.push(
      'TASK A — Performance cue classification.\n' +
      'For each parenthetical below, return the closest mood from:\n' +
      '[matter-of-fact, calm, warm, serious, excited, angry, sad, whispered, playful, concerned, urgent, sarcastic]\n' +
      'For delivery cues (off-screen, beat, V.O., voice-over) return "matter-of-fact".\n' +
      'Return JSON: { "cues": [{ "cueIdx": 0, "mood": "...", "confidence": 0.0 }] }\n\n' +
      'Parentheticals:\n' +
      cues.map((c, idx) => `${idx}: "${c.cue}"`).join('\n')
    );
  }
  if (hasUnattributed) {
    const docContext = parsed.dialogueLines.map((d, i) =>
      `Line ${d.sourceLineNum}: ${d.speakerName ? d.speakerName + ': ' : ''}${d.text}`
    ).join('\n');
    promptParts.push(
      'TASK B — Speaker inference for unattributed dialogue.\n' +
      'From the document context, infer the most likely speaker for each unattributed line.\n' +
      'Use null when context is insufficient.\n' +
      'Return JSON: { "speakers": [{ "lineIdx": 0, "inferredSpeaker": "Maya"|null, "confidence": 0.0 }] }\n\n' +
      'Document context:\n' + docContext + '\n\n' +
      'Unattributed lines:\n' +
      unattributed.map((u, idx) => `${idx}: line ${u.lineNum} — "${u.text}"`).join('\n')
    );
  }

  const combinedPrompt = promptParts.join('\n\n---\n\n') +
    '\n\nReturn a single JSON object with keys "cues" and/or "speakers" as applicable.';

  try {
    const resp = await callGeminiAPI(['gemini-2.5-flash'], {
      contents: [{ parts: [{ text: combinedPrompt }] }],
      generationConfig: { response_mime_type: 'application/json' },
    }, geminiKey);
    const raw = resp.candidates?.[0]?.content?.parts?.[0]?.text;
    const data = (typeof parseGeminiJson === 'function') ? parseGeminiJson(raw) : JSON.parse(raw || '{}');

    // Apply cue classifications
    if (hasCues && Array.isArray(data.cues)) {
      for (const entry of data.cues) {
        const origCue = cues[entry.cueIdx];
        if (!origCue) continue;
        const dl = parsed.dialogueLines[origCue.i];
        if (!dl) continue;
        const moodValid = (window.MOOD_ENUM || []).some(m => m.id === entry.mood);
        dl.mood = moodValid ? entry.mood : 'matter-of-fact';
        dl.moodConfidence = typeof entry.confidence === 'number' ? entry.confidence : 0.5;
      }
    }

    // Apply speaker inferences
    if (hasUnattributed && Array.isArray(data.speakers)) {
      for (const entry of data.speakers) {
        const orig = unattributed[entry.lineIdx];
        if (!orig) continue;
        const dl = parsed.dialogueLines[orig.i];
        if (!dl) continue;
        if (entry.inferredSpeaker) {
          const lockedCast = (window.createJobState && window.createJobState.characters || []).filter(c => c.locked);
          dl.speakerName = normalizeSpeakerCasing(entry.inferredSpeaker, lockedCast);
          dl.speakerConfidence = typeof entry.confidence === 'number' ? entry.confidence : 0.6;
        }
        // null inferredSpeaker: leave speakerConfidence 0.0 (triggers review)
      }
    }
  } catch (e) {
    console.warn('[InputParser] AI classification failed:', e.message);
  }

  return parsed;
}

// ── Phase 5: Confidence aggregation + review gate UI ─────────────────────

function collectLowConfidenceItems(parsed) {
  const items = [];
  for (let i = 0; i < parsed.dialogueLines.length; i++) {
    const d = parsed.dialogueLines[i];
    if (d.speakerConfidence < 0.7) {
      items.push({ category: 'speakerAttribution', lineIdx: i, currentValue: d.speakerName, fieldPath: `dialogueLines[${i}].speakerName`, confidence: d.speakerConfidence });
    }
    if (d.performanceCue && d.moodConfidence !== null && d.moodConfidence < 0.7) {
      items.push({ category: 'moodClassification', lineIdx: i, currentValue: d.mood, fieldPath: `dialogueLines[${i}].mood`, confidence: d.moodConfidence });
    }
  }
  return items;
}

function aggregateConfidence(parsed) {
  const dialogueCount = parsed.dialogueLines.length;
  const highConfDlg = parsed.dialogueLines.filter(d => d.speakerConfidence >= 0.5).length;
  const speakerScore = dialogueCount > 0 ? highConfDlg / dialogueCount : null;

  const cuedDlg = parsed.dialogueLines.filter(d => d.performanceCue && d.moodConfidence !== null);
  const highMood = cuedDlg.filter(d => d.moodConfidence >= 0.7).length;
  const moodScore = cuedDlg.length > 0 ? highMood / cuedDlg.length : null;

  const sceneHeadingScore = parsed.sceneHeadings ? 1.0 : null;

  const weights = { speakerAttribution: 0.5, moodClassification: 0.2, sceneHeadings: 0.3 };
  const scores = { speakerAttribution: speakerScore, moodClassification: moodScore, sceneHeadings: sceneHeadingScore };

  const activeWeightSum = Object.entries(scores)
    .filter(([, s]) => s !== null)
    .reduce((sum, [k]) => sum + weights[k], 0);

  if (activeWeightSum === 0) {
    return { overall: null, perCategory: scores, reviewRequired: true, reformatSuggested: true, lowConfidenceItems: [] };
  }

  let overall = 0;
  for (const [k, s] of Object.entries(scores)) {
    if (s !== null) overall += s * (weights[k] / activeWeightSum);
  }

  return {
    overall,
    perCategory: scores,
    reviewRequired: overall < 0.8,
    reformatSuggested: overall < 0.5,
    lowConfidenceItems: collectLowConfidenceItems(parsed),
  };
}

// ── Reformat-as-screenplay ─────────────────────────────────────────────────

function sanitizeFountainOutput(raw) {
  let text = String(raw || '');
  text = text.replace(/^\s*```(?:fountain|screenplay)?\s*\n/i, '');
  text = text.replace(/\n\s*```\s*$/, '');
  const lines = text.split('\n');
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^(INT\.|EXT\.|INT\/EXT\.|FADE IN:|FADE OUT|[A-Z][A-Z\s]{2,30}\s*(\(.+\))?$)/i.test(t)) {
      startIdx = i;
      break;
    }
  }
  return lines.slice(startIdx).join('\n').trim();
}

async function reformatAsScreenplay(rawText, geminiKey) {
  const prompt = `Rewrite the following prose as a properly formatted screenplay in Fountain syntax. Follow Fountain conventions strictly:

RULES:
- Scene headings: lines beginning with INT., EXT., or INT./EXT., followed by location and (optionally) "- TIME OF DAY"
- Character cues: ALL CAPS, indented at least 4 spaces, alone on a line
- Parentheticals: in (), on the line directly below a character cue, indented 8+ spaces — describe ONE word emotional/delivery cue
- Dialogue: indented 4+ spaces, on lines below the character cue / parenthetical
- Action: left-aligned, no special formatting, separates beats
- Transitions: RIGHT-ALIGNED in ALL CAPS, ending with TO: or IN/OUT

CONSTRAINTS:
- Preserve ALL dialogue and narrative content from the prose verbatim
- Make character cues explicit using the most likely character
- Map prose performance descriptions to parentheticals: (whispered), (shouting)
- Output ONLY the Fountain-formatted screenplay. No commentary, no preamble, no markdown fencing.

Prose input:
${rawText}`;

  const resp = await callGeminiAPI(['gemini-2.5-flash'], {
    contents: [{ parts: [{ text: prompt }] }],
  }, geminiKey);
  const raw = resp.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return sanitizeFountainOutput(raw);
}

// ── Review gate UI ─────────────────────────────────────────────────────────

function showInputReviewModal(parsed, parseConfidence, onConfirm, onBack) {
  const existing = document.getElementById('input-review-modal');
  if (existing) existing.remove();

  const lockedCast = (window.createJobState && window.createJobState.characters || []).filter(c => c.locked);
  const moodOptions = (window.MOOD_ENUM || []).map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('');

  const overallPct = parseConfidence.overall !== null ? Math.round(parseConfidence.overall * 100) : '?';
  const isReformat = parseConfidence.reformatSuggested;

  // Group low-confidence items into chunks of ~10 dialogue lines (prose) or by scene (screenplay)
  const hasScenes = parsed.sceneHeadings && parsed.sceneHeadings.length > 0;
  const lowItems = parseConfidence.lowConfidenceItems || [];

  function makeGroups() {
    if (hasScenes) {
      // Group by scene heading
      const groups = parsed.sceneHeadings.map((sh, gi) => ({
        label: `Scene ${gi + 1} — ${sh.location}${sh.timeOfDay ? ' / ' + sh.timeOfDay : ''}`,
        items: lowItems.filter(item => {
          const dl = parsed.dialogueLines[item.lineIdx];
          const nextScene = parsed.sceneHeadings[gi + 1];
          return dl && dl.sourceLineNum >= sh.sourceLineNum &&
            (!nextScene || dl.sourceLineNum < nextScene.sourceLineNum);
        }),
      }));
      return groups.filter(g => g.items.length > 0);
    }
    // Prose: chunks of 10
    const CHUNK = 10;
    const total = parsed.dialogueLines.length;
    const groups = [];
    for (let start = 0; start < total; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, total - 1);
      const items = lowItems.filter(item => item.lineIdx >= start && item.lineIdx <= end);
      if (items.length) {
        groups.push({ label: `Lines ${start + 1}–${end + 1}`, items });
      }
    }
    return groups;
  }

  const groups = makeGroups();

  function renderGroup(g) {
    const badges = `<span class="review-group-badge">${g.items.length} item${g.items.length !== 1 ? 's' : ''}</span>`;
    const itemsHtml = g.items.map(item => {
      const dl = parsed.dialogueLines[item.lineIdx];
      if (!dl) return '';
      const excerpt = dl.text.length > 60 ? dl.text.slice(0, 60) + '…' : dl.text;
      if (item.category === 'speakerAttribution') {
        const options = [
          '<option value="">— Unknown —</option>',
          ...lockedCast.map(c => `<option value="${c.name}" ${dl.speakerName === c.name ? 'selected' : ''}>${c.name}</option>`),
          ...(dl.speakerName && !lockedCast.find(c => c.name === dl.speakerName)
            ? [`<option value="${dl.speakerName}" selected>${dl.speakerName} (inferred)</option>`] : []),
        ].join('');
        return `<div class="review-item" data-line-idx="${item.lineIdx}" data-field="speakerName">
          <div class="review-item-text">"${excerpt}"</div>
          <div class="review-item-row">
            <span class="review-label">Speaker <span class="review-confidence-badge">⚠ inferred</span></span>
            <select class="review-select" data-line-idx="${item.lineIdx}" data-field="speakerName">${options}</select>
          </div>
        </div>`;
      }
      if (item.category === 'moodClassification') {
        return `<div class="review-item" data-line-idx="${item.lineIdx}" data-field="mood">
          <div class="review-item-text">"${excerpt}"<span class="review-cue"> — (${dl.performanceCue})</span></div>
          <div class="review-item-row">
            <span class="review-label">Mood <span class="review-confidence-badge">⚠ low confidence</span></span>
            <select class="review-select" data-line-idx="${item.lineIdx}" data-field="mood">${moodOptions}</select>
          </div>
        </div>`;
      }
      return '';
    }).join('');
    return `<details class="review-group" open>
      <summary class="review-group-summary">${g.label} ${badges}</summary>
      <div class="review-group-items">${itemsHtml}</div>
    </details>`;
  }

  const reformatSection = isReformat ? `
    <div class="reformat-banner">
      <div class="reformat-banner-title">Input is hard to parse cleanly</div>
      <p class="text-sm" style="margin:6px 0 12px;">~${100 - overallPct}% of dialogue speakers are uncertain. Options:</p>
      <div class="reformat-options">
        <div class="reformat-option">
          <button id="btn-reformat-screenplay" class="primary btn-sm">↺ Rewrite as screenplay</button>
          <span class="text-xs text-muted">~$0.05 · ~10s · review before continuing</span>
        </div>
        <div class="reformat-option">
          <button id="btn-reformat-manual" class="btn-sm">Manual review →</button>
          <span class="text-xs text-muted">${lowItems.length} items to confirm</span>
        </div>
      </div>
    </div>` : '';

  const reviewSection = !isReformat && groups.length > 0 ? `
    <div class="review-groups-container">
      ${groups.map(renderGroup).join('')}
    </div>` : (isReformat ? '' : '<p class="text-sm text-muted">All items look good — confirm to continue.</p>');

  const modal = document.createElement('div');
  modal.id = 'input-review-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box input-review-modal-box">
      <h3 class="modal-title">Review parsed input</h3>
      <p class="text-sm text-muted mb-md">
        Parse confidence: <strong>${overallPct}%</strong>${parseConfidence.overall !== null && parseConfidence.overall >= 0.8 ? ' — all good!' : ' — review the highlighted items below.'}
      </p>
      ${reformatSection}
      ${reviewSection}
      <div class="modal-footer" style="margin-top:20px;">
        <button id="input-review-back" class="btn-sm">← Back to input</button>
        <button id="input-review-confirm" class="primary btn-sm"${groups.length === 0 || isReformat ? '' : ''}>Confirm and continue →</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Set initial select values for mood dropdowns
  modal.querySelectorAll('select[data-field="mood"]').forEach(sel => {
    const lineIdx = parseInt(sel.dataset.lineIdx, 10);
    const dl = parsed.dialogueLines[lineIdx];
    if (dl && dl.mood) sel.value = dl.mood;
  });

  // Live updates on change
  modal.querySelectorAll('.review-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const lineIdx = parseInt(sel.dataset.lineIdx, 10);
      const field = sel.dataset.field;
      const dl = parsed.dialogueLines[lineIdx];
      if (!dl) return;
      dl[field] = sel.value;
      if (field === 'speakerName') dl.speakerConfidence = 1.0;
      if (field === 'mood') dl.moodConfidence = 1.0;
    });
  });

  modal.querySelector('#input-review-back').addEventListener('click', () => {
    modal.remove();
    onBack();
  });
  modal.querySelector('#input-review-confirm').addEventListener('click', () => {
    modal.remove();
    onConfirm(parsed);
  });

  if (isReformat) {
    const btnReformat = modal.querySelector('#btn-reformat-screenplay');
    const btnManual   = modal.querySelector('#btn-reformat-manual');
    if (btnReformat) btnReformat.addEventListener('click', async () => {
      btnReformat.disabled = true;
      btnReformat.textContent = '⏳ Rewriting…';
      try {
        const geminiKey = (typeof getCreateGeminiKey === 'function') ? getCreateGeminiKey() : null;
        if (!geminiKey) throw new Error('Gemini key required');
        const reformatted = await reformatAsScreenplay(window.createJobState.inputDoc.rawText, geminiKey);
        modal.remove();
        showReformatDiffModal(window.createJobState.inputDoc.rawText, reformatted, onConfirm, onBack);
      } catch (e) {
        btnReformat.disabled = false;
        btnReformat.textContent = '↺ Rewrite as screenplay';
        console.warn('[InputParser] reformat failed:', e.message);
        alert('Reformat failed: ' + e.message);
      }
    });
    if (btnManual) btnManual.addEventListener('click', () => {
      // Switch to manual review — show review groups
      modal.querySelector('.reformat-banner').style.display = 'none';
      const rsc = modal.querySelector('.review-groups-container');
      if (!rsc) {
        // Rebuild with review section
        const container = document.createElement('div');
        container.className = 'review-groups-container';
        container.innerHTML = groups.map(renderGroup).join('');
        modal.querySelector('.modal-box').insertBefore(container, modal.querySelector('.modal-footer'));
        container.querySelectorAll('.review-select').forEach(sel => {
          const lineIdx = parseInt(sel.dataset.lineIdx, 10);
          const field = sel.dataset.field;
          const dl = parsed.dialogueLines[lineIdx];
          if (!dl) return;
          sel.addEventListener('change', () => {
            dl[field] = sel.value;
            if (field === 'speakerName') dl.speakerConfidence = 1.0;
            if (field === 'mood') dl.moodConfidence = 1.0;
          });
          if (field === 'mood' && dl && dl.mood) sel.value = dl.mood;
        });
      } else {
        rsc.style.display = '';
      }
    });
  }
}

function showReformatDiffModal(original, reformatted, onConfirm, onBack) {
  const modal = document.createElement('div');
  modal.id = 'reformat-diff-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:800px;max-height:80vh;display:flex;flex-direction:column;">
      <h3 class="modal-title">Review rewritten screenplay</h3>
      <div class="reformat-diff-grid">
        <div class="reformat-diff-col">
          <div class="reformat-diff-label">Original prose</div>
          <textarea class="reformat-diff-text" readonly>${original.replace(/</g,'&lt;')}</textarea>
        </div>
        <div class="reformat-diff-col">
          <div class="reformat-diff-label">Rewritten as Fountain screenplay</div>
          <textarea id="reformat-edited-output" class="reformat-diff-text">${reformatted.replace(/</g,'&lt;')}</textarea>
        </div>
      </div>
      <div class="modal-footer" style="margin-top:16px;">
        <button id="reformat-reject" class="btn-sm">← Back</button>
        <button id="reformat-accept" class="primary btn-sm">Accept and continue →</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#reformat-reject').addEventListener('click', () => {
    modal.remove();
    // Show original review modal
    const lockedCast = (window.createJobState && window.createJobState.characters || []).filter(c => c.locked);
    const rawText = window.createJobState.inputDoc.rawText;
    const detResult = detectInputFormat(rawText);
    const parsed = detResult.format === 'screenplay' ? parseScreenplay(rawText, lockedCast) : parseProse(rawText, lockedCast);
    const conf = aggregateConfidence(parsed);
    showInputReviewModal(parsed, conf, onConfirm, onBack);
  });

  modal.querySelector('#reformat-accept').addEventListener('click', async () => {
    const edited = modal.querySelector('#reformat-edited-output').value;
    modal.remove();
    // Replace working copy and re-parse
    if (window.createJobState && window.createJobState.inputDoc) {
      window.createJobState.inputDoc.rawText = edited;
      window.createJobState.inputDoc.reformatAttempted = true;
    }
    const lockedCast = (window.createJobState && window.createJobState.characters || []).filter(c => c.locked);
    const detResult = detectInputFormat(edited);
    const reparsed = detResult.format === 'screenplay' ? parseScreenplay(edited, lockedCast) : parseProse(edited, lockedCast);
    const conf = aggregateConfidence(reparsed);
    if (conf.reformatSuggested) {
      // Loop prevention (audit fix C4)
      alert('Reformat didn\'t improve parseability. Edit your input manually.');
      onBack();
      return;
    }
    if (conf.reviewRequired) {
      showInputReviewModal(reparsed, conf, onConfirm, onBack);
    } else {
      onConfirm(reparsed);
    }
  });
}

// ── Main entry: parse text input → populate inputDoc ─────────────────────

async function parseTextInput(rawText, geminiKey) {
  if (!rawText || !rawText.trim()) throw new Error('No text provided');

  const normalized = normalizeRawText(rawText);
  const detResult = detectInputFormat(normalized);

  const lockedCast = (window.createJobState && window.createJobState.characters || []).filter(c => c.locked);

  // Initialize inputDoc
  if (!window.createJobState) window.createJobState = {};
  window.createJobState.inputDoc = Object.assign(window.createJobState.inputDoc || {}, {
    format: detResult.format,
    rawTextOriginal: rawText,
    rawText: normalized,
    detectedAt: new Date().toISOString(),
    detectionConfidence: detResult.confidence,
    locked: false,
    lockedAt: null,
    reviewGate: { status: 'pending', reviewedAt: null, userCorrections: 0, reformatAttempted: false },
  });

  // Stage 2 — deterministic parsing
  let parsed = detResult.format === 'screenplay'
    ? parseScreenplay(normalized, lockedCast)
    : parseProse(normalized, lockedCast);

  // Stage 3 — AI classification
  parsed = await runAIClassification(parsed, geminiKey);

  // Stage 4 — confidence aggregation
  const parseConfidence = aggregateConfidence(parsed);
  window.createJobState.inputDoc.parsed = parsed;
  window.createJobState.inputDoc.parseConfidence = parseConfidence;

  return { parsed, parseConfidence };
}

// Returns a Promise that resolves when the review gate is passed (or auto-passes).
// Caller awaits this before proceeding to storyboard.
function runReviewGate(parsed, parseConfidence) {
  return new Promise((resolve, reject) => {
    const idoc = window.createJobState && window.createJobState.inputDoc;

    if (!parseConfidence.reviewRequired && !parseConfidence.reformatSuggested) {
      // Auto-pass
      if (idoc) idoc.reviewGate.status = 'auto-passed';
      resolve(parsed);
      return;
    }

    const onConfirm = (finalParsed) => {
      if (idoc) {
        idoc.parsed = finalParsed;
        idoc.reviewGate.status = 'reviewed';
        idoc.reviewGate.reviewedAt = new Date().toISOString();
        idoc.locked = true;
        idoc.lockedAt = idoc.reviewGate.reviewedAt;
        idoc.reviewGate.status = 'locked';
      }
      resolve(finalParsed);
    };
    const onBack = () => reject(new Error('USER_BACK'));

    showInputReviewModal(parsed, parseConfidence, onConfirm, onBack);
  });
}

// ── Lock + handoff ─────────────────────────────────────────────────────────

function lockInputDoc(parsed) {
  const idoc = window.createJobState && window.createJobState.inputDoc;
  if (!idoc) return;
  idoc.locked = true;
  idoc.lockedAt = new Date().toISOString();
  idoc.reviewGate.status = 'locked';
  idoc.parsed = parsed;

  // Resolve speakerCharacterIds against cast
  const lockedCast = (window.createJobState.characters || []).filter(c => c.locked);
  for (const dl of parsed.dialogueLines) {
    if (!dl.speakerName) continue;
    const match = lockedCast.find(c => c.name === dl.speakerName);
    dl.speakerCharacterId = match ? match.id : null;
    dl.isExtraSpeaker = !match && dl.speakerName.toLowerCase() !== 'narrator';
    if (!dl.sourceMode) dl.sourceMode = 'text-input';
    if (dl.muted === undefined) dl.muted = false;
    if (dl.regenCount === undefined) dl.regenCount = 0;
    if (dl.regenLockToken === undefined) dl.regenLockToken = null;
  }
}

// ── Expose public API ─────────────────────────────────────────────────────

window.inputParser = {
  parseTextInput,
  runReviewGate,
  lockInputDoc,
  detectInputFormat,
  aggregateConfidence,
  sanitizeFountainOutput,
  normalizeRawText,
};

})();
