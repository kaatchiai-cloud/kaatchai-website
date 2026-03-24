// ── Event handlers ──
// New project — go straight to editor
const btnNewProject = $('btn-new-project');
btnNewProject.addEventListener('click', (e) => {
  e.stopPropagation();
  currentBuffer = null;
  photoItems = []; textItems = []; subtitleItems = [];
  blockElements.clear(); textBlockElements.clear(); subBlockElements.clear();
  undoStack = []; nextPhotoId = 1; nextTextId = 1;
  selectedPhotoIds.clear(); selectedTextIds.clear();
  cameFromCreate = false;
  createScenes = null; createTranscript = null; createAudioBuffer = null; selectedTemplate = '';
  btnBackToCreate.style.display = 'none';
  bgmBuffer = null; bgmSource = null; bgmGainNode = null;
  videoTimelineItems = []; nextVideoTimelineId = 1; selectedVideoIds.clear();
  storyCharacters = []; storyEnvironments = []; nextCharId = 1; nextEnvId = 1;
  bgVideoMode = 'images-only';
  frameImgEl = null; frameImgSrc = ''; framePadding = { top: 40, bottom: 40, left: 40, right: 40 }; frameOpacity = 1;
  logoImgEl = null; logoImgSrc = ''; logoPosition = 'top-right'; logoSize = 10; logoOpacity = 0.8;
  const frameSec = $('frame-section'); if (frameSec) frameSec.style.display = 'none';
  const logoSec2 = $('logo-section'); if (logoSec2) logoSec2.style.display = 'none';
  const bgmSec = $('bgm-section');
  if (bgmSec) bgmSec.style.display = 'none';
  const bgVidSec = $('bg-video-section');
  if (bgVidSec) bgVidSec.style.display = 'none';
  if (typeof renderVideoTimeline === 'function') renderVideoTimeline();
  currentSeriesName = ''; currentEpisodeNumber = 0;
  pipItems = []; nextPipId = 1;
  const pipSec = $('pip-section');
  if (pipSec) pipSec.style.display = 'none';
  const pipPr = $('pip-props');
  if (pipPr) pipPr.classList.remove('visible');
  editorLanguageTracks = []; editorCurrentLang = 'original';
  editorOriginalBuffer = null; editorOriginalSubtitles = [];
  const editorLangDiv = $('editor-lang-selector');
  if (editorLangDiv) editorLangDiv.style.display = 'none';
  const seriesEl = $('series-name');
  const epEl = $('episode-number');
  if (seriesEl) seriesEl.value = '';
  if (epEl) epEl.value = '';
  dropZone.classList.add('hidden');
  editorEl.classList.add('visible');
  updateAudioControls();
  applyEditorPlanGating();
  loadEditorLibrary();
  drawRuler(); renderPhotos(); renderTexts(); renderSubtitles();
  setStatus('New project created. Import audio, add photos or text to begin.');
});

// Home button in editor — go back to landing page
const btnEditorHome = $('btn-editor-home');
btnEditorHome.addEventListener('click', () => {
  editorEl.classList.remove('visible');
  dropZone.classList.remove('hidden');
  renderProjectGallery();
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); if(e.dataTransfer.files[0]) loadFileIntoEditor(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => { if(fileInput.files[0]) loadFileIntoEditor(fileInput.files[0]); fileInput.value=''; });
btnLoad.addEventListener('click', () => fileInput.click());
btnPlay.addEventListener('click', () => { wavesurfer.isPlaying() ? wavesurfer.pause() : wavesurfer.play(); });
btnPlaySelection.addEventListener('click', () => {
  if (!activeRegion || !wavesurfer) return;
  activeRegion.play();
});
btnStop.addEventListener('click', () => wavesurfer.stop());
btnKeep.addEventListener('click', async () => { if(!activeRegion) return; pushUndo(); currentBuffer=extractRegion(currentBuffer,activeRegion.start,activeRegion.end); setStatus(`Kept: ${fmt(currentBuffer.duration)}`); await refreshWaveform(); });
btnDelete.addEventListener('click', async () => { if(!activeRegion) return; pushUndo(); const r=deleteRegion(currentBuffer,activeRegion.start,activeRegion.end); if(!r){setStatus('Cannot delete all');return;} currentBuffer=r; setStatus(`Deleted. ${fmt(currentBuffer.duration)}`); await refreshWaveform(); });
btnInsert.addEventListener('click', () => insertInput.click());
insertInput.addEventListener('change', async () => { const f=insertInput.files[0]; if(!f)return; insertInput.value=''; const ct=wavesurfer.getCurrentTime(); setStatus(`Inserting at ${fmt(ct)}...`); try{const ib=await loadAudioBuffer(f);pushUndo();currentBuffer=insertAudioAt(currentBuffer,ib,ct);setStatus(`Inserted. ${fmt(currentBuffer.duration)}`);await refreshWaveform();}catch(e){setStatus('Error: '+e.message);} });
btnUndo.addEventListener('click', async () => { if(!undoStack.length)return; currentBuffer=undoStack.pop(); if(!undoStack.length)btnUndo.disabled=true; setStatus(`Undo. ${fmt(currentBuffer.duration)}`); await refreshWaveform(); });
window.addEventListener('resize', () => { drawRuler(); renderPhotos(); renderVideoTimeline(); renderTexts(); renderSubtitles(); });

// Background video mode dropdown + PiP transition controls
const bgVideoModeEl = $('bg-video-mode');
const pipTransControls = $('pip-trans-controls');
const pipTransTypeEl = $('pip-trans-type');
const pipTransDurEl = $('pip-trans-dur');
const pipTransPosEl = $('pip-trans-pos');

function updatePipTransControlsVisibility() {
  if (pipTransControls) {
    const showControls = bgVideoMode === 'video-pip-transition' || bgVideoMode === 'video-pip';
    pipTransControls.style.display = showControls ? '' : 'none';
  }
}

if (bgVideoModeEl) {
  bgVideoModeEl.addEventListener('change', () => {
    bgVideoMode = bgVideoModeEl.value;
    updatePipTransControlsVisibility();
    markDirty();
  });
}
if (pipTransTypeEl) {
  pipTransTypeEl.addEventListener('change', () => { pipTransType = pipTransTypeEl.value; markDirty(); });
}
if (pipTransDurEl) {
  pipTransDurEl.addEventListener('change', () => { pipTransDur = parseFloat(pipTransDurEl.value) || 0.5; markDirty(); });
}
if (pipTransPosEl) {
  pipTransPosEl.addEventListener('change', () => { pipTransPos = pipTransPosEl.value; markDirty(); });
}

// Check for autosave recovery on app load
// Defer autosave check to avoid blocking first paint
setTimeout(checkAutosaveRecovery, 500);

// Temporary plan selector
const planSelector = $('plan-selector');
if (planSelector) {
  planSelector.value = currentPlan;
  planSelector.addEventListener('change', () => {
    currentPlan = planSelector.value;
    localStorage.setItem('stori_plan', currentPlan);
    updateUserSection();
    setStatus(`Switched to ${currentPlan === 'pro' ? 'Pro' : 'Free'} plan`);
  });
}

// ── User Section (placeholder until Firebase Auth) ──
const btnUserMenu = $('btn-user-menu');
const userDropdown = $('user-dropdown');
const btnSignIn = $('btn-sign-in');
const btnSignOut = $('btn-sign-out');
const btnManageSub = $('btn-manage-sub');

// Toggle dropdown
if (btnUserMenu) btnUserMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdown.classList.toggle('hidden');
});
// Close dropdown on outside click
document.addEventListener('click', () => {
  if (userDropdown) userDropdown.classList.add('hidden');
});
if (userDropdown) userDropdown.addEventListener('click', (e) => e.stopPropagation());

// Placeholder sign in/out (simulated, replaced by Firebase later)
if (btnSignIn) btnSignIn.addEventListener('click', () => {
  // Simulate sign in
  localStorage.setItem('stori_user', JSON.stringify({ name: 'User', email: 'user@email.com' }));
  updateUserSection();
});
if (btnSignOut) btnSignOut.addEventListener('click', () => {
  localStorage.removeItem('stori_user');
  updateUserSection();
});
if (btnManageSub) btnManageSub.addEventListener('click', () => {
  setStatus('Subscription management coming soon.');
});

function updateUserSection() {
  const userData = JSON.parse(localStorage.getItem('stori_user') || 'null');
  const signedOut = $('user-signed-out');
  const signedIn = $('user-signed-in');
  if (!signedOut || !signedIn) return;

  if (userData) {
    signedOut.classList.add('hidden');
    signedIn.classList.remove('hidden');
    const nameEl = $('user-name');
    const emailEl = $('user-email');
    if (nameEl) nameEl.textContent = userData.name || 'User';
    if (emailEl) emailEl.textContent = userData.email || '';
    // Plan badge
    const badge = $('user-plan-badge');
    const detail = $('user-plan-detail');
    if (badge) {
      badge.textContent = isPro() ? 'Pro' : 'Free';
      badge.className = `plan-badge ${isPro() ? 'plan-pro' : 'plan-free'}`;
    }
    if (detail) detail.textContent = isPro() ? '$10/mo' : '';
    // API key status
    const freeStatus = $('user-key-free-status');
    const paidStatus = $('user-key-paid-status');
    if (freeStatus) freeStatus.textContent = localStorage.getItem('stori_key_free') ? '✓ Set' : 'Not set';
    if (paidStatus) paidStatus.textContent = localStorage.getItem('stori_key_paid') ? '✓ Set' : 'Not set';
    // Project count
    if (typeof getGalleryProjects === 'function') {
      getGalleryProjects().then(projects => {
        const countEl = $('user-project-count');
        if (countEl) countEl.textContent = projects.length;
      });
    }
  } else {
    signedOut.classList.remove('hidden');
    signedIn.classList.add('hidden');
  }
}

// Init user section on load
updateUserSection();
