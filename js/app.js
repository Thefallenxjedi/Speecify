import { openDB, saveRecording, getAllRecordings, deleteRecording } from './db.js';
import { AudioPipeline, autoCorrelate } from './audio-pipeline.js';
import { SpeechRecognitionManager } from './speech-recognition.js';
import { PRACTICE_PROMPTS, alignSpeech, evaluateSpeech, SYLLABLE_DB, countAndSplitSyllables } from './speech-coach.js';

// Global application state
const state = {
  activeView: 'dashboard',
  isRecording: false,
  isPaused: false,
  settings: {
    geminiMode: false,
    apiKey: ''
  },
  currentPromptIndex: 0,
  activePrompt: null,
  isCoachingPractice: false,
  currentLiveTranscript: '',
  recordingContext: 'dashboard',
  
  // Current recording details
  currentSession: null,
  
  // Selected recording for report view
  selectedRecording: null
};

// Sub-managers
let audioPipeline = null;
let speechRecognition = null;

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', async () => {
  // Load Settings
  loadSettings();

  // Elements initialization
  initElements();

  // Setup tabs
  setupTabs();

  // Setup Event Listeners
  setupEventListeners();

  // Setup Audio pipeline & Speech Recognition
  await setupAudioAndRecognition();

  // Set initial speech coach prompt
  loadPrompt(0);

  // Initialize DB and load history list
  try {
    await openDB();
    await refreshHistoryList();
  } catch (err) {
    console.error('Error opening database:', err);
    alert('Failed to initialize local IndexedDB. Recordings will not persist.');
  }
});

// Load Settings from LocalStorage
function loadSettings() {
  state.settings.geminiMode = localStorage.getItem('voxlyze_gemini_mode') === 'true';
  state.settings.apiKey = localStorage.getItem('voxlyze_api_key') || '';
  
  // Sync form inputs if they exist
  const modeCheck = document.getElementById('settings-gemini-mode');
  const keyInput = document.getElementById('settings-api-key');
  if (modeCheck) modeCheck.checked = state.settings.geminiMode;
  if (keyInput) keyInput.value = state.settings.apiKey;
}

// Dom Element bindings
let elements = {};
function initElements() {
  elements = {
    // Nav Tabs
    tabDashboard: document.getElementById('tab-btn-dashboard'),
    tabCoach: document.getElementById('tab-btn-coach'),
    tabReport: document.getElementById('tab-btn-report'),
    
    // Status
    statusBadge: document.getElementById('status-badge'),
    statusText: document.getElementById('status-text'),
    settingsGear: document.getElementById('settings-gear'),
    
    // Sidebar
    tracksBadge: document.getElementById('tracks-badge'),
    historyList: document.getElementById('history-list'),
    historyEmpty: document.getElementById('history-empty'),
    
    // View Sections
    viewDashboard: document.getElementById('view-dashboard'),
    viewCoach: document.getElementById('view-speech-coach'),
    viewReport: document.getElementById('view-speech-report'),
    
    // Dashboard Panel
    recordBtn: document.getElementById('record-btn'),
    timerDisplay: document.getElementById('timer-display'),
    pauseBtn: document.getElementById('pause-btn'),
    stopBtn: document.getElementById('stop-btn'),
    visualizerCanvas: document.getElementById('visualizer-canvas'),
    pitchCanvas: document.getElementById('pitch-canvas'),
    liveTranscript: document.getElementById('live-transcript'),
    
    // Speech Coach
    promptCategory: document.getElementById('prompt-category'),
    btnCustomText: document.getElementById('btn-custom-text'),
    customLyricsContainer: document.getElementById('custom-lyrics-container'),
    customLyricsInput: document.getElementById('custom-lyrics-input'),
    btnCancelCustom: document.getElementById('btn-cancel-custom'),
    btnLoadCustom: document.getElementById('btn-load-custom'),
    coachTeleprompterBox: document.getElementById('coach-teleprompter-box'),
    promptTips: document.getElementById('prompt-tips'),
    btnNextPrompt: document.getElementById('btn-next-prompt'),
    btnPracticePrompt: document.getElementById('btn-practice-prompt'),
    accuracyScore: document.getElementById('accuracy-score'),
    diffResults: document.getElementById('diff-results'),
    coachAdvice: document.getElementById('coach-advice'),
    
    // Speech Coach Recorder elements
    coachRecorderContainer: document.getElementById('coach-recorder-container'),
    coachRecordBtn: document.getElementById('coach-record-btn'),
    coachTimerDisplay: document.getElementById('coach-timer-display'),
    coachPauseBtn: document.getElementById('coach-pause-btn'),
    coachStopBtn: document.getElementById('coach-stop-btn'),
    coachVisualizerCanvas: document.getElementById('coach-visualizer-canvas'),
    coachPitchCanvas: document.getElementById('coach-pitch-canvas'),
    coachLiveTranscript: document.getElementById('coach-live-transcript'),
    
    // Speech Report
    reportDuration: document.getElementById('report-duration'),
    reportWpm: document.getElementById('report-wpm'),
    reportWpmLabel: document.getElementById('report-wpm-label'),
    reportAvgPitch: document.getElementById('report-avg-pitch'),
    reportPitchVariance: document.getElementById('report-pitch-variance'),
    reportPauses: document.getElementById('report-pauses'),
    reportRegisterBadge: document.getElementById('report-register-badge'),
    pitchPointer: document.getElementById('pitch-pointer'),
    evalPaceBadge: document.getElementById('eval-pace-badge'),
    evalPaceDesc: document.getElementById('eval-pace-desc'),
    evalInflectionBadge: document.getElementById('eval-inflection-badge'),
    evalInflectionDesc: document.getElementById('eval-inflection-desc'),
    evalRegisterBadgeText: document.getElementById('eval-register-badge-text'),
    evalRegisterDesc: document.getElementById('eval-register-desc'),
    evalPausesBadge: document.getElementById('eval-pauses-badge'),
    evalPausesDesc: document.getElementById('eval-pauses-desc'),
    reportTranscriptText: document.getElementById('report-transcript-text'),
    
    // Exports
    btnTranscribeGemini: document.getElementById('btn-transcribe-gemini'),
    btnCopyTranscript: document.getElementById('btn-copy-transcript'),
    btnPdfReport: document.getElementById('btn-pdf-report'),
    btnEmailReport: document.getElementById('btn-email-report'),
    btnDownloadAudio: document.getElementById('btn-download-audio'),
    
    // Status Text helper
    recordActionSubtext: document.getElementById('record-action-subtext'),
    
    // Modals
    settingsModal: document.getElementById('settings-modal'),
    settingsClose: document.getElementById('settings-close'),
    settingsGeminiMode: document.getElementById('settings-gemini-mode'),
    settingsApiKey: document.getElementById('settings-api-key'),
    settingsCancel: document.getElementById('settings-cancel'),
    settingsSave: document.getElementById('settings-save'),
    
    nameModal: document.getElementById('name-modal'),
    recordingNameInput: document.getElementById('recording-name-input'),
    nameCancel: document.getElementById('name-cancel'),
    nameSave: document.getElementById('name-save'),
    
    apiSpinnerOverlay: document.getElementById('api-spinner-overlay'),
    spinnerStatus: document.getElementById('spinner-status'),

    // Analytics & Warm-up Game elements
    analyticsCanvas: document.getElementById('analytics-canvas'),
    reportAccuracyCard: document.getElementById('report-accuracy-card'),
    reportAccuracy: document.getElementById('report-accuracy'),
    
    // Report Accuracy & Diff elements
    reportAccuracyPanel: document.getElementById('report-accuracy-panel'),
    reportAccuracyScore: document.getElementById('report-accuracy-score'),
    reportDiffResults: document.getElementById('report-diff-results'),
    reportSyllableInspectorPanel: document.getElementById('report-syllable-inspector-panel'),
    reportSyllableInspectorContent: document.getElementById('report-syllable-inspector-content'),
    warmupBtn: document.getElementById('warmup-btn'),
    warmupModal: document.getElementById('warmup-modal'),
    warmupClose: document.getElementById('warmup-close'),
    warmupCanvas: document.getElementById('warmup-canvas'),
    warmupScore: document.getElementById('warmup-score'),
    warmupFeedback: document.getElementById('warmup-feedback'),
    warmupFrequency: document.getElementById('warmup-frequency'),
    warmupRegister: document.getElementById('warmup-register'),
    warmupStartBtn: document.getElementById('warmup-start-btn'),
    warmupResetBtn: document.getElementById('warmup-reset-btn'),
    
    // Syllable Inspector Elements
    syllableInspectorPanel: document.getElementById('syllable-inspector-panel'),
    syllableInspectorContent: document.getElementById('syllable-inspector-content'),
    dashSyllableInspectorPanel: document.getElementById('dash-syllable-inspector-panel'),
    dashSyllableInspectorContent: document.getElementById('dash-syllable-inspector-content')
  };
}

// Router/Tab Setup
function setupTabs() {
  const tabs = [elements.tabDashboard, elements.tabCoach, elements.tabReport];
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-view');
      switchView(view);
    });
  });
}

function switchView(viewName) {
  state.activeView = viewName;
  
  // Update Tab buttons
  elements.tabDashboard.classList.toggle('active', viewName === 'dashboard');
  elements.tabCoach.classList.toggle('active', viewName === 'speech-coach');
  elements.tabReport.classList.toggle('active', viewName === 'speech-report');
  
  // Update View visibility
  elements.viewDashboard.classList.toggle('active', viewName === 'dashboard');
  elements.viewCoach.classList.toggle('active', viewName === 'speech-coach');
  elements.viewReport.classList.toggle('active', viewName === 'speech-report');

  // Trigger browser canvas resizing updates if visible
  if (viewName === 'dashboard') {
    state.recordingContext = 'dashboard';
    resizeCanvases();
  } else if (viewName === 'speech-coach') {
    if (!state.isRecording) {
      state.recordingContext = 'coach';
    }
  } else if (viewName === 'speech-report') {
    drawAnalyticsChart();
  }
}

// Resize canvases on window resize or load
function resizeCanvases() {
  if (elements.visualizerCanvas && elements.pitchCanvas) {
    const vParent = elements.visualizerCanvas.parentElement;
    const pParent = elements.pitchCanvas.parentElement;
    
    elements.visualizerCanvas.width = vParent.clientWidth - 40;
    elements.pitchCanvas.width = pParent.clientWidth - 40;
  }
}
window.addEventListener('resize', resizeCanvases);

// Audio Setup
async function setupAudioAndRecognition() {
  audioPipeline = new AudioPipeline();
  await audioPipeline.init(elements.visualizerCanvas, elements.pitchCanvas);
  
  // Pipeline bindings
  audioPipeline.onTimeUpdate = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = (secs % 60).toFixed(1);
    const timeStr = `${mins.toString().padStart(2, '0')}:${remainingSecs.padStart(4, '0')}`;
    if (state.recordingContext === 'coach') {
      elements.coachTimerDisplay.textContent = timeStr;
    } else {
      elements.timerDisplay.textContent = timeStr;
    }
  };

  audioPipeline.onPauseDetected = (count) => {
    console.log('Pause registered, total pauses:', count);
  };

  audioPipeline.onGainUpdate = (db) => {
    if (!state.isRecording || state.isPaused) return;
    const dbPct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    
    // Update volume track bars
    document.querySelectorAll('.live-vol-fill').forEach(fill => {
      fill.style.width = `${dbPct}%`;
    });
    
    // Update volume text values
    const volStr = `${db.toFixed(1)} dB`;
    const volTextDashboard = document.getElementById('live-vol-text');
    const volTextCoach = document.getElementById('coach-live-vol-text');
    if (volTextDashboard) volTextDashboard.textContent = volStr;
    if (volTextCoach) volTextCoach.textContent = volStr;
  };

  audioPipeline.onPitchUpdate = (hz) => {
    if (!state.isRecording || state.isPaused || hz <= 0) return;
    
    // Map Hz (70Hz - 400Hz) to horizontal percentage: ((hz - 70) / (400 - 70)) * 100
    let hzPct = ((hz - 70) / (400 - 70)) * 100;
    hzPct = Math.max(0, Math.min(100, hzPct)); // clamp
    
    // Update pitch indicators
    document.querySelectorAll('.live-pitch-indicator').forEach(ind => {
      ind.style.left = `${hzPct}%`;
    });
    
    // Display current frequency values
    const pitchStr = `${hz.toFixed(0)} Hz`;
    const pitchTextDashboard = document.getElementById('live-pitch-text');
    const pitchTextCoach = document.getElementById('coach-live-pitch-text');
    if (pitchTextDashboard) pitchTextDashboard.textContent = pitchStr;
    if (pitchTextCoach) pitchTextCoach.textContent = pitchStr;
    
    // Classify vocal register in real-time (Deep, Medium, High)
    let register = 'Medium';
    if (hz < 130) {
      register = 'Deep (Chest)';
    } else if (hz > 250) {
      register = 'High (Head)';
    } else {
      register = 'Medium (Mixed)';
    }
    
    // Update register text
    const registerDashboard = document.getElementById('live-register-val');
    const registerCoach = document.getElementById('coach-live-register-val');
    if (registerDashboard) registerDashboard.textContent = register;
    if (registerCoach) registerCoach.textContent = register;
  };

  speechRecognition = new SpeechRecognitionManager();
  
  speechRecognition.onResult = (text, isFinal) => {
    state.currentLiveTranscript = text;
    if (state.recordingContext === 'coach') {
      elements.coachLiveTranscript.textContent = text;
      elements.coachLiveTranscript.scrollTop = elements.coachLiveTranscript.scrollHeight;
      updateTeleprompter(text);
    } else {
      renderClickableText(elements.liveTranscript, text);
      elements.liveTranscript.scrollTop = elements.liveTranscript.scrollHeight;
    }

    // Calculate dynamic Pace (WPM)
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const elapsedMinutes = audioPipeline.getDuration() / 60;
    let wpm = 0;
    if (elapsedMinutes > 0) {
      wpm = Math.round(wordCount / elapsedMinutes);
    }
    
    // Detect and count Filler Words
    const fillers = ['um', 'uh', 'like', 'so', 'ah', 'you know'];
    let fillerCount = 0;
    const cleanWords = text.toLowerCase().replace(/[\.,\?!;:"'\(\)\-—]/g, '').split(/\s+/).filter(w => w.length > 0);
    cleanWords.forEach(w => {
      if (fillers.includes(w)) {
        fillerCount++;
      }
    });
    const matchesYouKnow = (text.toLowerCase().match(/\byou know\b/g) || []).length;
    fillerCount += matchesYouKnow;
    
    // Clarity Rating: starts at 98% and decreases by 3% per filler word
    const clarity = Math.max(40, 98 - (fillerCount * 3));
    
    // Update metrics UI
    const wpmValEls = document.querySelectorAll('.live-wpm-val');
    wpmValEls.forEach(el => el.textContent = wpm > 0 ? wpm : '--');
    
    const fillersValEls = document.querySelectorAll('.live-fillers-val');
    fillersValEls.forEach(el => el.textContent = fillerCount);
    
    const clarityValEls = document.querySelectorAll('.live-clarity-val');
    clarityValEls.forEach(el => el.textContent = `${clarity}%`);
  };
}

// Bind standard events
function setupEventListeners() {
  // Settings Gear
  elements.settingsGear.addEventListener('click', () => {
    elements.settingsModal.classList.add('active');
  });
  
  elements.settingsClose.addEventListener('click', closeSettingsModal);
  elements.settingsCancel.addEventListener('click', closeSettingsModal);
  
  elements.settingsSave.addEventListener('click', () => {
    localStorage.setItem('voxlyze_gemini_mode', elements.settingsGeminiMode.checked);
    localStorage.setItem('voxlyze_api_key', elements.settingsApiKey.value.trim());
    loadSettings();
    closeSettingsModal();
  });
  
  // Recording controls
  elements.recordBtn.addEventListener('click', () => {
    state.recordingContext = 'dashboard';
    toggleRecording();
  });
  elements.pauseBtn.addEventListener('click', togglePause);
  elements.stopBtn.addEventListener('click', finishRecording);
  
  // Speech Coach Recording controls
  elements.coachRecordBtn.addEventListener('click', () => {
    state.recordingContext = 'coach';
    toggleRecording();
  });
  elements.coachPauseBtn.addEventListener('click', togglePause);
  elements.coachStopBtn.addEventListener('click', finishRecording);
  
  // On-demand Gemini Transcription button in Report view
  if (elements.btnTranscribeGemini) {
    elements.btnTranscribeGemini.addEventListener('click', runOnDemandGeminiTranscription);
  }
  
  // Discard/Save name modals
  elements.nameCancel.addEventListener('click', () => {
    elements.nameModal.classList.remove('active');
    resetRecordingUI();
    state.currentSession = null;
  });
  
  elements.nameSave.addEventListener('click', saveSession);
  
  // Speech Coach prompts & Custom Text
  elements.btnNextPrompt.addEventListener('click', nextPrompt);
  elements.btnPracticePrompt.addEventListener('click', startPracticePrompt);

  elements.btnCustomText.addEventListener('click', () => {
    elements.coachTeleprompterBox.style.display = 'none';
    elements.customLyricsContainer.style.display = 'flex';
    elements.customLyricsInput.value = '';
    elements.customLyricsInput.focus();
  });

  elements.btnCancelCustom.addEventListener('click', () => {
    elements.customLyricsContainer.style.display = 'none';
    elements.coachTeleprompterBox.style.display = 'block';
  });

  elements.btnLoadCustom.addEventListener('click', () => {
    const text = elements.customLyricsInput.value.trim();
    if (!text) {
      alert('Please paste some text first.');
      return;
    }
    
    // Set custom prompt in state
    state.activePrompt = {
      id: 999,
      category: 'Custom Prompt / Lyrics',
      prompt: text,
      tips: 'Review your pasted custom text. Speak clearly and follow your own pacing!'
    };
    
    // Update Category badge and tips
    elements.promptCategory.textContent = state.activePrompt.category;
    elements.promptTips.textContent = state.activePrompt.tips;
    
    // Render in teleprompter
    renderTeleprompter(text);
    
    // Clear old evaluations
    elements.diffResults.innerHTML = '';
    elements.accuracyScore.textContent = '--%';
    elements.coachAdvice.innerHTML = '';
    
    // Show teleprompter box again
    elements.customLyricsContainer.style.display = 'none';
    elements.coachTeleprompterBox.style.display = 'block';
  });

  // Report Export Actions
  elements.btnCopyTranscript.addEventListener('click', copyTranscriptText);
  elements.btnPdfReport.addEventListener('click', printReportPDF);
  elements.btnEmailReport.addEventListener('click', emailReport);
  elements.btnDownloadAudio.addEventListener('click', downloadAudioWebM);

  // Word Inspection Click Listeners
  elements.diffResults.addEventListener('click', (e) => {
    const span = e.target.closest('.diff-word');
    if (!span) return;
    
    let textToSpeak = span.textContent.trim();
    if (span.classList.contains('diff-miss')) {
      textToSpeak = textToSpeak.split('(got:')[0].trim();
    }
    
    const cleanWordVal = textToSpeak.replace(/[\.,\?!;:"'\(\)\-—]/g, '').trim();
    if (cleanWordVal) {
      speakAndInspectWord(cleanWordVal, span, 'coach');
    }
  });

  if (elements.reportDiffResults) {
    elements.reportDiffResults.addEventListener('click', (e) => {
      const span = e.target.closest('.diff-word');
      if (!span) return;
      
      let textToSpeak = span.textContent.trim();
      if (span.classList.contains('diff-miss')) {
        textToSpeak = textToSpeak.split('(got:')[0].trim();
      }
      
      const cleanWordVal = textToSpeak.replace(/[\.,\?!;:"'\(\)\-—]/g, '').trim();
      if (cleanWordVal) {
        speakAndInspectWord(cleanWordVal, span, 'report');
      }
    });
  }

  elements.coachTeleprompterBox.addEventListener('click', (e) => {
    const span = e.target.closest('.tele-word');
    if (!span) return;
    
    const cleanWordVal = span.getAttribute('data-clean');
    if (cleanWordVal) {
      speakAndInspectWord(cleanWordVal, span, 'coach');
    }
  });

  elements.liveTranscript.addEventListener('click', (e) => {
    const span = e.target.closest('.dash-word');
    if (!span) return;
    
    const cleanWordVal = span.getAttribute('data-word');
    if (cleanWordVal) {
      speakAndInspectWord(cleanWordVal, span, 'dashboard');
    }
  });

  // Vocal Pitch Warm-up Game Event Listeners
  elements.warmupBtn.addEventListener('click', () => {
    elements.warmupModal.classList.add('active');
  });
  
  elements.warmupClose.addEventListener('click', () => {
    stopWarmupGame();
    elements.warmupModal.classList.remove('active');
  });
  
  elements.warmupStartBtn.addEventListener('click', toggleWarmupGame);
  elements.warmupResetBtn.addEventListener('click', resetWarmupGame);
}

function closeSettingsModal() {
  elements.settingsModal.classList.remove('active');
  // Re-sync input states with localStorage
  elements.settingsGeminiMode.checked = state.settings.geminiMode;
  elements.settingsApiKey.value = state.settings.apiKey;
}

// Handle Record / Pause / Stop logic
async function toggleRecording() {
  if (!state.isRecording) {
    // Start Recording
    try {
      state.isRecording = true;
      state.isPaused = false;
      state.currentLiveTranscript = '';
      
      const recordBtn = state.recordingContext === 'coach' ? elements.coachRecordBtn : elements.recordBtn;
      const pauseBtn = state.recordingContext === 'coach' ? elements.coachPauseBtn : elements.pauseBtn;
      const stopBtn = state.recordingContext === 'coach' ? elements.coachStopBtn : elements.stopBtn;
      const liveTranscript = state.recordingContext === 'coach' ? elements.coachLiveTranscript : elements.liveTranscript;
      const vCanvas = state.recordingContext === 'coach' ? elements.coachVisualizerCanvas : elements.visualizerCanvas;
      const pCanvas = state.recordingContext === 'coach' ? elements.coachPitchCanvas : elements.pitchCanvas;
      
      liveTranscript.textContent = '';
      
      // Update UI classes
      recordBtn.parentElement.classList.add('recording');
      recordBtn.setAttribute('aria-label', 'Recording in progress');
      recordBtn.title = 'Recording in progress';
      
      elements.statusBadge.classList.add('recording');
      elements.statusBadge.classList.remove('paused');
      elements.statusText.textContent = 'Recording';

      if (elements.recordActionSubtext) {
        elements.recordActionSubtext.textContent = '🎤 Recording... • Tap to Pause';
      }
      
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      
      if (state.recordingContext === 'coach') {
        elements.btnPracticePrompt.innerHTML = `
          <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M6 6h12v12H6z"/></svg>
          Stop Practice
        `;
        elements.btnPracticePrompt.style.background = 'linear-gradient(135deg, var(--red), #b91c1c)';
        elements.btnPracticePrompt.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.4)';
      }
      
      // Set lock/unlock settings
      elements.settingsGear.disabled = true;

      // Start Audio Context & Stream
      await audioPipeline.start(vCanvas, pCanvas);
      
      // Start browser native Speech Recognition
      speechRecognition.reset();
      speechRecognition.start();
      
    } catch (err) {
      console.error(err);
      alert('Could not access microphone. Please verify browser permissions.');
      resetRecordingUI();
    }
  } else {
    // If clicking record while recording, do nothing (use Finish)
    finishRecording();
  }
}

function togglePause() {
  if (!state.isRecording) return;
  
  const pauseBtn = state.recordingContext === 'coach' ? elements.coachPauseBtn : elements.pauseBtn;
  
  if (!state.isPaused) {
    // Pause
    state.isPaused = true;
    audioPipeline.pause();
    speechRecognition.stop();
    
    elements.statusBadge.classList.remove('recording');
    elements.statusBadge.classList.add('paused');
    elements.statusText.textContent = 'Paused';
    pauseBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      Resume
    `;
    
    if (elements.recordActionSubtext) {
      elements.recordActionSubtext.textContent = '⏸ Paused • Tap to Resume';
    }
  } else {
    // Resume
    state.isPaused = false;
    audioPipeline.resume();
    speechRecognition.start();
    
    elements.statusBadge.classList.add('recording');
    elements.statusBadge.classList.remove('paused');
    elements.statusText.textContent = 'Recording';
    pauseBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      Pause
    `;
    
    if (elements.recordActionSubtext) {
      elements.recordActionSubtext.textContent = '🎤 Recording... • Tap to Pause';
    }
  }
}

async function finishRecording() {
  if (!state.isRecording) return;
  
  elements.statusText.textContent = 'Stopping...';
  if (elements.recordActionSubtext) {
    elements.recordActionSubtext.textContent = '⚡ transcribing audio...';
  }
  
  // Stop recognition
  const localTranscript = speechRecognition.stop();
  if (!state.currentLiveTranscript) {
    state.currentLiveTranscript = localTranscript;
  }
  
  // Stop audio pipeline
  const pipelineResult = await audioPipeline.stop();
  
  state.currentSession = {
    ...pipelineResult,
    localTranscript: state.currentLiveTranscript || 'No transcript available.'
  };

  // Open Name Modal
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  elements.recordingNameInput.value = `Session Run — ${timeStr}`;
  elements.nameModal.classList.add('active');
  
  resetRecordingUI();
}

function resetRecordingUI() {
  state.isRecording = false;
  state.isPaused = false;
  
  // Reset Dashboard
  elements.recordBtn.parentElement.classList.remove('recording');
  elements.recordBtn.setAttribute('aria-label', 'Start Recording');
  elements.recordBtn.title = 'Start Recording';
  elements.pauseBtn.disabled = true;
  elements.stopBtn.disabled = true;
  elements.pauseBtn.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
    Pause
  `;
  elements.timerDisplay.textContent = '00:00.0';
  
  // Reset Coach
  elements.coachRecordBtn.parentElement.classList.remove('recording');
  elements.coachRecordBtn.setAttribute('aria-label', 'Start Recording');
  elements.coachRecordBtn.title = 'Start Recording';
  elements.coachPauseBtn.disabled = true;
  elements.coachStopBtn.disabled = true;
  elements.coachPauseBtn.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
    Pause
  `;
  elements.coachTimerDisplay.textContent = '00:00.0';
  
  // Reset Start/Stop Practice button
  elements.btnPracticePrompt.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2zm-2 14.5v-9l6 4.5z"/></svg>
    Start Practice
  `;
  elements.btnPracticePrompt.style.background = '';
  elements.btnPracticePrompt.style.boxShadow = '';
  
  // Reset Global Status
  elements.statusBadge.classList.remove('recording', 'paused');
  elements.statusText.textContent = 'Mic Ready';
  elements.settingsGear.disabled = false;

  // Reset Telemetry & Metrics UI
  if (elements.recordActionSubtext) {
    elements.recordActionSubtext.textContent = 'Ready to Speak • Tap to Start';
  }
  
  document.querySelectorAll('.live-vol-fill').forEach(fill => fill.style.width = '0%');
  document.querySelectorAll('.live-pitch-indicator').forEach(ind => ind.style.left = '50%');
  
  const volTextDashboard = document.getElementById('live-vol-text');
  const volTextCoach = document.getElementById('coach-live-vol-text');
  if (volTextDashboard) volTextDashboard.textContent = '-- dB';
  if (volTextCoach) volTextCoach.textContent = '-- dB';
  
  const pitchTextDashboard = document.getElementById('live-pitch-text');
  const pitchTextCoach = document.getElementById('coach-live-pitch-text');
  if (pitchTextDashboard) pitchTextDashboard.textContent = '-- Hz';
  if (pitchTextCoach) pitchTextCoach.textContent = '-- Hz';
  
  const registerDashboard = document.getElementById('live-register-val');
  const registerCoach = document.getElementById('coach-live-register-val');
  if (registerDashboard) registerDashboard.textContent = '--';
  if (registerCoach) registerCoach.textContent = '--';
  
  document.querySelectorAll('.live-wpm-val').forEach(el => el.textContent = '--');
  document.querySelectorAll('.live-fillers-val').forEach(el => el.textContent = '--');
  document.querySelectorAll('.live-clarity-val').forEach(el => el.textContent = '--');
}

// Save recording to IndexedDB & trigger transcription if needed
async function saveSession() {
  const customName = elements.recordingNameInput.value.trim() || 'Untitled Session';
  elements.nameModal.classList.remove('active');
  
  if (!state.currentSession) return;
  
  let finalTranscript = state.currentSession.localTranscript;
  
  // Check if Gemini Enhanced mode is toggled
  if (state.settings.geminiMode && state.settings.apiKey) {
    elements.spinnerStatus.textContent = 'Transcribing with Gemini 2.5 Flash...';
    elements.apiSpinnerOverlay.classList.add('active');
    
    try {
      const geminiTranscript = await speechRecognition.transcribeWithGemini(
        state.currentSession.audioBlob,
        state.settings.apiKey
      );
      if (geminiTranscript) {
        finalTranscript = geminiTranscript;
      }
    } catch (err) {
      console.error('Gemini enhanced transcription failed, falling back to local Speech API:', err);
      // Let the user know but fallback gracefully
      alert('Gemini transcription failed due to an API error. Falling back to local Speech Recognition.');
    } finally {
      elements.apiSpinnerOverlay.classList.remove('active');
    }
  }

  // Calculate word count
  const wordCount = finalTranscript.split(/\s+/).filter(w => w.length > 0).length;

  // Calculate practice match details if coaching mode is active
  let accuracy = null;
  let practicePrompt = null;
  if (state.isCoachingPractice && state.activePrompt) {
    const diffResult = alignSpeech(state.activePrompt.prompt, finalTranscript);
    accuracy = diffResult.accuracy;
    practicePrompt = state.activePrompt.prompt;
  }

  const recordingRecord = {
    id: Date.now(),
    name: customName,
    timestamp: new Date().toLocaleString(),
    duration: state.currentSession.duration,
    wpm: 0, // Will be calculated on save/render
    avgPitch: state.currentSession.avgPitch,
    pitchVariance: state.currentSession.pitchVariance,
    pauseCount: state.currentSession.pauseCount,
    transcript: finalTranscript,
    audioBlob: state.currentSession.audioBlob,
    accuracy,
    practicePrompt
  };

  // Run initial evaluation to set WPM correct
  const evalResult = evaluateSpeech(
    recordingRecord.duration,
    wordCount,
    recordingRecord.avgPitch,
    recordingRecord.pitchVariance,
    recordingRecord.pauseCount
  );
  
  recordingRecord.wpm = evalResult.wpm;

  // Save to IndexedDB
  try {
    await saveRecording(recordingRecord);
    await refreshHistoryList();
    
    // Load this report in View 3
    loadReport(recordingRecord);
    
    // Check if this was a practice prompt session
    if (state.isCoachingPractice && state.activePrompt) {
      elements.coachRecorderContainer.style.display = 'none';
      await evaluatePracticeMatch(recordingRecord, state.activePrompt);
    } else {
      // Regular session: Go straight to Report View
      switchView('speech-report');
    }
    
    // Auto inspect complex word in the Dashboard Syllable Inspector
    autoInspectComplexWord(finalTranscript, 'dashboard');
  } catch (err) {
    console.error('Error saving recording to DB:', err);
    alert('Failed to save recording locally.');
  }
  
  state.currentSession = null;
  state.isCoachingPractice = false;
}

// Evaluate Speaking Prompt Speech Coach Practice
async function evaluatePracticeMatch(recording, prompt) {
  // Clear previous
  elements.diffResults.innerHTML = '';
  elements.accuracyScore.textContent = '--%';
  elements.coachAdvice.innerHTML = '<div style="font-size: 13px; font-style: italic; color: var(--text-secondary);">Evaluating speaking details...</div>';
  
  // Calculate Diff HTML and Accuracy Score
  const diffResult = alignSpeech(prompt.prompt, recording.transcript);
  
  elements.diffResults.innerHTML = diffResult.html;
  elements.accuracyScore.textContent = `${Math.round(diffResult.accuracy)}%`;
  
  // Compile assessment
  const stats = evaluateSpeech(
    recording.duration,
    recording.transcript.split(/\s+/).filter(w => w.length > 0).length,
    recording.avgPitch,
    recording.pitchVariance,
    recording.pauseCount
  );
  
  // Render local fallback suggestions
  let adviceHTML = `
    <div style="margin-bottom: 14px;">
      <h4 style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">Alignment Summary</h4>
      <p style="font-size: 13px; color: var(--text-secondary);">Your read accuracy was <strong>${diffResult.accuracy.toFixed(0)}%</strong>. Check the color-coded feedback to see correct, omitted, or substituted words. Click any word to hear its native pronunciation.</p>
    </div>
    <div style="margin-bottom: 14px; border-left: 2px solid var(--purple); padding-left: 10px;">
      <h4 style="font-size: 13px; font-weight: 600; color: var(--purple); margin-bottom: 4px;">Speaking Cadence (${stats.wpm} WPM)</h4>
      <p style="font-size: 13px; color: var(--text-secondary);">${stats.paceAdvice}</p>
    </div>
    <div style="margin-bottom: 14px; border-left: 2px solid var(--cyan); padding-left: 10px;">
      <h4 style="font-size: 13px; font-weight: 600; color: var(--cyan); margin-bottom: 4px;">Vocal Pitch (${recording.avgPitch.toFixed(0)} Hz)</h4>
      <p style="font-size: 13px; color: var(--text-secondary);">${stats.registerAdvice}</p>
    </div>
  `;

  if (recording.pauseCount > 0) {
    adviceHTML += `
      <div style="border-left: 2px solid var(--yellow); padding-left: 10px;">
        <h4 style="font-size: 13px; font-weight: 600; color: var(--yellow); margin-bottom: 4px;">Phrasing Breakpoints</h4>
        <p style="font-size: 13px; color: var(--text-secondary);">${stats.pauseAdvice}</p>
      </div>
    `;
  }
  
  elements.coachAdvice.innerHTML = adviceHTML;

  // If Gemini mode is active, get enhanced personalized AI insights
  if (state.settings.geminiMode && state.settings.apiKey) {
    elements.coachAdvice.innerHTML += `
      <div id="gemini-loading-indicator" style="display: flex; align-items: center; gap: 8px; margin-top: 14px; border-top: 1px dashed var(--panel-border); padding-top: 14px;">
        <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
        <span style="font-size: 12px; color: var(--cyan);">Fetching Gemini Speech Coach Insights...</span>
      </div>
    `;
    
    try {
      const fullStats = {
        wpm: stats.wpm,
        avgPitch: recording.avgPitch,
        pitchVariance: recording.pitchVariance,
        pauseCount: recording.pauseCount,
        inflectionLabel: stats.inflectionLabel,
        registerLabel: stats.registerLabel,
        pauseLabel: stats.pauseLabel
      };
      
      const geminiAdvice = await speechRecognition.getPersonalCoaching(
        recording.transcript,
        prompt.prompt,
        fullStats,
        state.settings.apiKey
      );
      
      // Remove spinner and append Gemini feedback
      const loader = document.getElementById('gemini-loading-indicator');
      if (loader) loader.remove();
      
      elements.coachAdvice.innerHTML += `
        <div style="margin-top: 14px; border-top: 1px dashed var(--panel-border); padding-top: 14px;">
          <h4 style="font-size: 13px; font-weight: 600; color: var(--cyan); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/></svg>
            AI Personal Suggestions
          </h4>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
            ${geminiAdvice}
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Failed to get Gemini coaching insights:', err);
      const loader = document.getElementById('gemini-loading-indicator');
      if (loader) loader.remove();
    }
  }
  
  // Auto inspect complex word in Speech Coach panel
  autoInspectComplexWord(recording.transcript, 'coach');

  // Route back to Speech Coach View so the user sees results immediately
  switchView('speech-coach');
}

// Prompts management
function loadPrompt(index) {
  state.currentPromptIndex = index;
  const p = PRACTICE_PROMPTS[index];
  state.activePrompt = p;
  
  elements.promptCategory.textContent = p.category;
  elements.promptTips.textContent = p.tips;
  
  // Render teleprompter word spans
  renderTeleprompter(p.prompt);
}

function nextPrompt() {
  const nextIndex = (state.currentPromptIndex + 1) % PRACTICE_PROMPTS.length;
  loadPrompt(nextIndex);
  
  // Hide inline recorder on change
  elements.coachRecorderContainer.style.display = 'none';
  
  // Clear Coach practice results when loading new prompts
  elements.diffResults.innerHTML = '';
  elements.accuracyScore.textContent = '--%';
  elements.coachAdvice.innerHTML = '';
}

function startPracticePrompt() {
  if (state.isRecording && state.recordingContext === 'coach') {
    finishRecording();
    return;
  }
  
  // If Custom Text panel is visible, check if we need to load text first
  if (elements.customLyricsContainer && elements.customLyricsContainer.style.display === 'flex') {
    const text = elements.customLyricsInput.value.trim();
    if (!text) {
      alert('Please paste some custom text first before starting practice.');
      return;
    }
    
    // Automatically load the custom text to set it as active prompt!
    state.activePrompt = {
      id: 999,
      category: 'Custom Prompt / Lyrics',
      prompt: text,
      tips: 'Review your pasted custom text. Speak clearly and follow your own pacing!'
    };
    elements.promptCategory.textContent = state.activePrompt.category;
    elements.promptTips.textContent = state.activePrompt.tips;
    renderTeleprompter(text);
    elements.diffResults.innerHTML = '';
    elements.accuracyScore.textContent = '--%';
    elements.coachAdvice.innerHTML = '';
    
    // Hide input container and show teleprompter
    elements.customLyricsContainer.style.display = 'none';
    elements.coachTeleprompterBox.style.display = 'block';
  }

  if (!state.activePrompt) {
    alert('Please select a prompt or load custom text before starting practice.');
    return;
  }
  
  // Flag practice mode and context
  state.isCoachingPractice = true;
  state.recordingContext = 'coach';
  
  // Reveal compact recorder
  elements.coachRecorderContainer.style.display = 'flex';
  
  // Clear previous live transcription text
  elements.coachLiveTranscript.textContent = '';
  
  // Resize canvases
  const vParent = elements.coachVisualizerCanvas.parentElement;
  const pParent = elements.coachPitchCanvas.parentElement;
  elements.coachVisualizerCanvas.width = vParent.clientWidth;
  elements.coachPitchCanvas.width = pParent.clientWidth;
  
  // Start recording immediately
  toggleRecording();
}

// History panel rendering
async function refreshHistoryList() {
  const recordings = await getAllRecordings();
  
  // Sync count badge
  elements.tracksBadge.textContent = recordings.length;
  
  // Clear container (keep empty state hidden or visible)
  elements.historyList.querySelectorAll('.recording-card').forEach(c => c.remove());
  
  if (recordings.length === 0) {
    elements.historyEmpty.style.display = 'flex';
    return;
  }
  
  elements.historyEmpty.style.display = 'none';

  // Build tracks
  recordings.forEach(rec => {
    const card = document.createElement('div');
    card.className = 'recording-card';
    card.setAttribute('data-id', rec.id);
    
    if (state.selectedRecording && state.selectedRecording.id === rec.id) {
      card.classList.add('active');
    }

    const durationMin = Math.floor(rec.duration / 60);
    const durationSec = Math.round(rec.duration % 60);
    const durationStr = `${durationMin}:${durationSec.toString().padStart(2, '0')}`;

    card.innerHTML = `
      <div class="card-title-row">
        <h4 class="card-title" title="${rec.name}">${rec.name}</h4>
      </div>
      <div class="card-date">${rec.timestamp}</div>
      <div class="card-stats-row">
        <div class="card-stat">Dur: <span>${durationStr}</span></div>
        <div class="card-stat">Pace: <span>${rec.wpm} WPM</span></div>
        <div class="card-stat">Pitch: <span>${rec.avgPitch > 0 ? rec.avgPitch.toFixed(0) + ' Hz' : '--'}</span></div>
      </div>
      <div class="card-actions">
        <button class="card-btn play-audio-btn" title="Listen Audio">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Play
        </button>
        <button class="card-btn view-report-btn">Report</button>
        <button class="card-btn delete-btn" title="Delete Recording" aria-label="Delete Recording">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      <div class="card-player-container" style="display: none;"></div>
    `;

    // Event Bindings
    const playBtn = card.querySelector('.play-audio-btn');
    const reportBtn = card.querySelector('.view-report-btn');
    const deleteBtn = card.querySelector('.delete-btn');
    const playerContainer = card.querySelector('.card-player-container');

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAudioPlay(rec, playerContainer, playBtn);
    });

    reportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadReport(rec);
      switchView('speech-report');
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Are you sure you want to delete "${rec.name}"?`)) {
        await deleteRecording(rec.id);
        
        // If we deleted the active reports, clear
        if (state.selectedRecording && state.selectedRecording.id === rec.id) {
          state.selectedRecording = null;
          clearReportView();
        }
        
        await refreshHistoryList();
      }
    });

    // Clicking the card highlights it and opens report
    card.addEventListener('click', () => {
      loadReport(rec);
      // Remove other active
      elements.historyList.querySelectorAll('.recording-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });

    elements.historyList.appendChild(card);
  });
}

// Mini HTML5 audio player management
let activeAudioPlayer = null;
let activePlayBtn = null;
let activeObjectUrl = null;

function toggleAudioPlay(recording, container, playBtn) {
  // If clicking on already playing session
  if (activeAudioPlayer && activePlayBtn === playBtn) {
    if (!activeAudioPlayer.paused) {
      activeAudioPlayer.pause();
      playBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Play
      `;
    } else {
      activeAudioPlayer.play();
      playBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        Pause
      `;
    }
    return;
  }

  // Clear previous player
  stopAndClearActiveAudio();

  // Show player wrapper
  container.style.display = 'block';
  
  // Create object URL
  activeObjectUrl = URL.createObjectURL(recording.audioBlob);
  
  const audio = document.createElement('audio');
  audio.className = 'card-audio-player';
  audio.controls = true;
  audio.src = activeObjectUrl;
  
  container.appendChild(audio);
  
  activeAudioPlayer = audio;
  activePlayBtn = playBtn;
  
  // Update button state
  playBtn.innerHTML = `
    <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
    Pause
  `;
  
  audio.play();

  // Reset when audio finishes
  audio.onended = () => {
    stopAndClearActiveAudio();
  };
}

function stopAndClearActiveAudio() {
  if (activeAudioPlayer) {
    activeAudioPlayer.pause();
    const parent = activeAudioPlayer.parentElement;
    if (parent) {
      parent.innerHTML = '';
      parent.style.display = 'none';
    }
    activeAudioPlayer = null;
  }
  if (activePlayBtn) {
    activePlayBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      Play
    `;
    activePlayBtn = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

// Clear all Report view fields
function clearReportView() {
  elements.reportDuration.textContent = '--';
  elements.reportWpm.textContent = '--';
  elements.reportWpmLabel.textContent = 'WPM';
  elements.reportAvgPitch.textContent = '--';
  elements.reportPitchVariance.textContent = '--';
  elements.reportPauses.textContent = '--';
  elements.reportRegisterBadge.textContent = 'No Voice';
  elements.pitchPointer.style.left = '50%';
  
  elements.evalPaceBadge.textContent = 'Pending';
  elements.evalPaceDesc.textContent = 'No recording loaded. Record or select a track to run assessments.';
  
  elements.evalInflectionBadge.textContent = 'Pending';
  elements.evalInflectionDesc.textContent = 'No recording loaded.';
  
  elements.evalRegisterBadgeText.textContent = 'Pending';
  elements.evalRegisterDesc.textContent = 'No recording loaded.';
  
  elements.evalPausesBadge.textContent = 'Pending';
  elements.evalPausesDesc.textContent = 'No recording loaded.';
  
  elements.reportTranscriptText.value = '';
}

// Load a recording data into View 3 (Speech Report)
function loadReport(recording) {
  state.selectedRecording = recording;
  
  // Highlight card in sidebar
  elements.historyList.querySelectorAll('.recording-card').forEach(c => {
    c.classList.toggle('active', parseInt(c.getAttribute('data-id')) === recording.id);
  });

  // Calculate statistical metric summaries
  const wordCount = recording.transcript.split(/\s+/).filter(w => w.length > 0).length;
  
  const stats = evaluateSpeech(
    recording.duration,
    wordCount,
    recording.avgPitch,
    recording.pitchVariance,
    recording.pauseCount
  );

  // Set metric fields
  elements.reportDuration.textContent = recording.duration.toFixed(1);
  elements.reportWpm.textContent = stats.wpm;
  elements.reportWpmLabel.textContent = `${stats.paceLabel}`;
  elements.reportAvgPitch.textContent = recording.avgPitch > 0 ? recording.avgPitch.toFixed(0) : '--';
  elements.reportPitchVariance.textContent = recording.pitchVariance > 0 ? recording.pitchVariance.toFixed(1) : '--';
  elements.reportPauses.textContent = recording.pauseCount;

  // Vocal Register Badge
  elements.reportRegisterBadge.textContent = stats.registerLabel;

  // Gauge Position pointer
  // 70 Hz to 450 Hz
  const minFreq = 70;
  const maxFreq = 450;
  let pct = 50; // default middle
  if (recording.avgPitch > 0) {
    pct = ((recording.avgPitch - minFreq) / (maxFreq - minFreq)) * 100;
    pct = Math.max(0, Math.min(100, pct)); // clamp
  }
  elements.pitchPointer.style.left = `${pct}%`;

  // Delivery Assessment prose
  elements.evalPaceBadge.textContent = stats.paceLabel;
  elements.evalPaceDesc.textContent = stats.paceAdvice;

  elements.evalInflectionBadge.textContent = stats.inflectionLabel;
  elements.evalInflectionDesc.textContent = stats.inflectionAdvice;

  elements.evalRegisterBadgeText.textContent = stats.registerLabel;
  elements.evalRegisterDesc.textContent = stats.registerAdvice;

  elements.evalPausesBadge.textContent = stats.pauseLabel;
  elements.evalPausesDesc.textContent = stats.pauseAdvice;

  // Transcript Box
  if (!recording.transcript || recording.transcript === 'No transcript available.' || recording.transcript.trim() === '') {
    elements.reportTranscriptText.value = 'No transcript available for this session. (Usually caused by iOS Safari microphone restrictions during visualizer streaming).\n\n👉 Click the "⚡ Transcribe with Gemini" button below to transcribe the saved audio blob directly from IndexedDB using Google Gemini!';
  } else {
    elements.reportTranscriptText.value = recording.transcript;
  }

  // Practice Accuracy Badge Card
  if (recording.accuracy !== null && recording.accuracy !== undefined) {
    elements.reportAccuracyCard.style.display = 'block';
    elements.reportAccuracy.textContent = `${Math.round(recording.accuracy)}%`;
  } else {
    elements.reportAccuracyCard.style.display = 'none';
  }

  // Toggle and load the Report Accuracy panel
  if (recording.practicePrompt && recording.transcript && recording.transcript !== 'No transcript available.' && recording.transcript.trim() !== '') {
    if (elements.reportAccuracyPanel && elements.reportDiffResults && elements.reportAccuracyScore) {
      elements.reportAccuracyPanel.style.display = 'block';
      const diffResult = alignSpeech(recording.practicePrompt, recording.transcript);
      elements.reportDiffResults.innerHTML = diffResult.html;
      elements.reportAccuracyScore.textContent = `${Math.round(diffResult.accuracy)}%`;
      
      // Reset report syllable content on load
      if (elements.reportSyllableInspectorContent) {
        elements.reportSyllableInspectorContent.innerHTML = `
          <p style="font-style: italic; margin: 0; color: var(--text-secondary);">Click any word in the accuracy comparison diff above to inspect its syllables, phonetic guide, and word stress accent.</p>
        `;
      }
    }
  } else {
    if (elements.reportAccuracyPanel) {
      elements.reportAccuracyPanel.style.display = 'none';
    }
  }
}

// Copy Transcript to clipboard
function copyTranscriptText() {
  const text = elements.reportTranscriptText.value;
  if (!text) return;
  
  navigator.clipboard.writeText(text)
    .then(() => {
      alert('Transcript copied to clipboard!');
    })
    .catch(err => {
      console.error('Failed to copy text:', err);
    });
}

// Print / Save PDF
function printReportPDF() {
  if (!state.selectedRecording) {
    alert('Please select a recording to print its report.');
    return;
  }
  window.print();
}

// Email report
function emailReport() {
  if (!state.selectedRecording) {
    alert('No recording loaded to email.');
    return;
  }
  
  const rec = state.selectedRecording;
  const wordCount = rec.transcript.split(/\s+/).filter(w => w.length > 0).length;
  const stats = evaluateSpeech(rec.duration, wordCount, rec.avgPitch, rec.pitchVariance, rec.pauseCount);
  
  const subject = encodeURIComponent(`VoxLyze Speech Delivery Report: ${rec.name}`);
  const body = encodeURIComponent(
    `VoxLyze Speech Report\n` +
    `-----------------------------------------\n` +
    `Session: ${rec.name}\n` +
    `Recorded: ${rec.timestamp}\n` +
    `Duration: ${rec.duration.toFixed(1)} seconds\n` +
    `Speaking Pace: ${stats.wpm} WPM (${stats.paceLabel})\n` +
    `Average Vocal Pitch: ${rec.avgPitch.toFixed(0)} Hz (${stats.registerLabel})\n` +
    `Inflection Cadence: ${rec.pitchVariance.toFixed(1)} Hz (${stats.inflectionLabel})\n` +
    `Silent Pauses Count: ${rec.pauseCount} (${stats.pauseLabel})\n\n` +
    `Assessment Feedback:\n` +
    `- Pace: ${stats.paceAdvice}\n` +
    `- Register: ${stats.registerAdvice}\n` +
    `- Inflection: ${stats.inflectionAdvice}\n` +
    `- Phrasing: ${stats.pauseAdvice}\n\n` +
    `Full Speech Transcript:\n` +
    `"${rec.transcript}"\n\n` +
    `Generated by VoxLyze Voice Analyzer.`
  );
  
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

// Download Audio Blob (.webm)
function downloadAudioWebM() {
  if (!state.selectedRecording) {
    alert('No audio file loaded for download.');
    return;
  }
  
  const rec = state.selectedRecording;
  const url = URL.createObjectURL(rec.audioBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  
  // Format file name
  const cleanName = rec.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download = `voxlyze_audio_${cleanName}_${rec.id}.webm`;
  
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Render teleprompter word spans
function renderTeleprompter(text) {
  const container = document.getElementById('coach-teleprompter-box');
  if (!container) return;

  container.innerHTML = '';
  
  const cleanWordLocal = (w) => w.toLowerCase().replace(/[\.,\?!;:"'\(\)\-—]/g, '').trim();

  const words = text.split(/\s+/).filter(w => w.length > 0);
  words.forEach((word, index) => {
    const span = document.createElement('span');
    span.className = 'tele-word';
    span.setAttribute('data-index', index);
    span.setAttribute('data-clean', cleanWordLocal(word));
    span.textContent = word + ' ';
    span.style.marginRight = '6px';
    span.style.display = 'inline-block';
    container.appendChild(span);
  });
  
  container.scrollTop = 0;
}

// Highlight spoken words and scroll teleprompter automatically
function updateTeleprompter(liveText) {
  const container = document.getElementById('coach-teleprompter-box');
  if (!container) return;

  const cleanSpokenWords = liveText.toLowerCase()
    .replace(/[\.,\?!;:"'\(\)\-—]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0);

  const wordEls = container.querySelectorAll('.tele-word');
  if (wordEls.length === 0) return;

  let spokenIndex = 0;
  let lastMatchedIndex = -1;

  for (let i = 0; i < wordEls.length; i++) {
    const el = wordEls[i];
    const cleanExpected = el.getAttribute('data-clean');

    let matched = false;
    for (let s = spokenIndex; s < cleanSpokenWords.length; s++) {
      if (cleanSpokenWords[s] === cleanExpected) {
        spokenIndex = s + 1;
        matched = true;
        break;
      }
    }

    if (matched) {
      el.classList.add('spoken');
      el.classList.remove('current');
      lastMatchedIndex = i;
    } else {
      el.classList.remove('spoken', 'current');
    }
  }

  const currentWordIndex = lastMatchedIndex + 1;
  if (currentWordIndex < wordEls.length) {
    const currentEl = wordEls[currentWordIndex];
    currentEl.classList.add('current');

    // Smooth scroll inside the container to center the active word
    container.scrollTop = currentEl.offsetTop - container.offsetTop - (container.clientHeight / 2) + (currentEl.clientHeight / 2);
  }
}

// -------------------------------------------------------------
// PREMIUM FEATURES: TREND ANALYTICS & PITCH WARM-UP GAME
// -------------------------------------------------------------

// Draw double line chart (Speaking Pace & Accuracy) on #analytics-canvas
async function drawAnalyticsChart() {
  const canvas = elements.analyticsCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Fetch recordings
  const recordings = await getAllRecordings();
  if (recordings.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Record and save some sessions to view trend analytics.', width / 2, height / 2);
    return;
  }
  
  // Chronological order (oldest first)
  const data = recordings.slice().reverse();
  
  // Margins
  const paddingLeft = 55;
  const paddingRight = 55;
  const paddingTop = 25;
  const paddingBottom = 35;
  const graphWidth = width - paddingLeft - paddingRight;
  const graphHeight = height - paddingTop - paddingBottom;
  
  // Compute Y-Scales
  const maxWpm = Math.max(160, ...data.map(r => r.wpm || 0));
  const minWpm = 0;
  const maxAcc = 100;
  const minAcc = 0;
  
  // Coordinates mapping
  const getX = (index) => {
    if (data.length <= 1) return paddingLeft + graphWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * graphWidth;
  };
  
  const getWpmY = (wpmVal) => {
    const ratio = (wpmVal - minWpm) / (maxWpm - minWpm);
    return paddingTop + graphHeight - ratio * graphHeight;
  };
  
  const getAccY = (accVal) => {
    const ratio = (accVal - minAcc) / (maxAcc - minAcc);
    return paddingTop + graphHeight - ratio * graphHeight;
  };
  
  // 1. Draw horizontal grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  
  const divisions = 4;
  for (let d = 0; d <= divisions; d++) {
    const ratio = d / divisions;
    const y = paddingTop + graphHeight - ratio * graphHeight;
    
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
    
    // Left axis (WPM)
    const wpmVal = minWpm + ratio * (maxWpm - minWpm);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.7)';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(wpmVal).toString(), paddingLeft - 8, y);
    
    // Right axis (Accuracy)
    const accVal = minAcc + ratio * (maxAcc - minAcc);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(accVal)}%`, width - paddingRight + 8, y);
  }
  
  // 2. Plot WPM Line (Neon Cyan)
  ctx.beginPath();
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 6;
  ctx.shadowColor = '#06b6d4';
  
  data.forEach((r, idx) => {
    const x = getX(idx);
    const y = getWpmY(r.wpm || 0);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  
  // 3. Plot Accuracy Line (Neon Purple)
  const accPoints = data
    .map((r, idx) => ({ r, idx }))
    .filter(item => item.r.accuracy !== null && item.r.accuracy !== undefined);
  
  if (accPoints.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#a855f7';
    
    accPoints.forEach((item, idx) => {
      const x = getX(item.idx);
      const y = getAccY(item.r.accuracy);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  
  // 4. Draw Points & Label text overlays
  data.forEach((r, idx) => {
    const x = getX(idx);
    
    // WPM node label
    const wpmY = getWpmY(r.wpm || 0);
    ctx.beginPath();
    ctx.fillStyle = '#06b6d4';
    ctx.arc(x, wpmY, 4, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(r.wpm || 0).toString(), x, wpmY - 8);
    
    // Accuracy node label
    if (r.accuracy !== null && r.accuracy !== undefined) {
      const accY = getAccY(r.accuracy);
      ctx.beginPath();
      ctx.fillStyle = '#a855f7';
      ctx.arc(x, accY, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(r.accuracy)}%`, x, accY + 12);
    }
    
    // Bottom axes labels
    const dateStr = r.timestamp.split(',')[0].trim();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    
    const labelName = r.name.length > 10 ? r.name.substring(0, 8) + '..' : r.name;
    ctx.fillText(labelName, x, height - 18);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillText(dateStr, x, height - 6);
  });
}

// Warm-up game variables
let warmupIsActive = false;
let warmupStream = null;
let warmupAudioContext = null;
let warmupAnalyser = null;
let warmupSource = null;
let warmupAnimationFrame = null;

const warmupHistoryLimit = 200;
let warmupTargetHistory = [];
let warmupUserHistory = [];
let warmupTotalScoreSum = 0;
let warmupTotalScoreCount = 0;

// Toggle Vocal Pitch Warm-up Game
async function toggleWarmupGame() {
  if (warmupIsActive) {
    stopWarmupGame();
  } else {
    await startWarmupGame();
  }
}

// Start warmup mic stream and rendering loops
async function startWarmupGame() {
  if (warmupIsActive) return;
  
  if (state.isRecording) {
    alert('Please stop the current recording before warming up.');
    return;
  }
  
  try {
    warmupStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    warmupAudioContext = new AudioContextClass();
    
    warmupAnalyser = warmupAudioContext.createAnalyser();
    warmupAnalyser.fftSize = 2048;
    
    warmupSource = warmupAudioContext.createMediaStreamSource(warmupStream);
    warmupSource.connect(warmupAnalyser);
    
    warmupIsActive = true;
    elements.warmupStartBtn.textContent = 'Stop Game';
    elements.warmupStartBtn.style.background = 'rgba(239, 68, 68, 0.2)';
    elements.warmupStartBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    elements.warmupStartBtn.style.color = '#ef4444';
    
    warmupTargetHistory = [];
    warmupUserHistory = [];
    warmupTotalScoreSum = 0;
    warmupTotalScoreCount = 0;
    
    elements.warmupScore.textContent = '0%';
    elements.warmupFeedback.textContent = 'Hum to match the wave!';
    elements.warmupFeedback.style.color = 'var(--text-primary)';
    
    runWarmupLoop();
  } catch (err) {
    console.error('Error starting warmup game:', err);
    alert('Could not access microphone for the game. Please ensure mic permissions are granted.');
  }
}

// Stop mic streams and animation loops
function stopWarmupGame() {
  if (!warmupIsActive) return;
  
  warmupIsActive = false;
  
  if (warmupAnimationFrame) {
    cancelAnimationFrame(warmupAnimationFrame);
    warmupAnimationFrame = null;
  }
  
  if (warmupSource) warmupSource.disconnect();
  if (warmupStream) {
    warmupStream.getTracks().forEach(track => track.stop());
    warmupStream = null;
  }
  if (warmupAudioContext) {
    warmupAudioContext.close();
    warmupAudioContext = null;
  }
  
  elements.warmupStartBtn.textContent = 'Start Game';
  elements.warmupStartBtn.style.background = '';
  elements.warmupStartBtn.style.borderColor = '';
  elements.warmupStartBtn.style.color = '';
  
  elements.warmupFeedback.textContent = 'Game stopped.';
  elements.warmupFeedback.style.color = 'var(--text-secondary)';
}

// Reset score and histories
function resetWarmupGame() {
  warmupTargetHistory = [];
  warmupUserHistory = [];
  warmupTotalScoreSum = 0;
  warmupTotalScoreCount = 0;
  
  elements.warmupScore.textContent = '0%';
  elements.warmupFeedback.textContent = warmupIsActive ? 'Hum to match the wave!' : 'Traces reset. Click Start Game.';
  elements.warmupFeedback.style.color = 'var(--text-primary)';
  elements.warmupRegister.textContent = '--';
  elements.warmupFrequency.textContent = 'Target: -- Hz | User: -- Hz';
  
  const canvas = elements.warmupCanvas;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// Game rendering and pitch analysis loop
function runWarmupLoop() {
  if (!warmupIsActive) return;
  warmupAnimationFrame = requestAnimationFrame(runWarmupLoop);
  
  const canvas = elements.warmupCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);
  
  // 1. Get user pitch
  const bufferLength = warmupAnalyser.frequencyBinCount;
  const dataArray = new Float32Array(bufferLength);
  warmupAnalyser.getFloatTimeDomainData(dataArray);
  
  const userPitch = autoCorrelate(dataArray, warmupAudioContext.sampleRate);
  
  // 2. Generate smooth sine sweeps between 110 Hz and 270 Hz
  const time = Date.now() / 1000;
  const targetPitch = 190 + 80 * Math.sin(time * 1.2); 
  
  warmupTargetHistory.push(targetPitch);
  warmupUserHistory.push(userPitch);
  
  if (warmupTargetHistory.length > warmupHistoryLimit) {
    warmupTargetHistory.shift();
    warmupUserHistory.shift();
  }
  
  // 3. Score matching
  let matchPct = 0;
  let feedbackText = 'Hum to match the wave!';
  let feedbackColor = 'var(--text-primary)';
  
  if (userPitch > 0) {
    const diff = Math.abs(userPitch - targetPitch);
    matchPct = Math.max(0, 100 - (diff / 1.5)); 
    
    warmupTotalScoreSum += matchPct;
    warmupTotalScoreCount++;
    
    const runningAvg = warmupTotalScoreSum / warmupTotalScoreCount;
    elements.warmupScore.textContent = `${Math.round(runningAvg)}%`;
    
    if (matchPct > 85) {
      feedbackText = 'Perfect Match! 🌟';
      feedbackColor = '#10b981';
    } else if (matchPct > 65) {
      feedbackText = 'Good! Adjust slightly. 👍';
      feedbackColor = '#06b6d4';
    } else {
      feedbackText = 'Too high or too low. 🔊';
      feedbackColor = '#f59e0b';
    }
    
    let regText = 'Medium';
    if (userPitch < 130) regText = 'Deep (Chest)';
    else if (userPitch > 220) regText = 'High (Head)';
    elements.warmupRegister.textContent = regText;
    
    elements.warmupFrequency.textContent = `Target: ${targetPitch.toFixed(0)} Hz | User: ${userPitch.toFixed(0)} Hz`;
  } else {
    feedbackText = 'Hum or sing into the mic... 🎙️';
    feedbackColor = 'rgba(255, 255, 255, 0.4)';
    elements.warmupFrequency.textContent = `Target: ${targetPitch.toFixed(0)} Hz | User: Silence`;
  }
  
  elements.warmupFeedback.textContent = feedbackText;
  elements.warmupFeedback.style.color = feedbackColor;
  
  // 4. Draw game canvas contents
  const minFreq = 80;
  const maxFreq = 300;
  const getGameY = (freq) => {
    const ratio = (freq - minFreq) / (maxFreq - minFreq);
    return height - 40 - (ratio * (height - 80));
  };
  
  // Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let f = 100; f <= 280; f += 50) {
    const gy = getGameY(f);
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '9px monospace';
    ctx.fillText(`${f}Hz`, 8, gy - 4);
  }
  ctx.stroke();
  
  const xStep = width / warmupHistoryLimit;
  
  // Draw target path
  ctx.beginPath();
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 4;
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#06b6d4';
  
  for (let i = 0; i < warmupTargetHistory.length; i++) {
    const tx = i * xStep;
    const ty = getGameY(warmupTargetHistory[i]);
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  
  // Draw user path
  ctx.beginPath();
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 4;
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#a855f7';
  
  let drawingUser = false;
  for (let i = 0; i < warmupUserHistory.length; i++) {
    const ux = i * xStep;
    const up = warmupUserHistory[i];
    
    if (up > 0) {
      const uy = getGameY(up);
      if (!drawingUser) {
        ctx.beginPath();
        ctx.moveTo(ux, uy);
        drawingUser = true;
      } else {
        ctx.lineTo(ux, uy);
      }
    } else {
      if (drawingUser) {
        ctx.stroke();
        drawingUser = false;
      }
    }
  }
  if (drawingUser) ctx.stroke();
  ctx.shadowBlur = 0;
  
  // Target particle
  const rightX = (warmupTargetHistory.length - 1) * xStep;
  const currentTargetY = getGameY(targetPitch);
  ctx.beginPath();
  ctx.fillStyle = '#22d3ee';
  ctx.arc(rightX, currentTargetY, 8, 0, 2 * Math.PI);
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#06b6d4';
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // User particle
  if (userPitch > 0) {
    const currentUserY = getGameY(userPitch);
    ctx.beginPath();
    ctx.fillStyle = '#c084fc';
    ctx.arc(rightX, currentUserY, 8, 0, 2 * Math.PI);
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#a855f7';
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Connect target and user dots if close
    const dist = Math.abs(currentUserY - currentTargetY);
    if (dist < 40) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(34, 211, 238, ${1 - dist / 40})`;
      ctx.lineWidth = 2;
      ctx.moveTo(rightX, currentUserY);
      ctx.lineTo(rightX, currentTargetY);
      ctx.stroke();
    }
  }
}

// 🗣️ Syllable Inspector Controller & Rendering Logic

// Render clickable span words inside a container (e.g. Dashboard transcription box)
function renderClickableText(container, text) {
  if (!container) return;
  container.innerHTML = '';
  
  if (!text) return;
  
  const cleanWordLocal = (w) => w.toLowerCase().replace(/[\.,\?!;:"'\(\)\-—]/g, '').trim();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  words.forEach(word => {
    const span = document.createElement('span');
    span.className = 'dash-word';
    span.setAttribute('data-word', cleanWordLocal(word));
    span.textContent = word + ' ';
    container.appendChild(span);
  });
}

// Automatically find the most complex word in the transcript and load its syllables
function autoInspectComplexWord(transcript, context = 'dashboard') {
  if (!transcript) return;
  
  const words = transcript.split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z]/g, '')).filter(w => w.length > 3);
  if (words.length === 0) return;
  
  let maxSylWord = '';
  let maxCount = 0;
  
  words.forEach(w => {
    // Check pre-compiled DB count first for speed
    const dbEntry = SYLLABLE_DB[w];
    const count = dbEntry ? dbEntry.syllables.length : countAndSplitSyllables(w).count;
    
    if (count > maxCount) {
      maxCount = count;
      maxSylWord = w;
    }
  });
  
  if (maxSylWord) {
    const targetContentEl = context === 'dashboard' 
      ? elements.dashSyllableInspectorContent 
      : elements.syllableInspectorContent;
      
    // Call the inspector silently (without trigger TTS synthesis or word highlights)
    const cleanWord = maxSylWord;
    
    const handleAutoResult = (data) => {
      renderSyllableInspectorResult(cleanWord, data, targetContentEl);
      // Append a small note indicating it was auto-detected
      targetContentEl.innerHTML += `
        <div style="font-size: 10px; color: var(--cyan); margin-top: 8px; text-align: right; opacity: 0.8; font-style: italic;">
          ✨ Auto-detected complex word
        </div>
      `;
    };
    
    // Quick load
    if (SYLLABLE_DB[cleanWord]) {
      handleAutoResult(SYLLABLE_DB[cleanWord]);
    } else if (state.settings.geminiMode && state.settings.apiKey) {
      speechRecognition.getSyllablesFromGemini(cleanWord, state.settings.apiKey)
        .then(result => handleAutoResult(result))
        .catch(err => {
          const heuristic = countAndSplitSyllables(cleanWord);
          handleAutoResult({
            syllables: heuristic.syllables,
            stressIndex: heuristic.stressIndex,
            ipa: '/--/',
            guide: `Stressed on syllable ${heuristic.stressIndex + 1}. (Offline heuristic).`
          });
        });
    } else {
      const heuristic = countAndSplitSyllables(cleanWord);
      handleAutoResult({
        syllables: heuristic.syllables,
        stressIndex: heuristic.stressIndex,
        ipa: '/--/',
        guide: `Stressed on syllable ${heuristic.stressIndex + 1}. (Offline heuristic).`
      });
    }
  }
}

// Speech Synthesis and Syllable/Stress Analysis Coordinator
async function speakAndInspectWord(word, span, targetContext = 'coach') {
  // 1. Speak word
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  // 2. Visual bounce zoom highlight
  span.style.transition = 'transform 0.15s ease';
  span.style.transform = 'scale(1.12)';
  setTimeout(() => {
    span.style.transform = '';
  }, 150);

  // 3. Clear inspector container & show loading state
  let targetContentEl;
  if (targetContext === 'dashboard') {
    targetContentEl = elements.dashSyllableInspectorContent;
  } else if (targetContext === 'report') {
    targetContentEl = elements.reportSyllableInspectorContent;
  } else {
    targetContentEl = elements.syllableInspectorContent;
  }

  targetContentEl.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
      <span style="font-size: 12px; color: var(--cyan);">Analyzing "${word}" syllables...</span>
    </div>
  `;

  // Scroll to active inspector panel on mobile
  if (window.innerWidth < 768) {
    let panel;
    if (targetContext === 'dashboard') {
      panel = elements.dashSyllableInspectorPanel;
    } else if (targetContext === 'report') {
      panel = elements.reportAccuracyPanel; // Scroll to the accuracy card containing the nested inspector
    } else {
      panel = elements.syllableInspectorPanel;
    }
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  const cleanWord = word.toLowerCase().trim();
  const handleResult = (data) => {
    renderSyllableInspectorResult(cleanWord, data, targetContentEl);
  };

  // 4. Execution check steps
  // A. Check local pre-compiled dictionary
  if (SYLLABLE_DB[cleanWord]) {
    handleResult(SYLLABLE_DB[cleanWord]);
    return;
  }

  // B. Check Gemini mode if active and key is stored
  if (state.settings.geminiMode && state.settings.apiKey) {
    try {
      const result = await speechRecognition.getSyllablesFromGemini(cleanWord, state.settings.apiKey);
      handleResult(result);
      return;
    } catch (err) {
      console.warn('Gemini syllable fetch failed, falling back to heuristic:', err);
    }
  }

  // C. Fallback to client-side heuristic split
  const heuristic = countAndSplitSyllables(cleanWord);
  handleResult({
    syllables: heuristic.syllables,
    stressIndex: heuristic.stressIndex,
    ipa: '/--/',
    guide: `Stressed on syllable ${heuristic.stressIndex + 1}. (Offline heuristic estimation; activate Gemini in Settings for precise phonetics).`
  });
}

// Render formatted Syllables & Word Accents into the panel
function renderSyllableInspectorResult(word, data, containerEl) {
  const syllables = data.syllables || [word];
  const stressIndex = data.stressIndex !== undefined ? data.stressIndex : 0;
  const ipa = data.ipa || '/--/';
  const guide = data.guide || 'Accent stress guide unavailable.';
  const count = syllables.length;

  // Build glowing HTML for syllables
  const syllableHTML = syllables.map((s, idx) => {
    if (idx === stressIndex) {
      // Highlight stressed syllable in uppercase and glowing purple
      return `<strong class="stressed-syl" style="color: var(--purple); font-weight: 700; text-shadow: 0 0 10px rgba(168, 85, 247, 0.7); text-transform: uppercase;">${s}</strong>`;
    }
    return `<span style="opacity: 0.95;">${s}</span>`;
  }).join(' <span style="color: rgba(255,255,255,0.15); margin: 0 4px;">·</span> ');

  containerEl.innerHTML = `
    <div style="background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 8px; padding: 12px; margin-top: 4px; animation: fadeIn 0.3s ease;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
        <h4 style="font-size: 16px; font-weight: 700; color: #fff; margin: 0; text-transform: capitalize;">${word}</h4>
        <span style="font-family: monospace; font-size: 12px; color: var(--cyan); background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.2); padding: 1px 6px; border-radius: 4px;">${ipa}</span>
      </div>
      
      <div style="margin-bottom: 12px;">
        <div style="font-size: 9px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Syllables (${count})</div>
        <div style="font-size: 18px; font-weight: 600; color: var(--text-primary); letter-spacing: 0.5px;">
          ${syllableHTML}
        </div>
      </div>
      
      <div style="border-left: 2px solid var(--purple); padding-left: 10px; margin-top: 10px;">
        <div style="font-size: 9px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Pronunciation Guide</div>
        <p style="font-size: 12px; color: var(--text-primary); margin: 0; line-height: 1.4;">${guide}</p>
      </div>
    </div>
  `;
}

// Run on-demand Gemini transcription on currently selected recording
async function runOnDemandGeminiTranscription() {
  if (!state.selectedRecording) {
    alert('Please select a recording from the sidebar to transcribe.');
    return;
  }
  
  // Check if we have an API key
  if (!state.settings.apiKey) {
    alert('To use Gemini transcription, please provide a valid Google Gemini API Key in Settings first.');
    elements.settingsModal.classList.add('active');
    return;
  }
  
  const recording = state.selectedRecording;
  
  elements.spinnerStatus.textContent = 'Transcribing audio with Gemini 2.5 Flash...';
  elements.apiSpinnerOverlay.classList.add('active');
  
  try {
    const geminiTranscript = await speechRecognition.transcribeWithGemini(
      recording.audioBlob,
      state.settings.apiKey
    );
    
    if (geminiTranscript) {
      recording.transcript = geminiTranscript;
      
      // Calculate word count
      const wordCount = geminiTranscript.split(/\s+/).filter(w => w.length > 0).length;
      
      // If accuracy was previously set (i.e. practice prompt run) or needs to be calculated
      if (recording.practicePrompt) {
        const diffResult = alignSpeech(recording.practicePrompt, geminiTranscript);
        recording.accuracy = diffResult.accuracy;
      }
      
      // Update WPM
      const evalResult = evaluateSpeech(
        recording.duration,
        wordCount,
        recording.avgPitch,
        recording.pitchVariance,
        recording.pauseCount
      );
      recording.wpm = evalResult.wpm;
      
      // Save updated recording record back to IndexedDB
      await saveRecording(recording);
      
      // Refresh the sidebar to update list text
      await refreshHistoryList();
      
      // Reload this updated report in Report View
      loadReport(recording);
      
      alert('Speech transcription successfully generated using Gemini 2.5 Flash!');
    }
  } catch (err) {
    console.error('On-demand Gemini transcription failed:', err);
    alert('Gemini transcription failed: ' + err.message);
  } finally {
    elements.apiSpinnerOverlay.classList.remove('active');
  }
}
