// ═══════════════════════════════════════════════
// HERO MORPH TRANSITION — Landing ↔ Reel
// ═══════════════════════════════════════════════

let _ptTransitioning = false;
let ptReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const PT_DURATION = {
  total: 1200,
  heroFade: 400,
  ctaMorph: 600,
  previewFade: 500,
  headerReveal: 400,
  panelReveal: 500,
  cardStagger: 50,
  cardReveal: 300
};

function pt$getOverlay() {
  return document.getElementById('page-transition');
}

function pt$getLandingHero() {
  return document.querySelector('.lp-hero');
}

function pt$getReelHeader() {
  return document.querySelector('.reel-header');
}

function pt$getReelMainHeading() {
  return document.querySelector('.reel-main-heading');
}

function pt$getLandingCTA() {
  return document.getElementById('btn-create-reel');
}

function pt$getReelAutoPill() {
  return document.querySelector('.reel-auto-pill');
}

function pt$getLandingPreview() {
  return document.querySelector('.lp-hero-preview');
}

function pt$getReelPanel() {
  return document.getElementById('reel-agent-panel');
}

function pt$getReelWorkflow() {
  return document.getElementById('reel-workflow');
}

function pt$getDropZone() {
  return document.getElementById('drop-zone');
}

function pt$getReelPage() {
  return document.getElementById('reel-page');
}

function pt$cloneStyles(el, clone) {
  if (!el) return;
  const computed = window.getComputedStyle(el);
  clone.style.position = 'fixed';
  clone.style.zIndex = '10001';
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
}

function pt$getElementCenter(el) {
  if (!el) return { x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function pt$getElementBounds(el) {
  if (!el) return { left: 0, top: 0, width: 0, height: 0 };
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function morphToReel(callback) {
  if (_ptTransitioning) return;
  if (ptReducedMotion) {
    if (callback) callback();
    return;
  }
  
  _ptTransitioning = true;
  
  const overlay = pt$getOverlay();
  const landingHero = pt$getLandingHero();
  const landingCTA = pt$getLandingCTA();
  const landingPreview = pt$getLandingPreview();
  const dropZone = pt$getDropZone();
  const reelPage = pt$getReelPage();
  
  if (!overlay || !landingHero) {
    _ptTransitioning = false;
    if (callback) callback();
    return;
  }
  
  // Reset overlay background for fresh transition
  const bg = overlay.querySelector('.pt-background');
  if (bg) {
    bg.style.transition = '';
    bg.style.opacity = '1';
  }
  
  // Ensure landing page is visible (in case it was hidden)
  if (dropZone) {
    dropZone.classList.remove('hidden');
    dropZone.style.transition = '';
    dropZone.style.opacity = '';
  }
  
  // Ensure reel page is properly hidden but don't mess with .visible class
  if (reelPage) {
    reelPage.style.transition = '';
    reelPage.style.opacity = '';
  }
  
  // Capture positions before any changes
  const ctaBounds = pt$getElementBounds(landingCTA);
  const reelPageBounds = pt$getElementBounds(reelPage);
  const heroBounds = pt$getElementBounds(landingHero);
  
  // Build overlay content
  const stage = overlay.querySelector('.pt-hero-stage');
  const heroTextClone = overlay.querySelector('.pt-hero-text');
  const ctaClone = overlay.querySelector('.pt-cta-button');
  const previewClone = overlay.querySelector('.pt-preview-window');
  
  // Clone hero text content
  const heroText = landingHero.querySelector('.lp-hero-text');
  if (heroText && heroTextClone) {
    heroTextClone.innerHTML = heroText.innerHTML;
    heroTextClone.className = 'pt-hero-text';
    Object.assign(heroTextClone.style, {
      position: 'fixed',
      left: heroBounds.left + 'px',
      top: heroBounds.top + 'px',
      width: heroBounds.width + 'px',
      textAlign: 'center',
      zIndex: '10002',
      pointerEvents: 'none'
    });
  }
  
  // Clone CTA button
  if (landingCTA && ctaClone) {
    ctaClone.innerHTML = landingCTA.innerHTML;
    ctaClone.className = 'pt-cta-button';
    Object.assign(ctaClone.style, {
      position: 'fixed',
      left: ctaBounds.left + 'px',
      top: ctaBounds.top + 'px',
      width: ctaBounds.width + 'px',
      height: ctaBounds.height + 'px',
      zIndex: '10003',
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontFamily: 'var(--lp-font-ui)',
      fontSize: '15px',
      fontWeight: '600',
      padding: '0 20px',
      borderRadius: '999px',
      background: 'var(--lp-card)',
      border: '1px solid var(--lp-card-bdr)',
      color: 'var(--lp-text)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)'
    });
  }
  
  // Clone preview window (will fade out)
  if (landingPreview && previewClone) {
    previewClone.innerHTML = '';
    previewClone.className = 'pt-preview-window';
    const previewBounds = pt$getElementBounds(landingPreview);
    Object.assign(previewClone.style, {
      position: 'fixed',
      left: previewBounds.left + 'px',
      top: previewBounds.top + 'px',
      width: previewBounds.width + 'px',
      height: previewBounds.height + 'px',
      zIndex: '10001',
      pointerEvents: 'none',
      overflow: 'hidden',
      borderRadius: '16px',
      background: 'var(--lp-bg2)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
    });
    // Clone the preview content
    previewClone.appendChild(landingPreview.cloneNode(true));
  }
  
  // Activate overlay
  overlay.classList.add('active');
  
  // Immediately show reel page at opacity 0 (no display:none flicker)
  if (reelPage) {
    reelPage.style.opacity = '0';
    reelPage.classList.add('visible');
  }
  
  // Animate landing elements fading out
  if (dropZone) {
    dropZone.style.transition = `opacity ${PT_DURATION.heroFade}ms ease`;
    dropZone.style.opacity = '0.3';
  }
  
  // Start hero text fade
  if (heroTextClone) {
    heroTextClone.style.transition = `opacity ${PT_DURATION.heroFade}ms ease, transform ${PT_DURATION.heroFade}ms ease`;
    requestAnimationFrame(() => {
      heroTextClone.style.opacity = '0';
      heroTextClone.style.transform = 'translateY(-30px) scale(0.95)';
    });
  }
  
  // Start preview fade
  if (previewClone) {
    previewClone.style.transition = `opacity ${PT_DURATION.previewFade}ms ease, transform ${PT_DURATION.previewFade}ms ease`;
    requestAnimationFrame(() => {
      previewClone.style.opacity = '0';
      previewClone.style.transform = 'scale(0.9)';
    });
  }
  
  // Morph CTA button toward pill position (top-right of reel page)
  if (ctaClone) {
    const targetX = window.innerWidth - 200;
    const targetY = 30;
    ctaClone.style.transition = `transform ${PT_DURATION.ctaMorph}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${PT_DURATION.ctaMorph}ms ease`;
    requestAnimationFrame(() => {
      const dx = targetX - ctaBounds.left - ctaBounds.width / 2;
      const dy = targetY - ctaBounds.top;
      ctaClone.style.transform = `translate(${dx}px, ${dy}px) scale(0.75)`;
      ctaClone.style.opacity = '0';
    });
  }
  
  // After landing elements fade, switch pages
  setTimeout(() => {
    // Hide landing page
    if (dropZone) {
      dropZone.classList.add('hidden');
    }
    
    // Fade out overlay background while fading in reel page
    const bg = overlay.querySelector('.pt-background');
    if (bg) {
      bg.style.transition = `opacity ${PT_DURATION.headerReveal}ms ease`;
      bg.style.opacity = '0';
    }
    
    // Reveal reel page elements with animation
    revealReelContent();
    
    if (callback) callback();
  }, PT_DURATION.heroFade);
}

function revealReelContent() {
  const overlay = pt$getOverlay();
  const bg = overlay ? overlay.querySelector('.pt-background') : null;
  const reelPage = pt$getReelPage();
  const reelHeader = pt$getReelHeader();
  const reelMainHeading = pt$getReelMainHeading();
  const reelPanel = pt$getReelPanel();
  const reelWorkflow = pt$getReelWorkflow();
  
  // Set initial states for animated elements (off-screen/invisible)
  if (reelHeader) {
    reelHeader.style.opacity = '0';
    reelHeader.style.transform = 'translateY(-20px)';
  }
  if (reelMainHeading) {
    reelMainHeading.style.opacity = '0';
    reelMainHeading.style.transform = 'translateY(-15px)';
  }
  if (reelPanel) {
    reelPanel.style.opacity = '0';
  }
  const stepCards = reelWorkflow ? reelWorkflow.querySelectorAll('.reel-step') : [];
  stepCards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(25px)';
  });
  
  // Force a reflow to ensure initial states are applied
  void (reelPage && reelPage.offsetHeight);
  
  // Fade out overlay background while fading in reel page
  if (bg) {
    bg.style.transition = `opacity ${PT_DURATION.headerReveal}ms ease`;
    bg.style.opacity = '0';
  }
  
  // Fade in the reel page container immediately
  if (reelPage) {
    reelPage.style.transition = `opacity ${PT_DURATION.headerReveal}ms ease`;
    reelPage.style.opacity = '1';
  }
  
  // Header slides down
  if (reelHeader) {
    reelHeader.style.transition = `opacity ${PT_DURATION.headerReveal}ms ease, transform ${PT_DURATION.headerReveal}ms ease`;
    reelHeader.style.opacity = '1';
    reelHeader.style.transform = 'translateY(0)';
  }
  
  // Main heading
  if (reelMainHeading) {
    reelMainHeading.style.transition = `opacity ${PT_DURATION.headerReveal}ms ease ${100}ms, transform ${PT_DURATION.headerReveal}ms ease ${100}ms`;
    reelMainHeading.style.opacity = '1';
    reelMainHeading.style.transform = 'translateY(0)';
  }
  
  // Panel fades in (delayed)
  if (reelPanel) {
    reelPanel.style.transition = `opacity ${PT_DURATION.panelReveal}ms ease ${150}ms`;
    reelPanel.style.opacity = '1';
  }
  
  // Step cards stagger in
  stepCards.forEach((card, index) => {
    const delay = 200 + index * PT_DURATION.cardStagger;
    card.style.transition = `opacity ${PT_DURATION.cardReveal}ms ease ${delay}ms, transform ${PT_DURATION.cardReveal}ms ease ${delay}ms`;
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  });
  
  // Transition is now complete - hide overlay and reset flag
  // (full cleanup only happens on return transition)
  const totalDuration = 200 + stepCards.length * PT_DURATION.cardStagger + PT_DURATION.cardReveal + 100;
  setTimeout(() => {
    overlay.classList.remove('active');
    _ptTransitioning = false;
  }, totalDuration);
}

function morphFromReel(callback) {
  if (_ptTransitioning) return;
  if (ptReducedMotion) {
    if (callback) callback();
    return;
  }
  
  _ptTransitioning = true;
  
  const overlay = pt$getOverlay();
  const reelHeader = pt$getReelHeader();
  const reelMainHeading = pt$getReelMainHeading();
  const reelPanel = pt$getReelPanel();
  const reelWorkflow = pt$getReelWorkflow();
  const dropZone = pt$getDropZone();
  const landingHero = pt$getLandingHero();
  
  if (!overlay) {
    _ptTransitioning = false;
    if (callback) callback();
    return;
  }
  
  // Fade out reel content (reverse order)
  // Step cards fade first
  const stepCards = reelWorkflow ? reelWorkflow.querySelectorAll('.reel-step') : [];
  stepCards.forEach((card, index) => {
    card.style.transition = `opacity ${PT_DURATION.cardReveal}ms ease, transform ${PT_DURATION.cardReveal}ms ease`;
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    requestAnimationFrame(() => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(25px)';
    });
  });
  
  // Panel fades
  if (reelPanel) {
    reelPanel.style.transition = `opacity ${PT_DURATION.panelReveal}ms ease`;
    requestAnimationFrame(() => {
      reelPanel.style.opacity = '0';
    });
  }
  
  // Header and heading fade up
  if (reelMainHeading) {
    reelMainHeading.style.transition = `opacity ${PT_DURATION.headerReveal}ms ease, transform ${PT_DURATION.headerReveal}ms ease`;
    requestAnimationFrame(() => {
      reelMainHeading.style.opacity = '0';
      reelMainHeading.style.transform = 'translateY(-15px)';
    });
  }
  
  if (reelHeader) {
    reelHeader.style.transition = `opacity ${PT_DURATION.headerReveal}ms ease, transform ${PT_DURATION.headerReveal}ms ease`;
    requestAnimationFrame(() => {
      reelHeader.style.opacity = '0';
      reelHeader.style.transform = 'translateY(-20px)';
    });
  }
  
  // Prepare landing hero reveal
  if (landingHero) {
    landingHero.style.transition = `opacity ${PT_DURATION.heroFade}ms ease`;
  }
  
  // Navigate back after reel content fades
  setTimeout(() => {
    if (callback) callback();
    
    // Reveal landing page
    if (dropZone) {
      dropZone.style.transition = `opacity ${PT_DURATION.heroFade}ms ease`;
      dropZone.style.opacity = '1';
    }
    
    setTimeout(() => {
      pt$cleanup();
    }, PT_DURATION.heroFade + 100);
  }, PT_DURATION.panelReveal + 100);
}

function pt$cleanup() {
  const overlay = pt$getOverlay();
  const dropZone = pt$getDropZone();
  const reelHeader = pt$getReelHeader();
  const reelMainHeading = pt$getReelMainHeading();
  const reelPanel = pt$getReelPanel();
  const reelWorkflow = pt$getReelWorkflow();
  const reelPage = pt$getReelPage();
  
  // Remove overlay
  if (overlay) {
    overlay.classList.remove('active');
    const bg = overlay.querySelector('.pt-background');
    if (bg) {
      bg.style.transition = '';
      bg.style.opacity = '1'; // Reset for next transition
    }
    const heroTextClone = overlay.querySelector('.pt-hero-text');
    const ctaClone = overlay.querySelector('.pt-cta-button');
    const previewClone = overlay.querySelector('.pt-preview-window');
    if (heroTextClone) heroTextClone.innerHTML = '';
    if (ctaClone) ctaClone.innerHTML = '';
    if (previewClone) previewClone.innerHTML = '';
  }
  
  // Remove inline transition styles
  if (dropZone) {
    dropZone.style.transition = '';
    dropZone.style.opacity = '';
  }
  
  if (reelPage) {
    reelPage.style.transition = '';
    reelPage.style.opacity = '';
  }
  
  if (reelHeader) {
    reelHeader.style.transition = '';
    reelHeader.style.opacity = '';
    reelHeader.style.transform = '';
  }
  
  if (reelMainHeading) {
    reelMainHeading.style.transition = '';
    reelMainHeading.style.opacity = '';
    reelMainHeading.style.transform = '';
  }
  
  if (reelPanel) {
    reelPanel.style.transition = '';
    reelPanel.style.opacity = '';
  }
  
  if (reelWorkflow) {
    const stepCards = reelWorkflow.querySelectorAll('.reel-step');
    stepCards.forEach(card => {
      card.style.transition = '';
      card.style.opacity = '';
      card.style.transform = '';
    });
  }
  
  _ptTransitioning = false;
}

window.morphToReel = morphToReel;
window.morphFromReel = morphFromReel;
window.ptIsTransitioning = () => _ptTransitioning;