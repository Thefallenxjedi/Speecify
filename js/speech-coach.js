export const PRACTICE_PROMPTS = [
  {
    id: 1,
    category: 'Job Interview',
    prompt: 'The only way to do great work is to love what you do. If you haven\'t found it yet, keep looking. Don\'t settle.',
    tips: 'Focus on a calm, structured pace. Accentuate key verbs like "great work" and "love" to show passion.'
  },
  {
    id: 2,
    category: 'Public Speaking',
    prompt: 'Hello, thank you all for coming today. I am excited to share our progress and outline our roadmap for the next quarter.',
    tips: 'Ensure your vocal projection is steady. Keep your pauses natural, especially after welcoming the audience.'
  },
  {
    id: 3,
    category: 'Customer Pitch',
    prompt: 'Our solution addresses the core inefficiency in your supply chain, reducing processing times by forty percent while cutting operational costs in half.',
    tips: 'Sound enthusiastic! Build a dynamic inflection when discussing metrics like "forty percent" and "in half".'
  },
  {
    id: 4,
    category: 'Classical Speech',
    prompt: 'To be, or not to be, that is the question: Whether \'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.',
    tips: 'Slightly slow down your speed. Project a deep vocal register and use theatrical pauses for emotional resonance.'
  },
  {
    id: 5,
    category: 'Communication Skill',
    prompt: 'In a professional context, it is crucial to active-listen, summarize back, and respond with clear, concise, and structured sentences.',
    tips: 'Enunciate every word clearly. Maintain an optimal pace of around one hundred and thirty words per minute.'
  }
];

// Helper to strip punctuation and normalize for matching
const cleanWord = (w) => w.toLowerCase().replace(/[\.,\?!;:"'\(\)\-—]/g, '').trim();

export function alignSpeech(expectedText, actualText) {
  if (!expectedText) return { html: '', accuracy: 0 };
  if (!actualText) {
    // Everything is omitted
    const expectedWords = expectedText.split(/\s+/).filter(w => w.length > 0);
    const html = expectedWords.map(w => `<span class="diff-word diff-omitted">${w}</span>`).join(' ');
    return { html, accuracy: 0 };
  }

  const E = expectedText.split(/\s+/).filter(w => w.length > 0).map(w => ({ original: w, clean: cleanWord(w) }));
  const A = actualText.split(/\s+/).filter(w => w.length > 0).map(w => ({ original: w, clean: cleanWord(w) }));
  const n = E.length;
  const m = A.length;

  // dp[i][j] represents edit distance to align E[0..i-1] with A[0..j-1]
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (E[i - 1].clean === A[j - 1].clean) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // Substitution
          dp[i - 1][j] + 1,     // Omission (skip expected)
          dp[i][j - 1] + 1      // Extra (insert actual)
        );
      }
    }
  }

  // Backtracking
  let i = n;
  let j = m;
  const operations = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && E[i - 1].clean === A[j - 1].clean) {
      operations.push({
        type: 'match',
        expected: E[i - 1].original,
        actual: A[j - 1].original
      });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      operations.push({
        type: 'miss',
        expected: E[i - 1].original,
        actual: A[j - 1].original
      });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j] + 1)) {
      operations.push({
        type: 'omitted',
        expected: E[i - 1].original
      });
      i--;
    } else if (j > 0 && (i === 0 || dp[i][j] === dp[i][j - 1] + 1)) {
      operations.push({
        type: 'extra',
        actual: A[j - 1].original
      });
      j--;
    } else {
      // Fallback
      if (i > 0 && j > 0) {
        operations.push({
          type: 'miss',
          expected: E[i - 1].original,
          actual: A[j - 1].original
        });
        i--; j--;
      } else if (i > 0) {
        operations.push({ type: 'omitted', expected: E[i - 1].original });
        i--;
      } else {
        operations.push({ type: 'extra', actual: A[j - 1].original });
        j--;
      }
    }
  }

  operations.reverse();

  let matchCount = 0;
  const htmlArray = operations.map(op => {
    if (op.type === 'match') {
      matchCount++;
      return `<span class="diff-word diff-match">${op.expected}</span>`;
    } else if (op.type === 'omitted') {
      return `<span class="diff-word diff-omitted">${op.expected}</span>`;
    } else if (op.type === 'extra') {
      return `<span class="diff-word diff-extra">${op.actual}</span>`;
    } else {
      // miss / substitution
      return `<span class="diff-word diff-miss">${op.expected} (got: ${op.actual})</span>`;
    }
  });

  const accuracy = n > 0 ? (matchCount / n) * 100 : 0;
  return {
    html: htmlArray.join(' '),
    accuracy
  };
}

export function evaluateSpeech(duration, wordCount, avgPitch, pitchVariance, pauseCount) {
  // 1. Calculate WPM
  const wpm = duration > 0 ? Math.round((wordCount / duration) * 60) : 0;

  // 2. Pace Assessment
  let paceLabel = '';
  let paceAdvice = '';
  if (wpm < 110) {
    paceLabel = 'Slow';
    paceAdvice = 'Your speaking pace is quite slow. Consider increasing your velocity slightly to hold listener attention and project dynamic energy.';
  } else if (wpm <= 150) {
    paceLabel = 'Optimal';
    paceAdvice = 'Excellent! Your speaking pace is right in the sweet spot for maximum comprehensibility, clarity, and professional impact.';
  } else if (wpm <= 180) {
    paceLabel = 'Fast';
    paceAdvice = 'Your speaking pace is fast. Remember to take steady, conscious breaths and slow down when conveying complex or critical concepts.';
  } else {
    paceLabel = 'Extremely Fast';
    paceAdvice = 'You are rushing! This might make it hard for listeners to process your points. Practice inserting deliberate pauses to slow down.';
  }

  // 3. Vocal Register Assessment
  let registerLabel = '';
  let registerAdvice = '';
  if (avgPitch === 0) {
    registerLabel = 'No Voice Detected';
    registerAdvice = 'Ensure your microphone is close enough and that you are speaking clearly.';
  } else if (avgPitch < 125) {
    registerLabel = 'Deep / Chest Voice';
    registerAdvice = 'Your average pitch sits in a deep register. This gives an authoritative, commanding tone, but make sure to vary inflections so it doesn\'t sound overly heavy.';
  } else if (avgPitch <= 195) {
    registerLabel = 'Medium / Mixed Voice';
    registerAdvice = 'Your voice is in the optimal mid-range register. This is highly friendly, balanced, and excellent for conversational or presentation speech.';
  } else {
    registerLabel = 'High / Head Voice';
    registerAdvice = 'Your pitch sits in a higher register. This projects excitement and urgency. To sound more grounded, try breathing deeply from your diaphragm to utilize more chest resonance.';
  }

  // 4. Inflection Cadence Assessment
  let inflectionLabel = '';
  let inflectionAdvice = '';
  if (pitchVariance < 15) {
    inflectionLabel = 'Monotone';
    inflectionAdvice = 'Your pitch is very steady. Try to emphasize key terms by raising your pitch at the beginning of important sentences to keep listeners engaged.';
  } else if (pitchVariance <= 38) {
    inflectionLabel = 'Natural';
    inflectionAdvice = 'Nice vocal expressiveness! You have a natural cadence with enough pitch variance to sound dynamic and conversational.';
  } else {
    inflectionLabel = 'Dynamic / Animated';
    inflectionAdvice = 'Highly animated pitch patterns! This is fantastic for storytelling, theater, or children\'s content. For standard business presentations, ensure it stays professional.';
  }

  // 5. Pauses Cadence Assessment
  let pauseLabel = '';
  let pauseAdvice = '';
  
  // Calculate average pauses per minute
  const pauseFrequency = duration > 0 ? (pauseCount / duration) * 60 : 0;
  
  if (pauseCount === 0) {
    pauseLabel = 'Continuous Flow';
    pauseAdvice = 'You spoke without any noticeable pauses. Remember, silence is a powerful tool. Insert short 1-second pauses between points for dramatic impact.';
  } else if (pauseFrequency < 3) {
    pauseLabel = 'Steady Flow';
    pauseAdvice = `You made ${pauseCount} pause(s). This is a good flow, but you can try adding slightly more pauses between different slides or thoughts.`;
  } else if (pauseFrequency <= 8) {
    pauseLabel = 'Structured & Balanced';
    pauseAdvice = `Excellent phrasing! With ${pauseCount} pause(s), you gave the audience regular moments to digest your words and structure your thoughts.`;
  } else {
    pauseLabel = 'Frequent Hesitations';
    paceLabel = wpm < 110 ? 'Fragmented' : paceLabel;
    pauseAdvice = `You had ${pauseCount} pauses, which is quite frequent. Focus on reducing starter hesitation words or nervous pauses. Relax, breathe, and link sentences together.`;
  }

  return {
    wpm,
    paceLabel,
    paceAdvice,
    registerLabel,
    registerAdvice,
    inflectionLabel,
    inflectionAdvice,
    pauseLabel,
    pauseAdvice
  };
}

// Pre-compiled syllable counts, splits, and IPA guides for curated practice prompts vocabulary
export const SYLLABLE_DB = {
  "the": { syllables: ["the"], stressIndex: 0, ipa: "/ðə/", guide: "Common article. Pronounced with a soft 'th' sound." },
  "only": { syllables: ["on", "ly"], stressIndex: 0, ipa: "/ˈoʊn.li/", guide: "Stress the first syllable: ON-ly." },
  "way": { syllables: ["way"], stressIndex: 0, ipa: "/weɪ/", guide: "Single syllable. Project the long 'a' vowel clearly." },
  "great": { syllables: ["great"], stressIndex: 0, ipa: "/ɡreɪt/", guide: "Single syllable. Focus on the hard 'g' and the trailing 't'." },
  "work": { syllables: ["work"], stressIndex: 0, ipa: "/wɜːrk/", guide: "Single syllable. Pronounce with an 'er' sound (w-er-k)." },
  "love": { syllables: ["love"], stressIndex: 0, ipa: "/lʌv/", guide: "Single syllable with a soft, voiced 'v' sound at the end." },
  "found": { syllables: ["found"], stressIndex: 0, ipa: "/faʊnd/", guide: "Single syllable. Ensure you articulate the trailing 'nd'." },
  "settle": { syllables: ["set", "tle"], stressIndex: 0, ipa: "/ˈsɛt.əl/", guide: "Stress the first syllable: SET-tle. The second is a quick vocalized 'l'." },
  "hello": { syllables: ["hel", "lo"], stressIndex: 1, ipa: "/həˈloʊ/", guide: "Stress is on the second syllable: hel-LO." },
  "thank": { syllables: ["thank"], stressIndex: 0, ipa: "/θæŋk/", guide: "Single syllable. Start with a clean, unvoiced 'th' sound." },
  "coming": { syllables: ["com", "ing"], stressIndex: 0, ipa: "/ˈkʌm.ɪŋ/", guide: "Stress the first syllable: COM-ing." },
  "today": { syllables: ["to", "day"], stressIndex: 1, ipa: "/təˈdeɪ/", guide: "Stress is on the second syllable: to-DAY." },
  "excited": { syllables: ["ex", "ci", "ted"], stressIndex: 1, ipa: "/ɪkˈsaɪ.tɪd/", guide: "Stress is on the second syllable: ex-CI-ted." },
  "progress": { syllables: ["prog", "ress"], stressIndex: 0, ipa: "/ˈprɒ.ɡrɛs/", guide: "As a noun, stress the first syllable: PROG-ress." },
  "outline": { syllables: ["out", "line"], stressIndex: 0, ipa: "/ˈaʊt.laɪn/", guide: "Stress the first syllable: OUT-line." },
  "roadmap": { syllables: ["road", "map"], stressIndex: 0, ipa: "/ˈroʊd.mæp/", guide: "Stress the first syllable: ROAD-map." },
  "quarter": { syllables: ["quar", "ter"], stressIndex: 0, ipa: "/ˈkwɔːr.tər/", guide: "Stress the first syllable: QUAR-ter." },
  "solution": { syllables: ["so", "lu", "tion"], stressIndex: 1, ipa: "/səˈluː.ʃən/", guide: "Stress the second syllable: so-LU-tion. The last syllable is 'shun'." },
  "addresses": { syllables: ["ad", "dress", "es"], stressIndex: 1, ipa: "/əˈdrɛs.ɪz/", guide: "Stress the second syllable: ad-DRESS-es." },
  "inefficiency": { syllables: ["in", "ef", "fi", "cien", "cy"], stressIndex: 2, ipa: "/ˌɪn.ɪˈfɪʃ.ən.si/", guide: "Main stress is on the third syllable: in-ef-FI-cien-cy." },
  "reducing": { syllables: ["re", "duc", "ing"], stressIndex: 1, ipa: "/rɪˈdjuː.sɪŋ/", guide: "Stress is on the second syllable: re-DUC-ing." },
  "processing": { syllables: ["proc", "ess", "ing"], stressIndex: 0, ipa: "/ˈproʊ.sɛs.ɪŋ/", guide: "Stress is on the first syllable: PROC-ess-ing." },
  "forty": { syllables: ["for", "ty"], stressIndex: 0, ipa: "/ˈfɔːr.ti/", guide: "Stress the first syllable: FOR-ty." },
  "percent": { syllables: ["per", "cent"], stressIndex: 1, ipa: "/pərˈsɛnt/", guide: "Stress is on the second syllable: per-CENT." },
  "operational": { syllables: ["op", "er", "a", "tion", "al"], stressIndex: 3, ipa: "/ˌɒp.əˈreɪ.ʃənl/", guide: "Main stress is on the fourth syllable: op-er-a-TION-al." },
  "supply": { syllables: ["sup", "ply"], stressIndex: 1, ipa: "/səˈplaɪ/", guide: "Stress is on the second syllable: sup-PLY." },
  "question": { syllables: ["ques", "tion"], stressIndex: 0, ipa: "/ˈkwɛs.tʃən/", guide: "Stress is on the first syllable: QUES-tion." },
  "whether": { syllables: ["wheth", "er"], stressIndex: 0, ipa: "/ˈwɛð.ər/", guide: "Stress is on the first syllable: WHETH-er." },
  "nobler": { syllables: ["no", "bler"], stressIndex: 0, ipa: "/ˈnoʊ.blər/", guide: "Stress is on the first syllable: NO-bler." },
  "suffer": { syllables: ["suf", "fer"], stressIndex: 0, ipa: "/ˈsʌf.ər/", guide: "Stress is on the first syllable: SUF-fer." },
  "outrageous": { syllables: ["out", "ra", "geous"], stressIndex: 1, ipa: "/aʊtˈreɪ.dʒəs/", guide: "Stress the second syllable: out-RA-geous." },
  "fortune": { syllables: ["for", "tune"], stressIndex: 0, ipa: "/ˈfɔːr.tʃən/", guide: "Stress is on the first syllable: FOR-tune." },
  "professional": { syllables: ["pro", "fes", "sion", "al"], stressIndex: 1, ipa: "/prəˈfɛʃ.ənl/", guide: "Stress is on the second syllable: pro-FES-sion-al." },
  "context": { syllables: ["con", "text"], stressIndex: 0, ipa: "/ˈcon.tɛkst/", guide: "Stress the first syllable: CON-text." },
  "crucial": { syllables: ["cru", "cial"], stressIndex: 0, ipa: "/ˈkruː.ʃəl/", guide: "Stress the first syllable: CRU-cial. The second syllable sounds like 'shul'." },
  "summarize": { syllables: ["sum", "ma", "rize"], stressIndex: 0, ipa: "/ˈsʌm.ə.raɪz/", guide: "Stress is on the first syllable: SUM-ma-rize." },
  "active": { syllables: ["ac", "tive"], stressIndex: 0, ipa: "/ˈæk.tɪv/", guide: "Stress the first syllable: AC-tive." },
  "listen": { syllables: ["lis", "ten"], stressIndex: 0, ipa: "/ˈlɪs.ən/", guide: "Stress the first syllable: LIS-ten. Note that the 't' is silent." },
  "respond": { syllables: ["re", "spond"], stressIndex: 1, ipa: "/rɪˈspɒnd/", guide: "Stress the second syllable: re-SPOND." },
  "concise": { syllables: ["con", "cise"], stressIndex: 1, ipa: "/kənˈsaɪs/", guide: "Stress the second syllable: con-CISE." },
  "structured": { syllables: ["struc", "tured"], stressIndex: 0, ipa: "/ˈstruk.tʃərd/", guide: "Stress is on the first syllable: STRUC-tured." },
  "sentences": { syllables: ["sen", "tenc", "es"], stressIndex: 0, ipa: "/ˈsɛn.tən.sɪz/", guide: "Stress the first syllable: SEN-tenc-es." }
};

// Client-side rule-based syllable hyphenator and stress estimator for offline fallback
export function countAndSplitSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '').trim();
  if (clean.length === 0) return { syllables: [word], count: 0, stressIndex: 0 };
  if (clean.length <= 3) return { syllables: [word], count: 1, stressIndex: 0 };

  const vowels = 'aeiouy';
  const syllables = [];
  let currentSyllable = '';

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    // Map index back to original casing/letters from word
    const originalChar = word[i] || char;
    currentSyllable += originalChar;

    const isVowel = vowels.includes(char);
    const nextChar = clean[i + 1];
    const isNextVowel = nextChar ? vowels.includes(nextChar) : false;

    // Core splitter heuristic:
    if (isVowel && !isNextVowel && nextChar) {
      const nextNextChar = clean[i + 2];
      const isNextNextVowel = nextNextChar ? vowels.includes(nextNextChar) : false;

      if (isNextNextVowel) {
        // VCV pattern: split after vowel (e.g. pa-per)
        syllables.push(currentSyllable);
        currentSyllable = '';
      } else if (nextNextChar) {
        // VCCV pattern: split between consonants (e.g. hap-py) unless digraph
        const digraphs = ['th', 'sh', 'ch', 'ph', 'ng', 'qu', 'ck'];
        const cluster = clean.substring(i + 1, i + 3);
        
        if (digraphs.includes(cluster)) {
          // Keep digraphs together, split after vowel
          syllables.push(currentSyllable);
          currentSyllable = '';
        } else {
          // Split between the two consonants
          currentSyllable += word[i + 1] || nextChar;
          i++;
          syllables.push(currentSyllable);
          currentSyllable = '';
        }
      }
    }
  }

  if (currentSyllable) {
    syllables.push(currentSyllable);
  }

  // Adjustments: merge hanging single-consonant syllables
  const finalSyllables = [];
  for (let i = 0; i < syllables.length; i++) {
    const syl = syllables[i];
    const hasVowel = [...syl.toLowerCase()].some(c => vowels.includes(c));
    if (!hasVowel && finalSyllables.length > 0) {
      finalSyllables[finalSyllables.length - 1] += syl;
    } else {
      finalSyllables.push(syl);
    }
  }

  // Silent 'e' adjustment (merge back with preceding syllable)
  if (finalSyllables.length > 1) {
    const lastSyl = finalSyllables[finalSyllables.length - 1].toLowerCase();
    // Silent 'e' at end unless it is 'le' (like set-tle)
    if (lastSyl.endsWith('e') && !lastSyl.endsWith('le') && !lastSyl.endsWith('ee') && !lastSyl.endsWith('ye') && !lastSyl.endsWith('oe')) {
      const popped = finalSyllables.pop();
      finalSyllables[finalSyllables.length - 1] += popped;
    }
  }

  // Simple English noun/verb stress heuristic:
  // Default to 1st syllable for 2-syllable words, penultimate for 3+ syllables
  let stressIndex = 0;
  if (finalSyllables.length === 2) {
    stressIndex = 0;
  } else if (finalSyllables.length > 2) {
    stressIndex = finalSyllables.length - 2; // penultimate syllable stress
  }

  return {
    syllables: finalSyllables,
    count: finalSyllables.length,
    stressIndex
  };
}
