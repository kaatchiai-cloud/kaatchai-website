    // ══════════════════════════════════════════
    //  TRANSITION RENDERER (used by preview & export)
    // ══════════════════════════════════════════
    function drawCoverFit(ctx, img, cw, ch) {
      const isVideo = img instanceof HTMLVideoElement;
      const iw = isVideo ? img.videoWidth : img.naturalWidth;
      const ih = isVideo ? img.videoHeight : img.naturalHeight;
      if (!iw || !ih) return; // not loaded yet
      const ir = iw / ih, cr = cw / ch;
      let dw, dh, dx, dy;
      if (ir > cr) { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0; }
      else { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    // Easing functions for cinematic motion
    function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }
    function easeOutQuart(t) { return 1 - Math.pow(1-t, 4); }
    function easeInQuart(t) { return t*t*t*t; }
    function easeOutBack(t) { const c = 1.70158; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); }

    // ── PiP Renderer ──
    function drawCoverFitRect(ctx, img, x, y, w, h) {
      const isVideo = img instanceof HTMLVideoElement;
      const iw = isVideo ? img.videoWidth : img.naturalWidth;
      const ih = isVideo ? img.videoHeight : img.naturalHeight;
      if (!iw || !ih) return;
      const ir = iw / ih, cr = w / h;
      let dw, dh, dx, dy;
      if (ir > cr) { dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y; }
      else { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    function drawPipShape(ctx, x, y, w, h, shape) {
      if (shape === 'circle') {
        const r = Math.min(w, h) / 2;
        ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      } else if (shape === 'rounded') {
        const r = Math.min(w, h) * 0.15;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
        ctx.lineTo(x + w, y + h - r);
        ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
        ctx.lineTo(x + r, y + h);
        ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
        ctx.lineTo(x, y + r);
        ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
      } else {
        ctx.rect(x, y, w, h);
      }
    }

    function renderPiP(ctx, cw, ch, elapsed) {
      if (!pipItems || pipItems.length === 0) return;

      // Find first active PiP at this time (first wins on overlap)
      const pip = pipItems.find(p => {
        const outTime = p.outPoint || (currentBuffer ? currentBuffer.duration : Infinity);
        return elapsed >= p.inPoint && elapsed <= outTime && p.videoEl;
      });
      if (!pip) return;

      // Seek video to correct frame
      const targetTime = elapsed - pip.inPoint;
      const clampedTime = Math.min(targetTime, pip.videoDuration || pip.videoEl.duration);
      if (Math.abs(pip.videoEl.currentTime - clampedTime) > 0.05) {
        pip.videoEl.currentTime = clampedTime;
      }

      // Use per-item settings with shared defaults as fallback
      const pSize = pip.size || pipSize;
      const pShape = pip.shape || pipShape;
      const pBorder = pip.border ?? pipBorder;
      const pBorderColor = pip.borderColor || pipBorderColor;
      const pShadow = pip.shadow ?? pipShadow;
      const pPosition = pip.position || pipPosition;

      // Dimensions
      const pipW = Math.round(cw * pSize / 100);
      const pipH = pShape === 'circle' ? pipW : Math.round(pipW * (pip.videoEl.videoHeight / (pip.videoEl.videoWidth || 1) || 0.75));
      const pad = Math.max(pBorder + 4, cw * 0.02);

      // Position
      let x, y;
      if (pip.customX !== null && pip.customX !== undefined && pip.customY !== null && pip.customY !== undefined) {
        x = pip.customX; y = pip.customY;
      } else {
        switch (pPosition) {
          case 'top-left':     x = pad; y = pad; break;
          case 'top-center':   x = (cw - pipW) / 2; y = pad; break;
          case 'top-right':    x = cw - pipW - pad; y = pad; break;
          case 'mid-left':     x = pad; y = (ch - pipH) / 2; break;
          case 'center':       x = (cw - pipW) / 2; y = (ch - pipH) / 2; break;
          case 'mid-right':    x = cw - pipW - pad; y = (ch - pipH) / 2; break;
          case 'bot-left':     x = pad; y = ch - pipH - pad; break;
          case 'bot-center':   x = (cw - pipW) / 2; y = ch - pipH - pad; break;
          default:             x = cw - pipW - pad; y = ch - pipH - pad; break;
        }
      }

      ctx.save();

      if (pShadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
      }

      if (pBorder > 0) {
        ctx.beginPath();
        drawPipShape(ctx, x - pBorder, y - pBorder, pipW + pBorder * 2, pipH + pBorder * 2, pShape);
        ctx.fillStyle = pBorderColor;
        ctx.fill();
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      ctx.beginPath();
      drawPipShape(ctx, x, y, pipW, pipH, pShape);
      ctx.clip();
      drawCoverFitRect(ctx, pip.videoEl, x, y, pipW, pipH);

      ctx.restore();
    }

    // Apply continuous motion effect throughout a photo's duration
    function applyMotionTransform(ctx, motion, lifeProgress, p, cw, ch) {
      if (motion === 'ken-burns') {
        const seed = p.id % 4;
        const scale = 1.0 + 0.15 * lifeProgress;
        const panX = (seed < 2 ? 1 : -1) * lifeProgress * cw * 0.05;
        const panY = (seed % 2 === 0 ? 1 : -1) * lifeProgress * ch * 0.05;
        ctx.translate(cw/2 + panX, ch/2 + panY);
        ctx.scale(scale, scale);
        ctx.translate(-cw/2, -ch/2);
      } else if (motion === 'slow-zoom-in') {
        const scale = 1.0 + 0.1 * lifeProgress;
        ctx.translate(cw/2, ch/2);
        ctx.scale(scale, scale);
        ctx.translate(-cw/2, -ch/2);
      } else if (motion === 'slow-zoom-out') {
        const scale = 1.1 - 0.1 * lifeProgress;
        ctx.translate(cw/2, ch/2);
        ctx.scale(scale, scale);
        ctx.translate(-cw/2, -ch/2);
      } else if (motion === 'pan-left') {
        const ox = -lifeProgress * cw * 0.08;
        ctx.translate(cw/2 + ox, ch/2);
        ctx.scale(1.05, 1.05);
        ctx.translate(-cw/2, -ch/2);
      } else if (motion === 'pan-right') {
        const ox = lifeProgress * cw * 0.08;
        ctx.translate(cw/2 + ox, ch/2);
        ctx.scale(1.05, 1.05);
        ctx.translate(-cw/2, -ch/2);
      } else if (motion === 'pan-up') {
        const oy = -lifeProgress * ch * 0.08;
        ctx.translate(cw/2, ch/2 + oy);
        ctx.scale(1.05, 1.05);
        ctx.translate(-cw/2, -ch/2);
      } else if (motion === 'pan-down') {
        const oy = lifeProgress * ch * 0.08;
        ctx.translate(cw/2, ch/2 + oy);
        ctx.scale(1.05, 1.05);
        ctx.translate(-cw/2, -ch/2);
      }
    }

    // Helper: check if any photo/image exists at given time
    function hasImageAtTime(elapsed, sortedItems) {
      for (const p of sortedItems) {
        if (elapsed >= p.startTime && elapsed < p.startTime + p.duration) return p;
      }
      return null;
    }

    // Find active video clip at current time from video timeline
    function getActiveVideoClip(elapsed) {
      for (const v of videoTimelineItems) {
        if (elapsed >= v.startTime && elapsed < v.startTime + v.duration && v.videoEl) return v;
      }
      return null;
    }

    // Seek a video clip to correct time based on timeline position
    function seekVideoClip(clip, elapsed) {
      const localTime = elapsed - clip.startTime;
      const videoTime = (clip.inPoint || 0) + localTime;
      const clampedTime = Math.min(videoTime, clip.outPoint || clip.videoDuration || clip.videoEl.duration);
      if (Math.abs(clip.videoEl.currentTime - clampedTime) > 0.1) {
        clip.videoEl.currentTime = clampedTime;
      }
    }

    // Draw video clip fullscreen
    function drawVideoClipFull(ctx, cw, ch, elapsed, clip) {
      if (!clip || !clip.videoEl) return;
      seekVideoClip(clip, elapsed);
      drawCoverFit(ctx, clip.videoEl, cw, ch);
    }

    // Draw video clip as PiP (uses shared PiP settings)
    // Get PiP target position based on pipTransPos setting
    function getPipTargetPos(cw, ch, pW, pH, pad) {
      const pos = pipTransPos || 'bot-right';
      switch (pos) {
        case 'top-left':  return { x: pad, y: pad };
        case 'top-right': return { x: cw - pW - pad, y: pad };
        case 'bot-left':  return { x: pad, y: ch - pH - pad };
        default:          return { x: cw - pW - pad, y: ch - pH - pad };
      }
    }

    function drawVideoClipPiP(ctx, cw, ch, elapsed, clip, scale, transType) {
      if (!clip || !clip.videoEl) return;
      seekVideoClip(clip, elapsed);
      const s = (scale !== undefined ? scale : 1);
      const pipPct = pipSize / 100;
      const pW = Math.round(cw * pipPct);
      const pH = pipShape === 'circle' ? pW : Math.round(pW * (clip.videoEl.videoHeight / (clip.videoEl.videoWidth || 1) || 0.75));
      const pad = Math.max(pipBorder + 4, cw * 0.02);
      const target = getPipTargetPos(cw, ch, pW, pH, pad);
      const type = transType || pipTransType || 'shrink';

      let x, y, drawW, drawH, alpha = 1;

      if (s >= 1) {
        // Fully PiP
        x = target.x; y = target.y; drawW = pW; drawH = pH;
      } else if (type === 'shrink') {
        x = lerp(0, target.x, s);
        y = lerp(0, target.y, s);
        drawW = lerp(cw, pW, s);
        drawH = lerp(ch, pH, s);
      } else if (type === 'slide') {
        // Slide from edge to corner
        drawW = pW; drawH = pH;
        const slideFrom = pipTransPos.includes('right') ? cw + pW : -pW;
        x = lerp(slideFrom, target.x, easeInOutCubic(s));
        y = target.y;
      } else if (type === 'fade') {
        // Fade: fullscreen fades out, PiP fades in
        if (s < 0.5) {
          // Fullscreen fading out
          x = 0; y = 0; drawW = cw; drawH = ch;
          alpha = 1 - s * 2;
        } else {
          // PiP fading in
          x = target.x; y = target.y; drawW = pW; drawH = pH;
          alpha = (s - 0.5) * 2;
        }
      } else if (type === 'zoom') {
        // Zoom: scale from center of PiP target
        const cx = target.x + pW / 2;
        const cy = target.y + pH / 2;
        const zoomScale = lerp(cw / pW, 1, easeInOutCubic(s));
        drawW = pW * zoomScale; drawH = pH * zoomScale;
        x = cx - drawW / 2; y = cy - drawH / 2;
      } else {
        x = target.x; y = target.y; drawW = pW; drawH = pH;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      if (pipShadow && s >= 0.5) {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12;
      }
      if (pipBorder > 0 && s >= 0.5) {
        ctx.beginPath();
        drawPipShape(ctx, x - pipBorder, y - pipBorder, drawW + pipBorder * 2, drawH + pipBorder * 2, s >= 0.8 ? pipShape : 'rounded');
        ctx.fillStyle = pipBorderColor;
        ctx.fill();
      }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.beginPath();
      drawPipShape(ctx, x, y, drawW, drawH, s >= 0.8 ? pipShape : 'rounded');
      ctx.clip();
      drawCoverFitRect(ctx, clip.videoEl, x, y, drawW, drawH);
      ctx.restore();
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    // Render background video based on mode — called by preview/export
    // Returns 'pip-after' if video PiP should be drawn after image
    function renderBgVideoBefore(ctx, cw, ch, elapsed, sortedItems) {
      if (bgVideoMode === 'images-only') return null;
      const clip = getActiveVideoClip(elapsed);
      if (!clip) return null;

      const activeImage = hasImageAtTime(elapsed, sortedItems);

      if (bgVideoMode === 'video-only') {
        drawVideoClipFull(ctx, cw, ch, elapsed, clip);
        return 'skip-images';
      }

      if (!activeImage) {
        drawVideoClipFull(ctx, cw, ch, elapsed, clip);
        return 'skip-images';
      }

      if (bgVideoMode === 'video-images') {
        return null;
      }

      if (bgVideoMode === 'video-pip') {
        return 'pip-after';
      }

      if (bgVideoMode === 'video-pip-transition') {
        return 'pip-transition-after';
      }

      return null;
    }

    function renderBgVideoAfter(ctx, cw, ch, elapsed, sortedItems, mode) {
      if (!mode) return;
      const clip = getActiveVideoClip(elapsed);
      if (!clip) return;
      if (mode === 'pip-after') {
        drawVideoClipPiP(ctx, cw, ch, elapsed, clip, 1, pipTransType);
      } else if (mode === 'pip-transition-after') {
        const activeImage = hasImageAtTime(elapsed, sortedItems);
        if (!activeImage) return;
        const dur = pipTransDur || 0.5;
        const timeSinceImageStart = elapsed - activeImage.startTime;
        const timeToImageEnd = (activeImage.startTime + activeImage.duration) - elapsed;
        let scale;
        if (timeSinceImageStart < dur) {
          scale = easeInOutCubic(Math.min(1, timeSinceImageStart / dur));
        } else if (timeToImageEnd < dur) {
          scale = easeInOutCubic(Math.min(1, timeToImageEnd / dur));
        } else {
          scale = 1;
        }
        drawVideoClipPiP(ctx, cw, ch, elapsed, clip, scale, pipTransType);
      }
    }

    function renderTimelineFrame(ctx, cw, ch, elapsed, sortedItems) {
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cw, ch);

      // Gather all visible photos at this time (could overlap)
      const visible = [];
      for (const p of sortedItems) {
        if (elapsed >= p.startTime && elapsed < p.startTime + p.duration) {
          visible.push(p);
        }
      }
      if (visible.length === 0) return;

      // Draw each visible photo/video with its transition
      for (const p of visible) {
        // For video items, seek to the correct frame
        if (p.type === 'video' && p.videoEl) {
          const targetTime = (p.inPoint || 0) + (elapsed - p.startTime);
          const clampedTime = Math.min(targetTime, p.outPoint || p.videoDuration || p.videoEl.duration);
          if (Math.abs(p.videoEl.currentTime - clampedTime) > 0.05) {
            p.videoEl.currentTime = clampedTime;
          }
        }
        // Get the drawable source: video element for videos, image for photos
        const drawSrc = (p.type === 'video' && p.videoEl) ? p.videoEl : p.imgEl;
        const localT = elapsed - p.startTime; // time within this item
        const td = Math.min(p.transDur, p.duration / 2);
        // Legacy migration: treat ken-burns transition as ken-burns motion + fade
        let transition = p.transition || 'none';
        const motion = (transition === 'ken-burns') ? 'ken-burns' : (p.motion || 'none');
        if (transition === 'ken-burns') transition = 'fade';

        // Calculate entry progress (0→1 over transDur from start)
        let entryProgress = td > 0 ? Math.min(localT / td, 1) : 1;
        // Calculate exit progress (1→0 over transDur before end)
        const timeToEnd = p.duration - localT;
        let exitProgress = td > 0 ? Math.min(timeToEnd / td, 1) : 1;

        // Combined alpha / progress
        let alpha = Math.min(entryProgress, exitProgress);

        // Eased versions for cinematic smoothness
        const eEntry = easeInOutCubic(entryProgress);
        const eExit = easeInOutCubic(exitProgress);
        const eAlpha = Math.min(eEntry, eExit);

        // Normalized time through the whole photo (0→1)
        const lifeProgress = localT / p.duration;

        ctx.save();

        // Apply continuous motion effect (independent of transition)
        if (motion !== 'none') {
          applyMotionTransform(ctx, motion, lifeProgress, p, cw, ch);
        }

        if (transition === 'none') {
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'fade') {
          ctx.globalAlpha = eAlpha;
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'crossfade') {
          ctx.globalAlpha = eAlpha;
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'slide-left') {
          let ox = 0;
          if (entryProgress < 1) ox = (1 - eEntry) * cw;
          else if (exitProgress < 1) ox = -(1 - eExit) * cw;
          ctx.translate(ox, 0);
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'slide-right') {
          let ox = 0;
          if (entryProgress < 1) ox = -(1 - eEntry) * cw;
          else if (exitProgress < 1) ox = (1 - eExit) * cw;
          ctx.translate(ox, 0);
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'slide-up') {
          let oy = 0;
          if (entryProgress < 1) oy = (1 - eEntry) * ch;
          else if (exitProgress < 1) oy = -(1 - eExit) * ch;
          ctx.translate(0, oy);
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'slide-down') {
          let oy = 0;
          if (entryProgress < 1) oy = -(1 - eEntry) * ch;
          else if (exitProgress < 1) oy = (1 - eExit) * ch;
          ctx.translate(0, oy);
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'whip-pan') {
          // Fast slide with motion blur effect
          let ox = 0;
          if (entryProgress < 1) { ox = (1 - easeOutQuart(entryProgress)) * cw * 1.2; }
          else if (exitProgress < 1) { ox = -(1 - easeOutQuart(exitProgress)) * cw * 1.2; }
          const blurAmt = Math.round(Math.abs(ox) / cw * 30);
          if (blurAmt > 0) ctx.filter = `blur(${blurAmt}px)`;
          ctx.translate(ox, 0);
          drawCoverFit(ctx, drawSrc, cw, ch);
          ctx.filter = 'none';

        } else if (transition === 'zoom-in') {
          const scale = 0.5 + 0.5 * eAlpha;
          ctx.globalAlpha = eAlpha;
          ctx.translate(cw/2, ch/2);
          ctx.scale(scale, scale);
          ctx.translate(-cw/2, -ch/2);
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'zoom-out') {
          const scale = 1.5 - 0.5 * eAlpha;
          ctx.globalAlpha = eAlpha;
          ctx.translate(cw/2, ch/2);
          ctx.scale(scale, scale);
          ctx.translate(-cw/2, -ch/2);
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'rotate') {
          // Rotate in from off-screen with scale
          let angle = 0, scale = 1;
          if (entryProgress < 1) {
            angle = (1 - easeOutBack(entryProgress)) * -15 * Math.PI / 180;
            scale = 0.7 + 0.3 * easeOutBack(entryProgress);
          } else if (exitProgress < 1) {
            angle = (1 - easeOutBack(exitProgress)) * 15 * Math.PI / 180;
            scale = 0.7 + 0.3 * easeOutBack(exitProgress);
          }
          ctx.globalAlpha = eAlpha;
          ctx.translate(cw/2, ch/2);
          ctx.rotate(angle);
          ctx.scale(scale, scale);
          ctx.translate(-cw/2, -ch/2);
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'parallax') {
          // Layered depth movement — image slides slower than a virtual "foreground"
          let ox = 0;
          if (entryProgress < 1) ox = (1 - eEntry) * cw * 0.3;
          else if (exitProgress < 1) ox = -(1 - eExit) * cw * 0.3;
          // Slight zoom for depth
          const scale = 1.1;
          ctx.globalAlpha = eAlpha;
          ctx.translate(cw/2 + ox, ch/2);
          ctx.scale(scale, scale);
          ctx.translate(-cw/2, -ch/2);
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'iris') {
          // Circular reveal from center
          let radius;
          const maxR = Math.sqrt(cw*cw + ch*ch) / 2;
          if (entryProgress < 1) radius = eEntry * maxR;
          else if (exitProgress < 1) radius = eExit * maxR;
          else radius = maxR;
          ctx.beginPath();
          ctx.arc(cw/2, ch/2, radius, 0, Math.PI * 2);
          ctx.clip();
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'wipe-right') {
          let wipeX;
          if (entryProgress < 1) wipeX = eEntry * cw;
          else if (exitProgress < 1) wipeX = eExit * cw;
          else wipeX = cw;
          ctx.beginPath();
          ctx.rect(0, 0, wipeX, ch);
          ctx.clip();
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'wipe-diagonal') {
          // Diagonal wipe from top-left to bottom-right
          let t;
          if (entryProgress < 1) t = eEntry;
          else if (exitProgress < 1) t = eExit;
          else t = 1;
          const offset = (cw + ch) * t;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(offset, 0);
          ctx.lineTo(0, offset);
          ctx.closePath();
          ctx.clip();
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'split-h') {
          // Split from center horizontally (curtain open)
          let t;
          if (entryProgress < 1) t = eEntry;
          else if (exitProgress < 1) t = eExit;
          else t = 1;
          const halfW = (t * cw) / 2;
          ctx.beginPath();
          ctx.rect(cw/2 - halfW, 0, halfW * 2, ch);
          ctx.clip();
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'split-v') {
          // Split from center vertically
          let t;
          if (entryProgress < 1) t = eEntry;
          else if (exitProgress < 1) t = eExit;
          else t = 1;
          const halfH = (t * ch) / 2;
          ctx.beginPath();
          ctx.rect(0, ch/2 - halfH, cw, halfH * 2);
          ctx.clip();
          drawCoverFit(ctx, drawSrc, cw, ch);

        } else if (transition === 'dissolve') {
          // Pixelated dissolve using small rects
          let t;
          if (entryProgress < 1) t = eEntry;
          else if (exitProgress < 1) t = eExit;
          else t = 1;
          // Draw full image first, then mask
          drawCoverFit(ctx, drawSrc, cw, ch);
          if (t < 1) {
            const blockSize = 20;
            const cols = Math.ceil(cw / blockSize);
            const rows = Math.ceil(ch / blockSize);
            // Use composite to punch holes where blocks shouldn't show
            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                // Pseudo-random threshold per block
                const hash = Math.sin((r * 127.1 + c * 311.7) * 43758.5453) * 0.5 + 0.5;
                if (hash < t) {
                  ctx.rect(c * blockSize, r * blockSize, blockSize, blockSize);
                }
              }
            }
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }

        } else if (transition === 'blur') {
          const blurAlpha = eAlpha;
          const blurScale = 1 + (1 - eAlpha) * 0.1;
          ctx.globalAlpha = blurAlpha;
          ctx.filter = `blur(${Math.round((1 - eAlpha) * 20)}px)`;
          ctx.translate(cw/2, ch/2);
          ctx.scale(blurScale, blurScale);
          ctx.translate(-cw/2, -ch/2);
          drawCoverFit(ctx, drawSrc, cw, ch);
          ctx.filter = 'none';

        } else if (transition === 'flash') {
          // White flash on entry/exit (cinematic cut)
          drawCoverFit(ctx, drawSrc, cw, ch);
          let flashAlpha = 0;
          if (entryProgress < 1) flashAlpha = 1 - easeOutQuart(entryProgress);
          else if (exitProgress < 1) flashAlpha = 1 - easeOutQuart(exitProgress);
          if (flashAlpha > 0) {
            ctx.globalAlpha = flashAlpha;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cw, ch);
          }

        } else if (transition === 'light-leak') {
          // Warm color overlay that fades (film aesthetic)
          ctx.globalAlpha = eAlpha;
          drawCoverFit(ctx, drawSrc, cw, ch);
          let leakAlpha = 0;
          if (entryProgress < 1) leakAlpha = 0.6 * (1 - easeOutQuart(entryProgress));
          else if (exitProgress < 1) leakAlpha = 0.6 * (1 - easeOutQuart(exitProgress));
          if (leakAlpha > 0) {
            const grad = ctx.createRadialGradient(cw*0.7, ch*0.3, 0, cw*0.5, ch*0.5, cw*0.8);
            grad.addColorStop(0, `rgba(255, 180, 50, ${leakAlpha})`);
            grad.addColorStop(0.5, `rgba(255, 100, 30, ${leakAlpha * 0.5})`);
            grad.addColorStop(1, `rgba(255, 50, 20, 0)`);
            ctx.globalAlpha = 1;
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, cw, ch);
          }

        } else if (transition === 'glitch') {
          // RGB channel split + horizontal offset (modern/edgy)
          let t;
          if (entryProgress < 1) t = 1 - entryProgress;
          else if (exitProgress < 1) t = 1 - exitProgress;
          else t = 0;
          if (t > 0) {
            const shift = Math.round(t * 20);
            // Draw with slight shifts and color tinting
            ctx.globalAlpha = eAlpha;
            // Red channel
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(p.imgEl, 0, 0, cw, ch); // placeholder base
            drawCoverFit(ctx, drawSrc, cw, ch);
            // Overlay colored shifted copies
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(255,0,0,${t * 0.3})`;
            ctx.save(); ctx.translate(-shift, 0); drawCoverFit(ctx, drawSrc, cw, ch); ctx.restore();
            ctx.fillStyle = `rgba(0,255,255,${t * 0.3})`;
            ctx.save(); ctx.translate(shift, 0); drawCoverFit(ctx, drawSrc, cw, ch); ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
            // Random scanlines
            ctx.fillStyle = `rgba(0,0,0,${t * 0.15})`;
            for (let y = 0; y < ch; y += 4) {
              if (Math.sin(y * 0.5 + elapsed * 50) > 0.3) ctx.fillRect(0, y, cw, 2);
            }
          } else {
            drawCoverFit(ctx, drawSrc, cw, ch);
          }

        } else if (transition === 'film-grain') {
          // Cinematic film grain overlay with vignette
          ctx.globalAlpha = eAlpha;
          drawCoverFit(ctx, drawSrc, cw, ch);
          // Vignette on entry/exit
          let vigAlpha = 0;
          if (entryProgress < 1) vigAlpha = 0.7 * (1 - eEntry);
          else if (exitProgress < 1) vigAlpha = 0.7 * (1 - eExit);
          // Grain noise
          const grainAlpha = 0.08 + vigAlpha * 0.15;
          const imgData = ctx.getImageData(0, 0, cw, ch);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 16) { // every 4th pixel for perf
            const noise = (Math.random() - 0.5) * 50;
            d[i] += noise; d[i+1] += noise; d[i+2] += noise;
          }
          ctx.putImageData(imgData, 0, 0);
          // Vignette
          if (vigAlpha > 0) {
            const vgrad = ctx.createRadialGradient(cw/2, ch/2, cw*0.25, cw/2, ch/2, cw*0.8);
            vgrad.addColorStop(0, 'rgba(0,0,0,0)');
            vgrad.addColorStop(1, `rgba(0,0,0,${vigAlpha})`);
            ctx.globalAlpha = 1;
            ctx.fillStyle = vgrad;
            ctx.fillRect(0, 0, cw, ch);
          }

        } else {
          drawCoverFit(ctx, drawSrc, cw, ch);
        }

        ctx.restore();
      }
    }
