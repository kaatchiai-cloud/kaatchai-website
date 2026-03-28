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
  navigateTo('editor');
  updateAudioControls();
  applyEditorPlanGating();
  loadEditorLibrary();
  drawRuler(); renderPhotos(); renderTexts(); renderSubtitles();
  setStatus('New project created. Import audio, add photos or text to begin.');
});

// Home button in editor — go back to landing page
const btnEditorHome = $('btn-editor-home');
btnEditorHome.addEventListener('click', () => {
  navigateTo('home');
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
   
  });
}
if (pipTransTypeEl) {
  pipTransTypeEl.addEventListener('change', () => { pipTransType = pipTransTypeEl.value; });
}
if (pipTransDurEl) {
  pipTransDurEl.addEventListener('change', () => { pipTransDur = parseFloat(pipTransDurEl.value) || 0.5; });
}
if (pipTransPosEl) {
  pipTransPosEl.addEventListener('change', () => { pipTransPos = pipTransPosEl.value; });
}


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

// User section is now in 15-project.js (loads on landing page)
