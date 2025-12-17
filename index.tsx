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

// Japanese Pastel Palette
const THEMES = {
  primary: "#FF9AA2", // Sakura Pink
  secondary: "#B5EAD7", // Mint Green
  accent: "#FFDAC1", // Peach/Apricot
  text: "#5D5C61", // Soft Dark Grey
  bg: "#FFF9F0", // Warm Cream/Ivory
  cardBg: "#FFFFFF",
  highlight: "#C7CEEA", // Periwinkle
  wrong: "#FFB7B2", // Soft Red
  errorBg: "#FFEBEE",
  errorText: "#D32F2F",
};

// Define types
interface VocabWord {
  english: string;
  chinese: string;
  emoji: string;
  generatedImage?: string;
}

interface QuizItem extends VocabWord {
  options: string[];
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

// --- Custom Components & Icons ---

const Mascot = ({ mood = "happy", size = 100 }: { mood?: "happy" | "thinking" | "excited" | "sad" | "error"; size?: number }) => {
  const eyeColor = "#5D5C61";
  const blushColor = "#FFB7B2";

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ overflow: 'visible' }}>
      <path
        d="M40 100 C 40 40, 160 40, 160 100 C 160 150, 40 150, 40 100"
        fill="#FFFFFF"
        stroke="#5D5C61"
        strokeWidth="4"
      />
      <circle cx="60" cy="110" r="10" fill={blushColor} opacity="0.6" />
      <circle cx="140" cy="110" r="10" fill={blushColor} opacity="0.6" />

      {mood === "happy" && (
        <>
          <circle cx="70" cy="90" r="8" fill={eyeColor} />
          <circle cx="130" cy="90" r="8" fill={eyeColor} />
          <path d="M90 110 Q 100 120, 110 110" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" />
        </>
      )}

      {mood === "thinking" && (
        <>
           <line x1="60" y1="90" x2="80" y2="90" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" />
           <line x1="120" y1="90" x2="140" y2="90" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" />
           <circle cx="100" cy="115" r="5" fill={eyeColor} />
           <path d="M165 70 Q 175 90, 165 95 Q 155 90, 165 70" fill="#B5EAD7" />
        </>
      )}

      {mood === "excited" && (
        <>
          <path d="M60 90 L 70 80 L 80 90" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M120 90 L 130 80 L 140 90" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M85 110 Q 100 130, 115 110" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" />
          <text x="10" y="50" fontSize="40">✨</text>
        </>
      )}

      {mood === "sad" && (
        <>
          <path d="M60 95 L 70 100 L 80 95" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" />
          <path d="M120 95 L 130 100 L 140 95" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" />
          <path d="M90 120 Q 100 110, 110 120" fill="none" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" />
          <path d="M150 60 Q 140 80, 150 85" fill="none" stroke="#87CEEB" strokeWidth="3" />
        </>
      )}

      {mood === "error" && (
        <>
          <line x1="60" y1="85" x2="80" y2="105" stroke={eyeColor} strokeWidth="4" />
          <line x1="80" y1="85" x2="60" y2="105" stroke={eyeColor} strokeWidth="4" />
          <line x1="120" y1="85" x2="140" y2="105" stroke={eyeColor} strokeWidth="4" />
          <line x1="140" y1="85" x2="120" y2="105" stroke={eyeColor} strokeWidth="4" />
          <path d="M90 125 Q 100 115, 110 125" fill="none" stroke={eyeColor} strokeWidth="4" />
        </>
      )}
    </svg>
  );
};

const CloudDecoration = () => (
  <div style={styles.backgroundDecor}>
    <div style={{...styles.cloud, top: '10%', left: '-5%', width: '150px', height: '60px', animationDelay: '0s'}}></div>
    <div style={{...styles.cloud, top: '20%', right: '-5%', width: '120px', height: '50px', animationDelay: '2s'}}></div>
    <div style={{...styles.cloud, bottom: '15%', left: '10%', width: '100px', height: '40px', animationDelay: '4s'}}></div>
  </div>
);

// --- App Components ---

const App = () => {
  // Safe access to process.env for browser environment
  const envKey = (window as any).process?.env?.API_KEY || "";
  const [apiKey, setApiKey] = useState(envKey);
  const [inputKey, setInputKey] = useState("");
  
  const [screen, setScreen] = useState<"home" | "loading" | "learn" | "quiz">("home");
  const [category, setCategory] = useState("");
  const [vocabList, setVocabList] = useState<VocabWord[]>([]);
  const [quizItems, setQuizItems] = useState<QuizItem[]>([]);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  const ai = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    if (apiKey) {
      ai.current = new GoogleGenAI({ apiKey });
    }
  }, [apiKey]);

  const categories = [
    { id: "animals", label: "動物", sub: "Animals", icon: "🐶", color: "#FF9AA2" },
    { id: "fruit", label: "水果", sub: "Fruit", icon: "🍓", color: "#FFB7B2" },
    { id: "transport", label: "交通", sub: "Transport", icon: "🚗", color: "#85E3FF" },
    { id: "school", label: "學校", sub: "School", icon: "🎒", color: "#C7CEEA" },
    { id: "colors", label: "顏色", sub: "Colors", icon: "🎨", color: "#E2F0CB" },
    { id: "yummy", label: "美食", sub: "Yummy", icon: "🍔", color: "#FFDAC1" },
  ];

  const fetchVocabulary = async (selectedCategory: string) => {
    if (!ai.current) {
      setError("API Key 尚未設定");
      return;
    }
    
    setScreen("loading");
    setCategory(selectedCategory);
    setError("");
    setErrorDetail("");

    try {
      const prompt = `
        Generate a list of 6 distinct, simple English nouns related to '${selectedCategory}'.
        Target audience: Kids.
        The output must be a valid JSON object.
        Make sure the words are common concrete nouns easy to visualize.
      `;

      const response = await ai.current.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
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
              }
            },
          },
        },
      });

      let text = response.text;
      if (!text) {
        throw new Error("模型未回傳任何文字，可能被安全性設定阻擋。");
      }

      // Robust Cleaning: Remove Markdown code blocks if present
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();

      let data: VocabWord[] = [];
      try {
        const parsed = JSON.parse(text);
        data = parsed.items || parsed;
        if (!Array.isArray(data)) throw new Error("資料格式不正確 (Not an array)");
      } catch (jsonErr) {
        console.error("JSON Parse Error:", jsonErr, "Raw Text:", text);
        throw new Error("無法解析 AI 回傳的資料，請重試。");
      }

      setVocabList(data);
      
      const qItems = data.map((item) => {
        const others = data.filter((w) => w.english !== item.english);
        const distractors = others.sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.english);
        const options = [...distractors, item.english].sort(() => 0.5 - Math.random());
        return { ...item, options };
      });
      setQuizItems(qItems);
      setScreen("learn");

    } catch (e: any) {
      console.error("Fetch Error:", e);
      let friendlyMsg = "讀取失敗，請稍後再試。";
      let detail = e.message || String(e);
      let shouldLogout = false;

      if (detail.includes("400")) {
        friendlyMsg = "API Key 無效 (400) - 請檢查您的 Key 是否正確複製。";
        shouldLogout = true;
      }
      else if (detail.includes("403")) {
        friendlyMsg = "API 權限不足 (403)。這通常代表 Key 無效或專案未啟用 Generative AI API。建議建立新的 Key 再試一次。";
        shouldLogout = true;
      }
      else if (detail.includes("429")) friendlyMsg = "請求太頻繁 (429) - 請休息一下再試。";
      else if (detail.includes("503") || detail.includes("500")) friendlyMsg = "AI 伺服器忙碌中，請重試。";
      
      setError(friendlyMsg);
      setErrorDetail(detail);

      if (shouldLogout) {
        setApiKey("");
      } else {
        setScreen("home");
      }
    }
  };

  const handleUpdateImage = (word: string, base64: string) => {
    setVocabList(prev => prev.map(item => 
      item.english === word ? { ...item, generatedImage: base64 } : item
    ));
  };

  const handleHome = () => {
    setScreen("home");
    setVocabList([]);
    setError("");
    setErrorDetail("");
  };

  if (!apiKey) {
    return (
      <div style={styles.container}>
         <CloudDecoration />
         <div style={styles.centerContent}>
            {error && (
              <div style={styles.errorBoxFloating}>
                <Mascot mood="error" size={30} />
                <span>{error}</span>
              </div>
            )}
            <div style={styles.loginCard}>
              <Mascot mood="happy" size={120} />
              <h1 style={styles.logoText}>Happy English</h1>
              <p style={styles.loginSubText}>
                歡迎來到快樂英語教室！<br/>
                請輸入 Key 開啟學習之旅 ✨
              </p>
              <input 
                type="password" 
                placeholder="在此貼上 API Key..."
                style={styles.input}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
              />
              <button 
                style={styles.startButton} 
                onClick={() => setApiKey(inputKey)}
                disabled={!inputKey.trim()}
              >
                Let's Go! 🎈
              </button>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                style={styles.linkText}
              >
                還沒有 Key 嗎？點我取得
              </a>
            </div>
         </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <CloudDecoration />
      
      <nav style={styles.nav}>
        <div style={styles.navBrand} onClick={handleHome}>
          <span style={{fontSize: '24px'}}>🌟</span> Happy English
        </div>
        {screen !== "home" && (
          <button style={styles.navHomeBtn} onClick={handleHome}>
            回首頁
          </button>
        )}
      </nav>

      <main style={styles.main}>
        {/* Error Notification Area */}
        {error && (
          <div style={styles.errorBox}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px'}}>
              <Mascot mood="error" size={40} />
              <span style={{fontWeight: 'bold', fontSize: '16px'}}>{error}</span>
            </div>
            {errorDetail && (
              <details style={{fontSize: '12px', color: '#B71C1C', marginTop: '5px', cursor: 'pointer'}}>
                <summary>查看詳細錯誤 (Error Details)</summary>
                <pre style={{whiteSpace: 'pre-wrap', marginTop: '5px', backgroundColor: 'rgba(255,255,255,0.5)', padding: '5px', borderRadius: '5px'}}>{errorDetail}</pre>
              </details>
            )}
          </div>
        )}

        {screen === "home" && (
          <CategorySelect categories={categories} onSelect={fetchVocabulary} />
        )}

        {screen === "loading" && <LoadingView />}

        {screen === "learn" && (
          <LearnMode
            items={vocabList}
            ai={ai.current}
            onUpdateImage={handleUpdateImage}
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
    <div style={styles.homeContainer}>
      <div style={styles.mascotHeader}>
        <Mascot mood="happy" size={100} />
        <div style={styles.bubble}>
          今天想學什麼呢？<br/>(What shall we learn?)
        </div>
      </div>
      
      <div style={styles.categoryGrid}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            style={{ ...styles.categoryCard, backgroundColor: cat.color }}
            onClick={() => onSelect(cat.id)}
          >
            <div style={styles.catIcon}>{cat.icon}</div>
            <div style={styles.catLabel}>{cat.label}</div>
            <div style={styles.catSub}>{cat.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

const LoadingView = () => (
  <div style={styles.centerContent}>
    <Mascot mood="thinking" size={150} />
    <p style={styles.loadingText}>
      正在準備可愛的單字卡...<br/>
      (Preparing flashcards...)
    </p>
  </div>
);

const LearnMode = ({
  items,
  ai,
  onUpdateImage,
  onSwitchToQuiz,
}: {
  items: VocabWord[];
  ai: GoogleGenAI;
  onUpdateImage: (word: string, base64: string) => void;
  onSwitchToQuiz: () => void;
}) => {
  const [idx, setIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const isMounted = useRef(true);

  const current = items[idx];

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Play Audio
  const playAudio = async () => {
    if (isPlaying || !ai) return;
    setIsPlaying(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: { parts: [{ text: current.english }] },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
        },
      });

      if (!isMounted.current) return;

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await decodeAudioData(base64Audio, audioCtx);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
        source.onended = () => { if(isMounted.current) setIsPlaying(false); };
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.error("TTS Error", e);
      if(isMounted.current) setIsPlaying(false);
    }
  };

  // Generate Illustration
  const generateIllustration = async () => {
    if (!ai || current.generatedImage || isGeneratingImg) return;
    setIsGeneratingImg(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `Draw a cute, simple, kawaii style vector illustration of "${current.english}". Flat design, pastel colors, white background, high quality. Do not include any text in the image.`
            },
          ],
        },
      });

      if (!isMounted.current) return;

      let base64Img = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          base64Img = part.inlineData.data;
          break;
        }
      }

      if (base64Img) {
        onUpdateImage(current.english, `data:image/png;base64,${base64Img}`);
      }
    } catch (e) {
      console.error("Image Gen Error", e);
    } finally {
      if(isMounted.current) setIsGeneratingImg(false);
    }
  };

  // Effects when current card changes
  useEffect(() => {
    // 1. Play audio after a short delay
    const audioTimer = setTimeout(() => {
       if(isMounted.current) playAudio();
    }, 500);

    // 2. Generate image if not exists
    if (!current.generatedImage) {
        generateIllustration();
    }

    return () => clearTimeout(audioTimer);
  }, [current.english]);

  const next = () => { if (idx < items.length - 1) setIdx(idx + 1); };
  const prev = () => { if (idx > 0) setIdx(idx - 1); };

  return (
    <div style={styles.modeContainer}>
      <div style={styles.tabContainer}>
        <button style={styles.activeTab}>📖 學習 (Learn)</button>
        <button style={styles.inactiveTab} onClick={onSwitchToQuiz}>🎮 測驗 (Quiz)</button>
      </div>

      <div style={styles.flashCardOuter}>
        <div style={styles.flashCardInner}>
          {/* Image Area */}
          <div style={styles.imageContainer}>
             {current.generatedImage ? (
                <img src={current.generatedImage} alt={current.english} style={styles.generatedImg} />
             ) : (
                <div style={{position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                   <div style={styles.emojiLarge}>{current.emoji}</div>
                   {isGeneratingImg && <span style={styles.loadingImgText}>✨ 繪製中...</span>}
                </div>
             )}
          </div>

          <div style={styles.wordEnglish}>{current.english}</div>
          <div style={styles.wordChinese}>{current.chinese}</div>
          
          <button
            style={{...styles.audioFab, transform: isPlaying ? 'scale(1.1)' : 'scale(1)'}}
            onClick={playAudio}
            disabled={isPlaying}
          >
            {isPlaying ? "🔊" : "🔈"}
          </button>
        </div>
      </div>

      <div style={styles.pagination}>
        <button style={styles.pageBtn} onClick={prev} disabled={idx === 0}>←</button>
        <span style={styles.pageIndicator}>{idx + 1} / {items.length}</span>
        <button style={styles.pageBtn} onClick={next} disabled={idx === items.length - 1}>→</button>
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
    if (selected) return;
    setSelected(option);
    
    if (option === current.english) {
      setIsCorrect(true);
      setScore(s => s + 1);
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
    const isPerfect = score === items.length;
    return (
      <div style={styles.centerContent}>
        <Mascot mood={isPerfect ? "excited" : "happy"} size={150} />
        <h2 style={styles.finishTitle}>{isPerfect ? "太棒了！滿分！" : "測驗完成！"}</h2>
        <div style={styles.scoreBoard}>
          <span style={{fontSize: '40px'}}>🏆</span>
          <span style={styles.scoreNum}>{score} / {items.length}</span>
        </div>
        <button style={styles.startButton} onClick={onFinish}>
          再來一次 (Play Again)
        </button>
      </div>
    );
  }

  return (
    <div style={styles.modeContainer}>
       <div style={styles.tabContainer}>
        <button style={styles.inactiveTab} onClick={onSwitchToLearn}>📖 學習 (Learn)</button>
        <button style={styles.activeTab}>🎮 測驗 (Quiz)</button>
      </div>

      <div style={styles.quizHeader}>
        <Mascot mood={isCorrect === true ? "excited" : isCorrect === false ? "sad" : "happy"} size={80} />
        <div style={styles.quizBubble}>
          {isCorrect === true ? "答對了！好棒！" : isCorrect === false ? `哎呀，是 ${current.english}` : "這個英文是什麼？"}
        </div>
      </div>

      <div style={styles.quizMain}>
        {/* Reuse generated image if available, else emoji */}
        <div style={styles.quizImageContainer}>
          {current.generatedImage ? (
             <img src={current.generatedImage} alt={current.english} style={{width: '100px', height: '100px', objectFit: 'contain'}} />
          ) : (
             <div style={styles.quizEmoji}>{current.emoji}</div>
          )}
        </div>
        
        <div style={styles.optionsList}>
          {current.options.map((opt) => {
            let bg = "#FFFFFF";
            let border = "2px solid #EEE";
            
            if (selected) {
               if (opt === current.english) {
                 bg = "#B5EAD7"; // Mint Green for correct
                 border = "2px solid #84DCC6";
               } else if (opt === selected) {
                 bg = "#FFB7B2"; // Red for wrong
                 border = "2px solid #FF9AA2";
               }
            }

            return (
              <button
                key={opt}
                style={{ ...styles.optionBtn, backgroundColor: bg, border: border }}
                onClick={() => handleAnswer(opt)}
                disabled={!!selected}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
       <div style={styles.progressSimple}>
          Question: {idx + 1} / {items.length}
       </div>
    </div>
  );
};

// --- Styles (CSS-in-JS) ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: THEMES.bg,
    position: "relative",
    overflow: "hidden", // for clouds
  },
  // Decoration
  backgroundDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
    pointerEvents: 'none',
  },
  cloud: {
    position: 'absolute',
    backgroundColor: '#FFF',
    borderRadius: '50px',
    boxShadow: '0 5px 15px rgba(0,0,0,0.03)',
    opacity: 0.8,
  },
  // Nav
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 25px",
    position: "relative",
    zIndex: 10,
  },
  navBrand: {
    fontSize: "20px",
    fontWeight: "bold",
    color: THEMES.text,
    display: "flex",
    alignItems: "center",
    gap: "5px",
    cursor: "pointer",
  },
  navHomeBtn: {
    backgroundColor: "#FFFFFF",
    color: THEMES.text,
    padding: "8px 16px",
    borderRadius: "20px",
    fontWeight: "bold",
    boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
  },
  main: {
    flex: 1,
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    zIndex: 5,
  },
  // Error Box
  errorBox: {
    backgroundColor: THEMES.errorBg,
    color: THEMES.errorText,
    padding: "15px",
    borderRadius: "20px",
    marginBottom: "20px",
    boxShadow: "0 4px 10px rgba(211, 47, 47, 0.1)",
    border: "2px solid #FFCDD2",
  },
  errorBoxFloating: {
    backgroundColor: THEMES.errorBg,
    color: THEMES.errorText,
    padding: "15px 25px",
    borderRadius: "30px",
    marginBottom: "20px",
    boxShadow: "0 8px 20px rgba(211, 47, 47, 0.2)",
    border: "2px solid #FFCDD2",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontWeight: "bold",
    maxWidth: "90%",
  },
  // Home
  homeContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  mascotHeader: {
    display: "flex",
    alignItems: "flex-end",
    marginBottom: "30px",
  },
  bubble: {
    backgroundColor: "#FFFFFF",
    padding: "15px 20px",
    borderRadius: "20px 20px 20px 0",
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
    marginLeft: "10px",
    marginBottom: "40px",
    fontSize: "16px",
    color: THEMES.text,
    position: "relative",
  },
  categoryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "15px",
    width: "100%",
  },
  categoryCard: {
    padding: "20px",
    borderRadius: "25px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 0 rgba(0,0,0,0.1)",
    transition: "transform 0.2s",
    border: "2px solid rgba(255,255,255,0.3)",
  },
  catIcon: {
    fontSize: "36px",
    marginBottom: "5px",
    textShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  catLabel: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#FFF",
    textShadow: "0 1px 2px rgba(0,0,0,0.1)",
  },
  catSub: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
  },
  // Login
  centerContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
    position: "relative",
    zIndex: 5,
  },
  loginCard: {
    backgroundColor: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(10px)",
    padding: "40px 30px",
    borderRadius: "40px",
    width: "100%",
    maxWidth: "340px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 10px 30px rgba(181, 234, 215, 0.3)", // Mint shadow
    border: "2px solid #FFF",
  },
  logoText: {
    fontFamily: "'Fredoka', sans-serif",
    color: THEMES.primary,
    fontSize: "32px",
    marginTop: "10px",
    marginBottom: "10px",
  },
  loginSubText: {
    textAlign: "center",
    color: "#888",
    lineHeight: "1.5",
    marginBottom: "25px",
    fontSize: "14px",
  },
  input: {
    width: "100%",
    padding: "15px",
    borderRadius: "25px",
    border: "2px solid #EEE",
    textAlign: "center",
    fontSize: "16px",
    marginBottom: "15px",
    outline: "none",
    backgroundColor: "#FAFAFA",
    color: "#555",
  },
  startButton: {
    width: "100%",
    backgroundColor: THEMES.primary,
    color: "#FFF",
    padding: "15px",
    borderRadius: "25px",
    fontSize: "18px",
    fontWeight: "bold",
    boxShadow: "0 4px 0 #E57373", // Darker pink shadow
  },
  linkText: {
    marginTop: "15px",
    color: "#AAA",
    fontSize: "12px",
    textDecoration: "none",
  },
  loadingText: {
    marginTop: "20px",
    color: "#888",
    textAlign: "center",
    lineHeight: "1.6",
  },
  // Learn Mode
  modeContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "400px",
    margin: "0 auto",
  },
  tabContainer: {
    display: "flex",
    backgroundColor: "#EEE",
    padding: "4px",
    borderRadius: "30px",
    marginBottom: "20px",
  },
  activeTab: {
    padding: "10px 24px",
    borderRadius: "25px",
    backgroundColor: "#FFF",
    color: THEMES.text,
    fontWeight: "bold",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  inactiveTab: {
    padding: "10px 24px",
    borderRadius: "25px",
    backgroundColor: "transparent",
    color: "#999",
    fontWeight: "bold",
  },
  flashCardOuter: {
    width: "100%",
    perspective: "1000px",
    marginBottom: "20px",
  },
  flashCardInner: {
    backgroundColor: "#FFF",
    borderRadius: "40px",
    padding: "40px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 15px 35px rgba(0,0,0,0.05)",
    border: "4px solid #FFF",
    position: "relative",
  },
  imageContainer: {
    width: '200px',
    height: '200px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatedImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    borderRadius: '10px',
  },
  loadingImgText: {
    marginTop: '10px',
    fontSize: '12px',
    color: '#888',
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: '4px 8px',
    borderRadius: '10px',
  },
  emojiLarge: {
    fontSize: "100px",
    filter: "drop-shadow(0 5px 5px rgba(0,0,0,0.1))",
  },
  wordEnglish: {
    fontSize: "36px",
    fontWeight: "bold",
    color: THEMES.text,
    fontFamily: "'Fredoka', sans-serif",
  },
  wordChinese: {
    fontSize: "20px",
    color: "#AAA",
    marginTop: "5px",
    marginBottom: "20px",
  },
  audioFab: {
    width: "60px",
    height: "60px",
    borderRadius: "30px",
    backgroundColor: THEMES.secondary,
    color: "#FFF",
    fontSize: "24px",
    boxShadow: "0 4px 0 #88C9B3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
  },
  pageBtn: {
    width: "50px",
    height: "50px",
    borderRadius: "25px",
    backgroundColor: "#FFF",
    border: "2px solid #EEE",
    fontSize: "20px",
    color: THEMES.text,
  },
  pageIndicator: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#888",
  },
  // Quiz
  quizHeader: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    marginBottom: "15px",
  },
  quizBubble: {
    backgroundColor: "#FFF",
    padding: "15px",
    borderRadius: "20px 20px 20px 0",
    marginLeft: "10px",
    flex: 1,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    color: THEMES.text,
    fontSize: "16px",
  },
  quizMain: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: "30px",
    padding: "30px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 5px 20px rgba(0,0,0,0.05)",
  },
  quizImageContainer: {
    height: '100px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizEmoji: {
    fontSize: "80px",
  },
  optionsList: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  optionBtn: {
    padding: "15px",
    borderRadius: "20px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#666",
    transition: "all 0.2s",
  },
  progressSimple: {
    marginTop: "20px",
    color: "#AAA",
    fontSize: "14px",
    fontWeight: "600",
  },
  finishTitle: {
    fontSize: "28px",
    color: THEMES.text,
    margin: "20px 0",
  },
  scoreBoard: {
    backgroundColor: "#FFF",
    padding: "20px 40px",
    borderRadius: "30px",
    display: "flex",
    alignItems: "center",
    gap: "15px",
    boxShadow: "0 5px 15px rgba(0,0,0,0.05)",
    marginBottom: "30px",
  },
  scoreNum: {
    fontSize: "32px",
    fontWeight: "bold",
    color: THEMES.primary,
  },
  error: {
    padding: "15px",
    backgroundColor: "#FFEBEE",
    color: "#D32F2F",
    borderRadius: "15px",
    marginTop: "20px",
    textAlign: "center",
  }
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);