    const _textImageCache = new Map();

    function _getTextCacheKey(t, displayText) {
      return `${t.id}_${displayText}_${t.font}_${t.fontSize}_${t.bold}_${t.color}_${t.strokeColor}_${t.strokeWidth}_${t.bgColor}_${t.bgAlpha}`;
    }

    function _renderTextToImage(t, displayText) {
      const cacheKey = _getTextCacheKey(t, displayText);
      if (_textImageCache.has(cacheKey)) return _textImageCache.get(cacheKey);

      const lines = displayText.split('\n');
      const lineHeight = t.fontSize * 1.3;
      const fontWeight = t.bold ? '700' : '400';

      // Create a hidden div to measure and render text using the browser's text shaping
      const container = document.createElement('div');
      // Max width: 85% of a typical render canvas to force wrapping for long text
      const maxTextWidth = t._maxWidth || 900;
      container.style.cssText = `
        position:fixed; left:-9999px; top:-9999px; visibility:hidden;
        font-family:${t.font}; font-size:${t.fontSize}px; font-weight:${fontWeight};
        line-height:${lineHeight}px; white-space:pre-wrap; text-align:center;
        color:transparent; padding:${t.fontSize * 0.3}px;
        max-width:${maxTextWidth}px; word-wrap:break-word;
      `;
      container.textContent = displayText;
      document.body.appendChild(container);
      const measuredW = container.scrollWidth + t.strokeWidth * 2 + 4;
      const measuredH = container.scrollHeight + t.strokeWidth * 2 + 4;
      document.body.removeChild(container);

      // Use SVG foreignObject to render DOM text onto a canvas
      const svgNS = 'http://www.w3.org/2000/svg';
      const w = Math.ceil(measuredW);
      const h = Math.ceil(measuredH);

      // Build the inner HTML for each line
      let linesHtml = '';
      for (const line of lines) {
        // Escape HTML entities
        const escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') || '&nbsp;';
        linesHtml += `<div style="line-height:${lineHeight}px;">${escaped}</div>`;
      }

      const strokeCSS = t.strokeWidth > 0
        ? `-webkit-text-stroke:${t.strokeWidth}px ${t.strokeColor}; paint-order:stroke fill;`
        : '';

      let bgCSS = '';
      if (t.bgAlpha > 0) {
        const hex = t.bgColor;
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        bgCSS = `background:rgba(${r},${g},${b},${t.bgAlpha}); border-radius:8px; padding:${t.fontSize*0.2}px ${t.fontSize*0.3}px;`;
      }

      const svgHtml = `
        <svg xmlns="${svgNS}" width="${w}" height="${h}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="
              font-family:${t.font}; font-size:${t.fontSize}px; font-weight:${fontWeight};
              color:${t.color}; text-align:center; ${strokeCSS} ${bgCSS}
              width:${w}px; height:${h}px; display:flex; flex-direction:column;
              align-items:center; justify-content:center; overflow:hidden;
            ">${linesHtml}</div>
          </foreignObject>
        </svg>`;

      const svgBlob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.src = url;

      const result = { img, w, h, ready: false };

      img.onload = () => {
        result.ready = true;
        URL.revokeObjectURL(url);
      };

      // Also create a sync canvas fallback for immediate use
      const offCanvas = document.createElement('canvas');
      offCanvas.width = w;
      offCanvas.height = h;
      const offCtx = offCanvas.getContext('2d');
      // Render via DOM-serialized foreignObject onto offscreen canvas
      const syncImg = new Image();
      syncImg.onload = () => {
        offCtx.drawImage(syncImg, 0, 0);
        result.canvas = offCanvas;
        result.ready = true;
        URL.revokeObjectURL(syncImg.src);
      };
      // Use data URL for sync path
      const reader = new FileReader();
      reader.onload = () => {
        syncImg.src = reader.result;
      };
      reader.readAsDataURL(svgBlob);

      _textImageCache.set(cacheKey, result);
      // Limit cache size
      if (_textImageCache.size > 200) {
        const firstKey = _textImageCache.keys().next().value;
        _textImageCache.delete(firstKey);
      }
      return result;
    }

    function renderTextOverlays(ctx, cw, ch, elapsed, sortedTexts) {
      for (const t of sortedTexts) {
        if (elapsed < t.startTime || elapsed >= t.startTime + t.duration) continue;
        // Set max text width based on canvas if not explicitly set
        if (!t._maxWidth) t._maxWidth = Math.round(cw * 0.85);

        const localT = elapsed - t.startTime;
        const td = Math.min(t.animDur, t.duration / 2);
        const entryProgress = td > 0 ? Math.min(localT / td, 1) : 1;
        const timeToEnd = t.duration - localT;
        const exitProgress = td > 0 ? Math.min(timeToEnd / td, 1) : 1;
        const eEntry = easeInOutCubic(entryProgress);
        const eExit = easeInOutCubic(exitProgress);
        const eAlpha = Math.min(eEntry, eExit);

        // Determine display text (typewriter effect)
        const anim = t.animation || 'none';
        let displayText = t.allCaps ? t.text.toUpperCase() : t.text;
        let typewriterFrac = 1;
        if (anim === 'typewriter') {
          typewriterFrac = entryProgress;
          if (typewriterFrac < 1) {
            const totalChars = t.text.replace(/\n/g, '').length;
            const charsToShow = Math.floor(totalChars * typewriterFrac);
            const lines = t.text.split('\n');
            let built = '', charsLeft = charsToShow;
            for (let i = 0; i < lines.length; i++) {
              if (charsLeft <= 0) break;
              const take = Math.min(charsLeft, lines[i].length);
              built += (i > 0 ? '\n' : '') + lines[i].substring(0, take);
              charsLeft -= take;
            }
            displayText = built;
          }
        }

        // Get DOM-rendered text image
        const rendered = _renderTextToImage(t, displayText);

        ctx.save();

        // Animation values
        let drawAlpha = 1;
        let offsetY = 0, scale = 1, blurPx = 0;

        if (anim === 'fade') {
          drawAlpha = eAlpha;
        } else if (anim === 'slide-up') {
          drawAlpha = eAlpha;
          if (entryProgress < 1) offsetY = (1 - eEntry) * t.fontSize * 2;
          else if (exitProgress < 1) offsetY = -(1 - eExit) * t.fontSize * 2;
        } else if (anim === 'slide-down') {
          drawAlpha = eAlpha;
          if (entryProgress < 1) offsetY = -(1 - eEntry) * t.fontSize * 2;
          else if (exitProgress < 1) offsetY = (1 - eExit) * t.fontSize * 2;
        } else if (anim === 'scale') {
          drawAlpha = eAlpha;
          if (entryProgress < 1) scale = easeOutBack(entryProgress);
          else if (exitProgress < 1) scale = easeOutBack(exitProgress);
        } else if (anim === 'blur-in') {
          drawAlpha = eAlpha;
          if (entryProgress < 1) blurPx = (1 - eEntry) * 15;
          else if (exitProgress < 1) blurPx = (1 - eExit) * 15;
        } else if (anim === 'typewriter') {
          drawAlpha = exitProgress < 1 ? eExit : 1;
        }

        ctx.globalAlpha = drawAlpha;
        if (blurPx > 0) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;

        // Calculate position with safe padding
        const tw = rendered.w;
        const th = rendered.h;
        let x = cw / 2, y = ch / 2;
        const padSide = t.fontSize * 0.8;
        const padTop = t.fontSize * 0.8;
        const padBot = Math.max(t.fontSize * 1.2, ch * 0.06); // extra bottom padding for safe area
        switch (t.position) {
          case 'top-left':     x = padSide + tw / 2; y = padTop + th / 2; break;
          case 'top-center':   y = padTop + th / 2; break;
          case 'top-right':    x = cw - padSide - tw / 2; y = padTop + th / 2; break;
          case 'mid-left':     x = padSide + tw / 2; break;
          case 'center':       break;
          case 'mid-right':    x = cw - padSide - tw / 2; break;
          case 'bot-left':     x = padSide + tw / 2; y = ch - padBot - th / 2; break;
          case 'bot-center':   y = ch - padBot - th / 2; break;
          case 'bot-right':    x = cw - padSide - tw / 2; y = ch - padBot - th / 2; break;
        }
        // Clamp to keep text fully inside viewport
        x = Math.max(tw / 2 + 4, Math.min(cw - tw / 2 - 4, x));
        y = Math.max(th / 2 + 4, Math.min(ch - th / 2 - 4, y));

        ctx.translate(x, y + offsetY);
        if (scale !== 1) ctx.scale(scale, scale);

        // Draw the DOM-rendered text image
        const drawSrc = rendered.canvas || rendered.img;
        if (rendered.ready && drawSrc) {
          ctx.drawImage(drawSrc, -tw / 2, -th / 2, tw, th);
        } else {
          // Fallback: use canvas fillText while image loads
          const fontWeight = t.bold ? '700' : '400';
          ctx.font = `${fontWeight} ${t.fontSize}px ${t.font}`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillStyle = t.color;
          const lines = displayText.split('\n');
          const lineHeight = t.fontSize * 1.3;
          const startY = -(lines.length - 1) * lineHeight / 2;
          for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], 0, startY + i * lineHeight);
          }
        }

        ctx.filter = 'none';
        ctx.restore();
      }
    }

    // ── Reel Subtitle Renderer (word-level) ──
    function renderReelSubtitle(ctx, cw, ch, elapsed, words, style) {
      if (!words || words.length === 0 || style === 'none') return;
      if (!renderReelSubtitle._logged) {
        const badWords = words.filter(w => !w || typeof w.word !== 'string' || !w.word);
        console.log('[ReelSub] called with words:', words.length, 'style:', style, 'badWords:', badWords.length, 'sample:', JSON.stringify(words.slice(0, 5)), 'badSample:', JSON.stringify(badWords.slice(0, 3)));
        renderReelSubtitle._logged = true;
      }
      ctx.save();

      const color = typeof reelSubColor !== 'undefined' ? reelSubColor : '#ffffff';
      const outline = typeof reelSubOutline !== 'undefined' ? reelSubOutline : '#000000';
      const backdrop = typeof reelSubBackdrop !== 'undefined' ? reelSubBackdrop : 'dark';
      const accentColor = typeof reelSubAccent !== 'undefined' ? reelSubAccent : '#7c3aed';
      const fontFamily = typeof reelSubFont !== 'undefined' ? reelSubFont : 'Poppins';
      const allCaps = typeof reelSubAllCaps !== 'undefined' && reelSubAllCaps;
      const sizeFactor = typeof reelSubSize !== 'undefined' ? reelSubSize / 100 : 0.04;
      const fontSize = Math.round(cw * sizeFactor);
      const font = `700 ${fontSize}px ${fontFamily}, sans-serif`;
      const pos = typeof reelSubPosition !== 'undefined' ? reelSubPosition : 'bottom';
      const posNum = typeof pos === 'number' ? pos : (pos === 'top' ? 12 : pos === 'center' ? 52 : 85);
      const y = ch * (posNum / 100);
      const maxWidth = cw * 0.9;
      const wordText = (w) => { const t = (typeof w === 'string' ? w : w.word) || ''; return allCaps ? t.toUpperCase() : t; };

      function drawBackdrop(x, bY, w, h) {
        if (backdrop === 'shadow') return; // shadow applied in drawTextWithOutline
        const bw = Math.min(w, maxWidth + 32);
        const bx = Math.max(0, cw/2 - bw/2);
        if (backdrop === 'dark') { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx, bY, bw, h); }
        else if (backdrop === 'blur') { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(bx, bY, bw, h); }
      }
      // Truncate text to fit within maxWidth
      function fitText(text, font) {
        ctx.font = font;
        if (ctx.measureText(text).width <= maxWidth) return text;
        // Remove words from end until it fits
        const words = text.split(' ');
        while (words.length > 1 && ctx.measureText(words.join(' ')).width > maxWidth) words.pop();
        return words.join(' ');
      }
      function drawTextWithOutline(text, tx, ty) {
        const fitted = fitText(text, ctx.font);
        if (backdrop === 'shadow') {
          ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;
        }
        if (outline && outline !== 'transparent') {
          ctx.strokeStyle = outline; ctx.lineWidth = 3; ctx.lineJoin = 'round';
          ctx.strokeText(fitted, tx, ty);
        }
        ctx.fillText(fitted, tx, ty);
        if (backdrop === 'shadow') {
          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        }
      }

      if (style === 'word-by-word') {
        // Show current word + next 1-2 words, big and bold
        let idx = words.findIndex(w => elapsed >= w.start && elapsed < w.end);
        // Before first word or between words: show nearest upcoming word
        if (idx < 0) idx = words.findIndex(w => w.start > elapsed);
        if (idx < 0) idx = words.length - 1; // after last word: show last
        if (idx >= 0) {
          const chunk = words.slice(idx, idx + 2);
          const text = chunk.map(w => wordText(w)).join(' ');
          ctx.font = font; ctx.textAlign = 'center';
          const m = ctx.measureText(text);
          drawBackdrop(cw/2 - m.width/2 - 14, y - fontSize - 4, m.width + 28, fontSize + 16);
          ctx.fillStyle = color;
          drawTextWithOutline(text, cw / 2, y);
        }
      } else if (style === 'highlight') {
        const segWords = getSegmentWords(words, elapsed);
        if (segWords.length > 0) {
          const sentence = segWords.map(w => wordText(w)).join(' ');
          const currentWord = segWords.find(w => elapsed >= w.start && elapsed < w.end);
          ctx.font = `600 ${Math.round(fontSize * 0.7)}px ${fontFamily}, sans-serif`;
          ctx.textAlign = 'center';
          const metrics = ctx.measureText(sentence);
          const bgW = Math.min(metrics.width + 24, maxWidth);
          drawBackdrop(cw/2 - bgW/2, y - fontSize * 0.7 - 4, bgW, fontSize * 0.7 + 16);
          let xPos = cw/2 - metrics.width/2;
          for (const w of segWords) {
            ctx.fillStyle = (currentWord && w.word === currentWord.word && w.start === currentWord.start) ? accentColor : color;
            ctx.textAlign = 'left';
            drawTextWithOutline(wordText(w) + ' ', xPos, y);
            xPos += ctx.measureText(wordText(w) + ' ').width;
          }
        }
      } else if (style === 'karaoke') {
        const visible = words.filter(w => elapsed >= w.start);
        // Before first word: show first word as preview
        const recent = visible.length > 0 ? visible.slice(-4) : words.slice(0, 1);
        if (recent.length > 0) {
          const text = recent.map(w => wordText(w)).join(' ');
          ctx.font = `600 ${Math.round(fontSize * 0.8)}px ${fontFamily}, sans-serif`;
          ctx.textAlign = 'center';
          const metrics = ctx.measureText(text);
          drawBackdrop(cw/2 - metrics.width/2 - 12, y - fontSize * 0.8 - 4, metrics.width + 24, fontSize * 0.8 + 16);
          ctx.fillStyle = color;
          drawTextWithOutline(text, cw/2, y);
        }
      } else if (style === 'bold-center') {
        // 3 words at a time, current word highlighted
        let idx = words.findIndex(w => elapsed >= w.start && elapsed < w.end);
        if (idx < 0) idx = words.findIndex(w => w.start > elapsed); // upcoming
        if (idx < 0) idx = words.length - 1; // after last
        if (idx >= 0) {
          const groupStart = Math.floor(idx / 3) * 3;
          const group = words.slice(groupStart, groupStart + 3);
          if (group.length > 0) {
            ctx.font = font; ctx.textAlign = 'center';
            const groupText = group.map(w => wordText(w)).join(' ');
            const metrics = ctx.measureText(groupText);
            drawBackdrop(cw/2 - metrics.width/2 - 16, y - fontSize - 6, metrics.width + 32, fontSize + 20);
            // Draw each word, highlight current
            let xPos = cw/2 - metrics.width/2;
            ctx.textAlign = 'left';
            for (const w of group) {
              const isCurrent = elapsed >= w.start && elapsed < w.end;
              ctx.fillStyle = isCurrent ? accentColor : color;
              const wText = wordText(w) + (w !== group[group.length - 1] ? ' ' : '');
              drawTextWithOutline(wText, xPos, y);
              xPos += ctx.measureText(wText).width;
            }
          }
        }
      }
      ctx.restore();
    }

    // Helper: get words belonging to the same sentence/segment at current time
    function getSegmentWords(words, elapsed) {
      // Find current word, grab 2 before + 2 after (5 words max)
      const idx = words.findIndex(w => elapsed >= w.start && elapsed < w.end);
      if (idx < 0) {
        const closest = words.reduce((best, w, i) => {
          const dist = Math.abs(w.start - elapsed);
          return dist < best.dist ? { dist, idx: i } : best;
        }, { dist: Infinity, idx: -1 });
        if (closest.idx < 0) return [];
        const start = Math.max(0, closest.idx - 2);
        const end = Math.min(words.length, closest.idx + 3);
        return words.slice(start, end);
      }
      const start = Math.max(0, idx - 2);
      const end = Math.min(words.length, idx + 3);
      return words.slice(start, end);
    }

    // Helper: get a group of N words around current time
    function getCurrentWordGroup(words, elapsed, groupSize) {
      const idx = words.findIndex(w => elapsed >= w.start && elapsed < w.end);
      if (idx < 0) return null;
      const groupStart = Math.floor(idx / groupSize) * groupSize;
      const group = words.slice(groupStart, groupStart + groupSize);
      return group.map(w => w.word).join(' ');
    }
