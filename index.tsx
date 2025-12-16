import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type, Modality } from "@google/genai";

// --- Configuration & Helpers ---

const SYSTEM_INSTRUCTION = `
You are a helpful English teacher for Taiwanese elementary school students.
Your goal is to generate simple, clear vocabulary lists based on requested categories.
Always return valid JSON.
The vocabulary should be suitable for beginners (A1 level).
`;

const THEMES = {
  primary: "#FFD700", // Gold/Yellow
  secondary: "#4ADE80", // Green
  accent: "#F472B6", // Pink
  text: "#333333",
  bg: "#F0F9FF", // Light Blue
  cardBg: "#FFFFFF",
};

// Define types
interface VocabWord {
  english: string;
  chinese: string;
  emoji: string;
}

interface QuizItem extends VocabWord {
  options: string[]; // 3 wrong answers + 1 correct answer (shuffled)
}

// --- Audio Helper ---

const decodeAudioData = async (
  base64String: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Gemini TTS returns raw PCM data (24kHz, 1 channel, 16-bit integer)
  const sampleRate = 24000;
  const numChannels = 1;
  const dataInt16 = new Int16Array(bytes.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

// --- App Components ---

const App = () => {
  // Allow setting API key from state if not found in env
  const [apiKey, setApiKey] = useState(process.env.API_KEY || "");
  const [inputKey, setInputKey] = useState("");
  
  const [screen, setScreen] = useState<"home" | "loading" | "learn" | "quiz">("home");
  const [category, setCategory] = useState("");
  const [vocabList, setVocabList] = useState<VocabWord[]>([]);
  const [quizItems, setQuizItems] = useState<QuizItem[]>([]);
  const [error, setError] = useState("");

  const ai = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    if (apiKey) {
      ai.current = new GoogleGenAI({ apiKey });
    }
  }, [apiKey]);

  const categories = [
    { id: "animals", label: "🐶 動物 (Animals)", color: "#FFB74D" },
    { id: "fruit", label: "🍎 水果 (Fruit)", color: "#EF5350" },
    { id: "transport", label: "🚗 交通 (Transport)", color: "#42A5F5" },
    { id: "school", label: "🎒 學校 (School)", color: "#AB47BC" },
    { id: "colors", label: "🎨 顏色 (Colors)", color: "#EC407A" },
    { id: "body", label: "👀 身體 (Body)", color: "#8D6E63" },
  ];

  const fetchVocabulary = async (selectedCategory: string) => {
    if (!ai.current) return;
    setScreen("loading");
    setCategory(selectedCategory);
    setError("");

    try {
      const prompt = `
        Generate a list of 8 distinct, simple English nouns related to '${selectedCategory}'.
        Target audience: Kids.
        Return JSON format: Array of objects with keys: 'english', 'chinese' (Traditional Chinese), 'emoji'.
        Make sure the words are common and easy to visualize with an emoji.
      `;

      const response = await ai.current.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                english: { type: Type.STRING },
                chinese: { type: Type.STRING },
                emoji: { type: Type.STRING },
              },
              required: ["english", "chinese", "emoji"],
            },
          },
        },
      });

      const text = response.text;
      if (text) {
        const data: VocabWord[] = JSON.parse(text);
        setVocabList(data);
        
        // Prepare quiz items (add distractors)
        const qItems = data.map((item) => {
          const others = data.filter((w) => w.english !== item.english);
          // Shuffle others and take 3
          const distractors = others.sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.english);
          const options = [...distractors, item.english].sort(() => 0.5 - Math.random());
          return { ...item, options };
        });
        setQuizItems(qItems);
        
        setScreen("learn"); // Default to learn mode after fetching
      } else {
        throw new Error("No data returned");
      }
    } catch (e) {
      console.error(e);
      setError("發生錯誤，請稍後再試。");
      setScreen("home");
    }
  };

  const handleHome = () => {
    setScreen("home");
    setVocabList([]);
  };

  // --- Login Screen (API Key Input) ---
  if (!apiKey) {
    return (
      <div style={styles.container}>
         <div style={styles.centerContent}>
            <div style={styles.flashCard}>
              <h1 style={{...styles.title, fontSize: '28px'}}>🌟 Happy English</h1>
              <p style={{marginBottom: '20px', color: '#666', textAlign: 'center'}}>
                請輸入您的 Google Gemini API Key 開始學習！
                <br/>
                (Please enter your API Key to start)
              </p>
              <input 
                type="password" 
                placeholder="Paste API Key here..."
                style={styles.input}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
              />
              <button 
                style={styles.bigButton} 
                onClick={() => setApiKey(inputKey)}
                disabled={!inputKey.trim()}
              >
                開始 (Start) 🚀
              </button>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                style={{marginTop: '20px', color: '#888', fontSize: '12px'}}
              >
                取得 API Key (Get API Key)
              </a>
            </div>
         </div>
      </div>
    );
  }

  // --- Main App Screen ---
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logo} onClick={handleHome}>
          🌟 Happy English
        </div>
        {screen !== "home" && (
          <button style={styles.homeButton} onClick={handleHome}>
            🏠 回首頁
          </button>
        )}
      </header>

      <main style={styles.main}>
        {screen === "home" && (
          <CategorySelect categories={categories} onSelect={fetchVocabulary} />
        )}

        {screen === "loading" && <LoadingView />}

        {screen === "learn" && (
          <LearnMode
            items={vocabList}
            ai={ai.current}
            onSwitchToQuiz={() => setScreen("quiz")}
          />
        )}

        {screen === "quiz" && (
          <QuizMode
            items={quizItems}
            ai={ai.current}
            onSwitchToLearn={() => setScreen("learn")}
            onFinish={handleHome}
          />
        )}
        
        {error && <div style={styles.error}>{error}</div>}
      </main>
    </div>
  );
};

// --- Sub Components ---

const CategorySelect = ({
  categories,
  onSelect,
}: {
  categories: any[];
  onSelect: (id: string) => void;
}) => {
  return (
    <div style={styles.categoryGrid}>
      <h2 style={styles.title}>你要學什麼呢？(What do you want to learn?)</h2>
      <div style={styles.grid}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            style={{ ...styles.categoryCard, backgroundColor: cat.color }}
            onClick={() => onSelect(cat.id)}
          >
            <span style={styles.catLabel}>{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const LoadingView = () => (
  <div style={styles.centerContent}>
    <div style={styles.spinner}>🤖</div>
    <p style={styles.loadingText}>正在準備教材... (Preparing lessons...)</p>
  </div>
);

const LearnMode = ({
  items,
  ai,
  onSwitchToQuiz,
}: {
  items: VocabWord[];
  ai: GoogleGenAI;
  onSwitchToQuiz: () => void;
}) => {
  const [idx, setIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const current = items[idx];

  const playAudio = async () => {
    if (isPlaying || !ai) return;
    setIsPlaying(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: {
          parts: [{ text: current.english }],
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Puck" },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await decodeAudioData(base64Audio, audioCtx);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
        source.onended = () => setIsPlaying(false);
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.error(e);
      setIsPlaying(false);
    }
  };

  // Auto-play when card changes
  useEffect(() => {
    const timer = setTimeout(() => {
        playAudio();
    }, 500);
    return () => clearTimeout(timer);
  }, [current]);

  const next = () => {
    if (idx < items.length - 1) setIdx(idx + 1);
  };
  const prev = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  return (
    <div style={styles.learnContainer}>
      <div style={styles.modeToggle}>
        <button style={styles.activeModeBtn}>📖 學習 (Learn)</button>
        <button style={styles.inactiveModeBtn} onClick={onSwitchToQuiz}>
          🎮 測驗 (Quiz)
        </button>
      </div>

      <div style={styles.flashCard}>
        <div style={styles.emojiDisplay}>{current.emoji}</div>
        <div style={styles.wordDisplay}>{current.english}</div>
        <div style={styles.chineseDisplay}>{current.chinese}</div>
        <button
          style={{...styles.audioButton, opacity: isPlaying ? 0.7 : 1}}
          onClick={playAudio}
          disabled={isPlaying}
        >
          {isPlaying ? "🔊 Speaking..." : "🔊 聽發音"}
        </button>
      </div>

      <div style={styles.controls}>
        <button style={styles.navButton} onClick={prev} disabled={idx === 0}>
          👈 上一個
        </button>
        <div style={styles.progress}>
          {idx + 1} / {items.length}
        </div>
        <button
          style={styles.navButton}
          onClick={next}
          disabled={idx === items.length - 1}
        >
          下一個 👉
        </button>
      </div>
    </div>
  );
};

const QuizMode = ({
  items,
  ai,
  onSwitchToLearn,
  onFinish,
}: {
  items: QuizItem[];
  ai: GoogleGenAI;
  onSwitchToLearn: () => void;
  onFinish: () => void;
}) => {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);

  const current = items[idx];

  const handleAnswer = (option: string) => {
    if (selected) return; // Prevent double click
    setSelected(option);
    
    // Play sound of the word they clicked (optional, but good feedback if correct)
    // Here we just play success/fail logic
    
    if (option === current.english) {
      setIsCorrect(true);
      setScore(s => s + 1);
      // Play ding sound logic could go here
    } else {
      setIsCorrect(false);
    }

    setTimeout(() => {
      if (idx < items.length - 1) {
        setIdx(idx + 1);
        setSelected(null);
        setIsCorrect(null);
      } else {
        setFinished(true);
      }
    }, 1500);
  };

  if (finished) {
    return (
      <div style={styles.resultContainer}>
        <div style={styles.emojiDisplay}>🏆</div>
        <h2>測驗完成! (Finished!)</h2>
        <p style={styles.scoreText}>
          得分: {score} / {items.length}
        </p>
        <button style={styles.bigButton} onClick={onFinish}>
          再玩一次 (Play Again)
        </button>
      </div>
    );
  }

  return (
    <div style={styles.learnContainer}>
      <div style={styles.modeToggle}>
        <button style={styles.inactiveModeBtn} onClick={onSwitchToLearn}>
          📖 學習 (Learn)
        </button>
        <button style={styles.activeModeBtn}>🎮 測驗 (Quiz)</button>
      </div>

      <div style={styles.progressHeader}>
        題號: {idx + 1} / {items.length} | 分數: {score}
      </div>

      <div style={styles.quizCard}>
        <div style={styles.quizEmoji}>{current.emoji}</div>
        <div style={styles.questionText}>這個英文是什麼？</div>
        
        <div style={styles.optionsGrid}>
          {current.options.map((opt) => {
            let bgColor = "#FFF";
            if (selected) {
              if (opt === current.english) bgColor = "#A5D6A7"; // Green for correct
              else if (opt === selected) bgColor = "#EF9A9A"; // Red for wrong selected
            }
            
            return (
              <button
                key={opt}
                style={{ ...styles.optionButton, backgroundColor: bgColor }}
                onClick={() => handleAnswer(opt)}
                disabled={!!selected}
              >
                {opt}
              </button>
            );
          })}
        </div>
        
        {isCorrect === true && <div style={styles.feedbackCorrect}>✅ Correct!</div>}
        {isCorrect === false && <div style={styles.feedbackWrong}>❌ The answer is {current.english}</div>}
      </div>
    </div>
  );
};

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: THEMES.bg,
  },
  header: {
    padding: "20px",
    backgroundColor: "#fff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: "0 0 20px 20px",
  },
  logo: {
    fontSize: "24px",
    fontWeight: "bold",
    color: THEMES.text,
    cursor: "pointer",
  },
  homeButton: {
    padding: "8px 16px",
    borderRadius: "20px",
    backgroundColor: "#E0F7FA",
    color: "#006064",
    fontSize: "14px",
    fontWeight: "bold",
  },
  main: {
    flex: 1,
    padding: "20px",
    display: "flex",
    flexDirection: "column",
  },
  title: {
    textAlign: "center",
    color: THEMES.text,
    marginBottom: "20px",
    fontSize: "20px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "15px",
  },
  categoryCard: {
    padding: "30px 10px",
    borderRadius: "20px",
    color: "#fff",
    fontSize: "18px",
    fontWeight: "bold",
    boxShadow: "0 4px 0 rgba(0,0,0,0.1)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
  },
  catLabel: {
    textShadow: "1px 1px 2px rgba(0,0,0,0.2)",
  },
  centerContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
  spinner: {
    fontSize: "60px",
    animation: "spin 2s infinite linear",
  },
  loadingText: {
    marginTop: "20px",
    fontSize: "18px",
    color: "#666",
  },
  learnContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
  },
  modeToggle: {
    display: "flex",
    gap: "10px",
    marginBottom: "10px",
    backgroundColor: "#fff",
    padding: "5px",
    borderRadius: "30px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
  },
  activeModeBtn: {
    padding: "10px 20px",
    borderRadius: "25px",
    backgroundColor: THEMES.secondary,
    color: "#fff",
    fontWeight: "bold",
  },
  inactiveModeBtn: {
    padding: "10px 20px",
    borderRadius: "25px",
    backgroundColor: "transparent",
    color: "#666",
    fontWeight: "bold",
  },
  flashCard: {
    backgroundColor: "#fff",
    borderRadius: "30px",
    padding: "40px",
    width: "100%",
    maxWidth: "350px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
    border: "3px solid #E0F2F1",
  },
  emojiDisplay: {
    fontSize: "100px",
    marginBottom: "20px",
  },
  wordDisplay: {
    fontSize: "40px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "10px",
    textAlign: "center",
  },
  chineseDisplay: {
    fontSize: "24px",
    color: "#888",
    marginBottom: "30px",
  },
  audioButton: {
    backgroundColor: THEMES.primary,
    color: "#5D4037",
    padding: "12px 30px",
    borderRadius: "50px",
    fontSize: "18px",
    fontWeight: "bold",
    boxShadow: "0 4px 0 #FBC02D",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    marginTop: "20px",
  },
  navButton: {
    backgroundColor: "#fff",
    border: "2px solid #ddd",
    padding: "10px 20px",
    borderRadius: "15px",
    fontWeight: "bold",
    color: "#555",
  },
  progress: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#555",
  },
  quizCard: {
    backgroundColor: "#fff",
    borderRadius: "30px",
    padding: "20px",
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 5px 15px rgba(0,0,0,0.05)",
  },
  quizEmoji: {
    fontSize: "80px",
    marginBottom: "10px",
  },
  questionText: {
    fontSize: "18px",
    color: "#666",
    marginBottom: "20px",
  },
  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    width: "100%",
  },
  optionButton: {
    padding: "20px",
    borderRadius: "15px",
    border: "2px solid #eee",
    fontSize: "20px",
    fontWeight: "bold",
    color: "#444",
    boxShadow: "0 3px 0 #eee",
  },
  progressHeader: {
    fontSize: "16px",
    color: "#666",
    fontWeight: "bold",
  },
  feedbackCorrect: {
    marginTop: "20px",
    color: "#4CAF50",
    fontWeight: "bold",
    fontSize: "20px",
  },
  feedbackWrong: {
    marginTop: "20px",
    color: "#EF5350",
    fontWeight: "bold",
    fontSize: "20px",
  },
  resultContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    margin: "20px",
    borderRadius: "30px",
    padding: "40px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
  },
  scoreText: {
    fontSize: "24px",
    color: "#555",
    marginBottom: "30px",
  },
  bigButton: {
    backgroundColor: THEMES.accent,
    color: "#fff",
    padding: "15px 40px",
    borderRadius: "50px",
    fontSize: "20px",
    fontWeight: "bold",
    boxShadow: "0 5px 0 #C2185B",
    marginTop: "20px",
  },
  error: {
    marginTop: "20px",
    color: "red",
    textAlign: "center",
  },
  input: {
    width: "100%",
    padding: "15px",
    borderRadius: "15px",
    border: "2px solid #ddd",
    fontSize: "16px",
    outline: "none",
    textAlign: "center",
    backgroundColor: "#FAFAFA",
  },
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);