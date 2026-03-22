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
        let displayText = t.text;
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
