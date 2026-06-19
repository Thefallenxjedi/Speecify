// Autocorrelation algorithm to extract vocal pitch from a time-domain buffer.
export function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const clipThreshold = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < clipThreshold) { r1 = i; break; }
  }
  for (let i = SIZE - 1; i >= SIZE / 2; i--) {
    if (Math.abs(buffer[i]) < clipThreshold) { r2 = i; break; }
  }
  const slice = buffer.slice(r1, r2);
  const len = slice.length;
  if (len < 256) return -1;

  const minSamples = Math.floor(sampleRate / 450);
  const maxSamples = Math.floor(sampleRate / 70);
  let bestOffset = -1;
  let bestCorrelation = -1;
  const correlations = new Float32Array(maxSamples + 1);

  for (let offset = minSamples; offset <= maxSamples; offset++) {
    let correlationSum = 0;
    for (let i = 0; i < len - offset; i++) {
      correlationSum += slice[i] * slice[i + offset];
    }
    correlations[offset] = correlationSum;
  }

  let firstZeroCrossing = minSamples;
  for (let i = 1; i < maxSamples; i++) {
    if (correlations[i] < 0) { firstZeroCrossing = i; break; }
  }
  if (firstZeroCrossing === minSamples) {
    for (let i = 1; i < maxSamples; i++) {
      if (correlations[i] < correlations[i - 1]) { firstZeroCrossing = i; } 
      else { break; }
    }
  }

  let peakVal = -1;
  let peakOffset = -1;
  for (let offset = Math.max(minSamples, firstZeroCrossing); offset <= maxSamples; offset++) {
    if (correlations[offset] > peakVal) {
      peakVal = correlations[offset];
      peakOffset = offset;
    }
  }

  let energy = 0;
  for (let i = 0; i < len; i++) { energy += slice[i] * slice[i]; }

  if (energy > 0 && peakOffset !== -1 && (peakVal / energy) > 0.38) {
    const frequency = sampleRate / peakOffset;
    if (frequency >= 70 && frequency <= 450) { return frequency; }
  }
  return -1;
}

export class AudioPipeline {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    this.source = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    
    // Recording state
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = 0;
    this.elapsedTimeBeforePause = 0;
    this.timerInterval = null;
    
    // Voice metrics tracking
    this.pitchHistory = [];
    this.pitchHistoryLimit = 250;
    this.allPitches = []; // Store positive detected pitches to calculate average/variance
    this.pauseCount = 0;
    this.gainDb = -100;
    
    // Pause detection state
    this.pauseStartTime = null;
    this.pauseRegistered = false;
    
    // Animation frame references
    this.visualizerFrame = null;
    this.pitchFrame = null;

    // Callbacks
    this.onTimeUpdate = null; // function(secondsStr)
    this.onPauseDetected = null; // function(pauseCount)
    this.onGainUpdate = null; // function(dbVal)
    this.onPitchUpdate = null; // function(pitchHz)
  }

  async init(visualizerCanvas, pitchCanvas) {
    this.visualizerCanvas = visualizerCanvas;
    this.pitchCanvas = pitchCanvas;
    this.vCtx = visualizerCanvas.getContext('2d');
    this.pCtx = pitchCanvas.getContext('2d');
  }

  async start(visualizerCanvas, pitchCanvas) {
    if (this.isRecording) return;
    
    if (visualizerCanvas) {
      this.visualizerCanvas = visualizerCanvas;
      this.vCtx = visualizerCanvas.getContext('2d');
    }
    if (pitchCanvas) {
      this.pitchCanvas = pitchCanvas;
      this.pCtx = pitchCanvas.getContext('2d');
    }
    
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass();
      
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      
      // Initialize MediaRecorder
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.start(100); // chunk every 100ms
      
      this.isRecording = true;
      this.isPaused = false;
      this.startTime = Date.now();
      this.elapsedTimeBeforePause = 0;
      this.pitchHistory = [];
      this.allPitches = [];
      this.pauseCount = 0;
      this.pauseStartTime = null;
      this.pauseRegistered = false;
      
      // Start clock timer
      this.timerInterval = setInterval(() => {
        if (!this.isPaused) {
          const elapsed = this.getDuration();
          if (this.onTimeUpdate) {
            this.onTimeUpdate(elapsed);
          }
        }
      }, 200);

      // Start draw loops
      this.drawVisualizer();
      this.drawPitchTimelineLoop();
      
    } catch (err) {
      console.error('Error starting audio recording:', err);
      throw err;
    }
  }

  pause() {
    if (!this.isRecording || this.isPaused) return;
    
    this.isPaused = true;
    this.elapsedTimeBeforePause += (Date.now() - this.startTime) / 1000;
    this.mediaRecorder.pause();
    this.audioContext.suspend();
  }

  resume() {
    if (!this.isRecording || !this.isPaused) return;
    
    this.isPaused = false;
    this.startTime = Date.now();
    this.mediaRecorder.resume();
    this.audioContext.resume();
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.isRecording) {
        resolve(null);
        return;
      }

      this.isRecording = false;
      
      // Clear timers
      clearInterval(this.timerInterval);
      if (this.visualizerFrame) cancelAnimationFrame(this.visualizerFrame);
      if (this.pitchFrame) cancelAnimationFrame(this.pitchFrame);

      // Calculate final duration
      let finalDuration = this.elapsedTimeBeforePause;
      if (!this.isPaused) {
        finalDuration += (Date.now() - this.startTime) / 1000;
      }
      if (finalDuration < 0.5) finalDuration = 0.5; // Avoid division by zero

      // Stop MediaRecorder and resolve when audio chunk compilation is ready
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Stop audio nodes and stream tracks
        if (this.source) this.source.disconnect();
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext) {
          this.audioContext.close();
        }

        // Calculate pitch metrics
        const positivePitches = this.allPitches.filter(p => p > 0);
        let avgPitch = 0;
        let pitchVariance = 0;
        
        if (positivePitches.length > 0) {
          const sum = positivePitches.reduce((a, b) => a + b, 0);
          avgPitch = sum / positivePitches.length;
          
          const sqDiffSum = positivePitches.reduce((acc, val) => acc + Math.pow(val - avgPitch, 2), 0);
          pitchVariance = Math.sqrt(sqDiffSum / positivePitches.length); // standard deviation
        }

        resolve({
          duration: finalDuration,
          avgPitch,
          pitchVariance,
          pauseCount: this.pauseCount,
          audioBlob
        });
      };

      this.mediaRecorder.stop();
    });
  }

  getDuration() {
    if (!this.isRecording) return 0;
    let elapsed = this.elapsedTimeBeforePause;
    if (!this.isPaused) {
      elapsed += (Date.now() - this.startTime) / 1000;
    }
    return elapsed;
  }

  drawVisualizer() {
    if (!this.isRecording) return;
    this.visualizerFrame = requestAnimationFrame(() => this.drawVisualizer());

    const canvas = this.visualizerCanvas;
    const ctx = this.vCtx;
    const width = canvas.width;
    const height = canvas.height;

    // Standard high-performance clear
    ctx.clearRect(0, 0, width, height);

    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArrayTime = new Float32Array(bufferLength);
    const dataArrayFFT = new Uint8Array(bufferLength);

    this.analyser.getFloatTimeDomainData(dataArrayTime);
    this.analyser.getByteFrequencyData(dataArrayFFT);

    // 1. Calculate and update Gain/RMS in real-time
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArrayTime[i] * dataArrayTime[i];
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Convert to dB
    if (rms > 0) {
      this.gainDb = 20 * Math.log10(rms);
    } else {
      this.gainDb = -100;
    }
    
    if (this.onGainUpdate) {
      this.onGainUpdate(this.gainDb);
    }

    // 2. Pause / Silence Detection
    if (!this.isPaused) {
      if (rms < 0.008) {
        if (this.pauseStartTime === null) {
          this.pauseStartTime = Date.now();
        } else {
          const pauseDuration = (Date.now() - this.pauseStartTime) / 1000;
          if (pauseDuration > 0.7 && !this.pauseRegistered) {
            this.pauseCount++;
            this.pauseRegistered = true;
            if (this.onPauseDetected) {
              this.onPauseDetected(this.pauseCount);
            }
          }
        }
      } else {
        this.pauseStartTime = null;
        this.pauseRegistered = false;
      }
    }

    // 3. Render FFT Spectrum (Gradients)
    // Draw only low-to-mid range frequencies to make visualizer aesthetic
    const limitBins = Math.floor(bufferLength * 0.4); // Focus on first ~40% of bins
    const barWidth = (width / limitBins) * 1.5;
    let barHeight;
    let x = 0;

    let fftGrad = ctx.createLinearGradient(0, height, 0, 0);
    fftGrad.addColorStop(0, 'rgba(168, 85, 247, 0.05)'); // Translucent purple at bottom
    fftGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.3)'); // Cyan in middle
    fftGrad.addColorStop(1, 'rgba(6, 182, 212, 0.7)'); // Vibrant cyan at top

    ctx.fillStyle = fftGrad;

    for (let i = 0; i < limitBins; i++) {
      // Normalize bin value (0-255)
      barHeight = (dataArrayFFT[i] / 255) * height * 0.85;
      
      // Draw rounded bars or regular vertical rectangles
      ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
      x += barWidth;
    }

    // 4. Render Oscilloscope wave overlay (Neon Cyan Glow)
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#06b6d4';
    
    // Add glow effect
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#06b6d4';

    const sliceWidth = width / bufferLength;
    let waveX = 0;

    for (let i = 0; i < bufferLength; i++) {
      // dataArrayTime spans [-1.0, 1.0]
      const v = dataArrayTime[i];
      const y = (v * height * 0.45) + (height / 2);

      if (i === 0) {
        ctx.moveTo(waveX, y);
      } else {
        ctx.lineTo(waveX, y);
      }

      waveX += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Reset shadow values for other drawing operations
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // 5. Draw Gain HUD Overlay on visualizer canvas
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '11px monospace';
    const cleanGain = this.gainDb === -100 ? '-Infinity' : this.gainDb.toFixed(1);
    ctx.fillText(`GAIN: ${cleanGain} dB`, 15, 25);
    ctx.fillText(`RMS: ${rms.toFixed(4)}`, 15, 40);
  }

  drawPitchTimelineLoop() {
    if (!this.isRecording) return;
    this.pitchFrame = requestAnimationFrame(() => this.drawPitchTimelineLoop());

    if (!this.analyser || this.isPaused) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArrayTime = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(dataArrayTime);

    // Call autocorrelation algorithm to extract current pitch
    const pitch = autoCorrelate(dataArrayTime, this.audioContext.sampleRate);
    
    if (pitch > 0) {
      this.pitchHistory.push(pitch);
      this.allPitches.push(pitch);
      if (this.onPitchUpdate) {
        this.onPitchUpdate(pitch);
      }
    } else {
      this.pitchHistory.push(-1); // Silent / Undetected
    }

    // Keep history bounded
    if (this.pitchHistory.length > this.pitchHistoryLimit) {
      this.pitchHistory.shift();
    }

    this.renderPitchTimeline();
  }

  renderPitchTimeline() {
    const canvas = this.pitchCanvas;
    const ctx = this.pCtx;
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw reference grids: 100Hz to 400Hz
    const minFreq = 70;
    const maxFreq = 450;

    const getFrequencyY = (freq) => {
      // Linear mapping of frequency to Y axis (higher frequencies at the top, lower at bottom)
      const ratio = (freq - minFreq) / (maxFreq - minFreq);
      return height - (ratio * (height - 40) + 20);
    };

    const refLines = [100, 200, 300, 400];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

    refLines.forEach(freq => {
      const y = getFrequencyY(freq);
      ctx.beginPath();
      ctx.moveTo(60, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${freq} Hz`, 10, y + 3);
    });

    // Draw pitch trajectory
    if (this.pitchHistory.length === 0) return;

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#a855f7'; // Purple line for pitch
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#a855f7';

    // Grid details
    const xStep = (width - 70) / this.pitchHistoryLimit;
    const startX = 70;
    let isDrawing = false;

    for (let i = 0; i < this.pitchHistory.length; i++) {
      const pitchVal = this.pitchHistory[i];
      const cx = startX + (i * xStep);

      if (pitchVal > 0) {
        const cy = getFrequencyY(pitchVal);
        if (!isDrawing) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          isDrawing = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      } else {
        if (isDrawing) {
          ctx.stroke();
          isDrawing = false;
        }
      }
    }

    if (isDrawing) {
      ctx.stroke();
    }

    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Show current pitch overlay
    const lastPitch = this.pitchHistory[this.pitchHistory.length - 1];
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '11px monospace';
    const pitchText = lastPitch > 0 ? `PITCH: ${lastPitch.toFixed(0)} Hz` : 'PITCH: -- Hz';
    ctx.fillText(pitchText, 15, 25);
  }
}
