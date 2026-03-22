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
  createScenes = null; createTranscript = null; createAudioBuffer = null;
  btnBackToCreate.style.display = 'none';
  bgmBuffer = null; bgmSource = null; bgmGainNode = null;
  const bgmSec = $('bgm-section');
  if (bgmSec) bgmSec.style.display = 'none';
  currentSeriesName = ''; currentEpisodeNumber = 0;
  pipEnabled = false; pipVideoEl = null; pipVideoSrc = null; pipVideoDuration = 0;
  pipCustomX = null; pipCustomY = null;
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
window.addEventListener('resize', () => { drawRuler(); renderPhotos(); renderTexts(); renderSubtitles(); });
