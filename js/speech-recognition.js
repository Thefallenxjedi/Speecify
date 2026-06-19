export class SpeechRecognitionManager {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.onResult = null; // function(text, isFinal)
    this.onError = null; // function(errorEvent)
    
    this.setupRecognition();
  }

  setupRecognition() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognitionClass) {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }

        if (finalText) {
          this.finalTranscript += (this.finalTranscript ? ' ' : '') + finalText;
        }

        this.interimTranscript = interimText;

        if (this.onResult) {
          const displayText = this.finalTranscript + (interimText ? ' ' + interimText : '');
          this.onResult(displayText, interimText === '');
        }
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (this.onError) this.onError(event);
      };

      this.recognition.onend = () => {
        // Auto-restart if we are supposed to be listening
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch (e) {
            console.error('Error restarting speech recognition:', e);
          }
        }
      };
    } else {
      console.warn('SpeechRecognition API is not supported in this browser.');
    }
  }

  start() {
    if (!this.recognition) return;
    this.isListening = true;
    this.interimTranscript = '';
    this.finalTranscript = '';
    
    try {
      this.recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
    }
  }

  stop() {
    this.isListening = false;
    if (!this.recognition) return '';
    
    try {
      this.recognition.stop();
    } catch (e) {
      console.error('Failed to stop speech recognition:', e);
    }
    
    return this.finalTranscript + (this.interimTranscript ? ' ' + this.interimTranscript : '');
  }

  reset() {
    this.finalTranscript = '';
    this.interimTranscript = '';
  }

  // GEMINI AI TRANSCRIPTION METHOD
  async transcribeWithGemini(audioBlob, apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required for enhanced transcription.');
    }

    // 1. Convert audioBlob to Base64
    const base64Audio = await this.blobToBase64(audioBlob);

    // 2. Perform POST request to Gemini 2.5 Flash API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const promptText = "Transcribe the speaking voice in this audio file with high accuracy. Output only the plain transcription text. Do not include any headers, quotation marks, timestamps, annotations, or extra words. If the audio is completely silent or has no speech, output 'No speech detected.'";

    const payload = {
      contents: [
        {
          parts: [
            {
              text: promptText
            },
            {
              inlineData: {
                mimeType: "audio/webm",
                data: base64Audio
              }
            }
          ]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errDetails = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errDetails}`);
    }

    const data = await response.json();
    
    try {
      const text = data.candidates[0].content.parts[0].text;
      return text.trim();
    } catch (err) {
      console.error('Error parsing Gemini response:', data, err);
      throw new Error('Invalid response structure from Gemini API');
    }
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Result is "data:audio/webm;base64,xxxx"
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // GEMINI AI PERSONAL COACHING INSIGHTS METHOD
  async getPersonalCoaching(transcript, expectedPrompt, stats, apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required for AI Coaching.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const promptText = `You are an expert English Speech Coach. Analyze the following practice session:
- Expected Text: "${expectedPrompt}"
- Spoken Transcript: "${transcript}"
- Speaking Pace: ${stats.wpm} WPM
- Vocal Inflection: ${stats.inflectionLabel} (Pitch Variance: ${stats.pitchVariance.toFixed(1)} Hz)
- Vocal Register: ${stats.registerLabel} (Avg Pitch: ${stats.avgPitch.toFixed(0)} Hz)
- Silent Pauses: ${stats.pauseCount} (${stats.pauseLabel})

Provide 3 highly concise, actionable suggestions for improvement in clear, friendly English. Structure your response as a clean HTML bulleted list with bold highlighting (e.g. '<li><strong>Articulation:</strong> Focus on...</li>'). Do not include any markdown syntax, HTML code block wrappers (like \`\`\`html), headers, or extra text. Output ONLY the list items inside a single <ul> block.`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: promptText
            }
          ]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errDetails = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errDetails}`);
    }

    const data = await response.json();
    
    try {
      const text = data.candidates[0].content.parts[0].text;
      // Clean up markdown block ticks if they exist
      return text.replace(/```html/g, '').replace(/```/g, '').trim();
    } catch (err) {
      console.error('Error parsing Gemini response:', data, err);
      throw new Error('Invalid response structure from Gemini API');
    }
  }

  // Fetch Syllable and Pronunciation Details from Gemini for a single word
  async getSyllablesFromGemini(word, apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const promptText = `Analyze the English word: "${word}".
Return a strict JSON object with the following properties:
- syllables: array of string syllables (e.g., ["com", "mu", "ni", "ca", "tion"])
- stressIndex: 0-based index of the primary stressed syllable (e.g., 3)
- ipa: IPA phonetic spelling (e.g., "/kəˌmjuːnɪˈkeɪʃən/")
- guide: a short 1-sentence tip explaining which syllable to stress and how to pronounce it.
Format output as strict raw JSON, do not wrap in markdown or any other characters.`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: promptText
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini API Error (${response.status})`);
    }

    const data = await response.json();
    try {
      const text = data.candidates[0].content.parts[0].text;
      return JSON.parse(text.trim());
    } catch (err) {
      console.error('Error parsing syllables from Gemini:', data, err);
      throw err;
    }
  }
}
