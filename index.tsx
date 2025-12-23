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

const ROLEPLAY_SYSTEM_INSTRUCTION = `
You are a friendly English teacher and conversation partner.
You are helping a Taiwanese elementary student practice speaking.
Keep your English very simple (A1-A2 level).
Use short sentences.
Encourage the student and provide gentle corrections if they make mistakes.
Always stay in character based on the chosen scenario (e.g. at a restaurant, at school).
Provide the translation in traditional Chinese in parentheses when using a new or difficult word.
Try to keep the conversation going by asking simple questions.
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

// --- Image Prompt Helper ---

const getContextualImagePrompt = (english: string, chinese: string): string => {
  // 根據單詞類型生成更符合情境的圖片提示，類似 Google banner 風格
  const word = english.toLowerCase();

  // 動物類別 - 顯示動物在自然環境中
  if (['dog', 'cat', 'bird', 'fish', 'rabbit', 'elephant', 'lion', 'tiger', 'bear', 'monkey', 'panda', 'pig', 'cow', 'horse', 'sheep', 'duck', 'chicken'].includes(word)) {
    return `Create a cheerful, educational illustration of a ${english} (${chinese}) in a natural, friendly setting. Google Doodle style: colorful, simple, child-friendly, with a clean white background. The ${english} should be the main focus, drawn in a cute and approachable way that elementary school children would love. No text, just the illustration.`;
  }

  // 水果類別 - 顯示新鮮水果
  if (['apple', 'banana', 'orange', 'grape', 'strawberry', 'watermelon', 'pineapple', 'mango', 'peach', 'pear', 'cherry', 'lemon'].includes(word)) {
    return `Create a vibrant, appetizing illustration of ${english} (${chinese}). Google banner style: bright colors, simple shapes, clean white background. The fruit should look fresh and appealing, perfect for teaching children. Educational illustration style, no text.`;
  }

  // 交通工具 - 顯示交通工具在使用場景中
  if (['car', 'bus', 'train', 'plane', 'bike', 'bicycle', 'boat', 'ship', 'truck', 'motorcycle', 'taxi', 'subway'].includes(word)) {
    return `Create an engaging illustration of a ${english} (${chinese}) in action. Google Doodle style: colorful, dynamic, child-friendly. Show the vehicle in a simple, recognizable way that kids can easily understand. Clean white background, no text.`;
  }

  // 學校用品 - 顯示物品在使用中
  if (['book', 'pen', 'pencil', 'bag', 'backpack', 'desk', 'chair', 'blackboard', 'eraser', 'ruler', 'scissors', 'glue'].includes(word)) {
    return `Create a friendly illustration of ${english} (${chinese}) that looks inviting and educational. Google banner style: bright, simple, clean design with white background. Make it look fun and appealing to elementary school students. No text.`;
  }

  // 顏色 - 顯示顏色在實際應用中
  if (['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray', 'grey'].includes(word)) {
    return `Create a vibrant illustration showcasing the color ${english} (${chinese}). Google Doodle style: use objects, shapes, or scenes that prominently feature this color. Bright, cheerful, educational, clean white background. Perfect for teaching colors to children. No text.`;
  }

  // 食物 - 顯示美味的食物
  if (['pizza', 'burger', 'cake', 'cookie', 'ice cream', 'bread', 'rice', 'noodle', 'soup', 'sandwich', 'hot dog'].includes(word)) {
    return `Create an appetizing illustration of ${english} (${chinese}). Google banner style: colorful, appealing, child-friendly. Make it look delicious and fun, perfect for teaching food vocabulary. Clean white background, no text.`;
  }

  // 身體部位 - 顯示在友好的角色上
  if (['head', 'eye', 'ear', 'nose', 'mouth', 'hand', 'foot', 'arm', 'leg', 'finger', 'toe', 'hair'].includes(word)) {
    return `Create a friendly, educational illustration showing ${english} (${chinese}) on a cute, simple character. Google Doodle style: colorful, approachable, perfect for teaching body parts to children. Clean white background, highlight the body part clearly. No text.`;
  }

  // 自然 - 顯示自然元素
  if (['tree', 'flower', 'sun', 'moon', 'star', 'cloud', 'rain', 'snow', 'mountain', 'river', 'ocean', 'grass'].includes(word)) {
    return `Create a beautiful, nature-inspired illustration of ${english} (${chinese}). Google banner style: vibrant colors, simple and clear, child-friendly. Show the natural element in an appealing way that helps children learn. Clean white background, no text.`;
  }

  // 默認 - 通用風格
  return `Create a cheerful, educational illustration of ${english} (${chinese}). Google Doodle/banner style: colorful, simple, child-friendly design with clean white background. The illustration should be clear, appealing, and perfect for teaching elementary school children. No text, just a beautiful, educational image.`;
};

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
    <div style={{
      ...styles.cloud,
      top: '10%',
      left: '-5%',
      width: '150px',
      height: '60px',
      animation: 'cloudFloat 8s ease-in-out infinite',
      animationDelay: '0s'
    }}></div>
    <div style={{
      ...styles.cloud,
      top: '20%',
      right: '-5%',
      width: '120px',
      height: '50px',
      animation: 'cloudFloat 10s ease-in-out infinite',
      animationDelay: '2s'
    }}></div>
    <div style={{
      ...styles.cloud,
      bottom: '15%',
      left: '10%',
      width: '100px',
      height: '40px',
      animation: 'cloudFloat 12s ease-in-out infinite',
      animationDelay: '4s'
    }}></div>
  </div>
);

// --- App Components ---

const App = () => {
  // Safe access to process.env for browser environment
  const getEnvKey = () => {
    try {
      // 1. 優先從 Vite 環境變數讀取 (VITE_GEMINI_API_KEY)
      // 2. 其次從 window.process.env 讀取（HTML 中設置的）
      let key = (import.meta as any).env?.VITE_GEMINI_API_KEY || (window as any).process?.env?.API_KEY || "";

      // 如果都沒有，嘗試從 URL 參數讀取
      if (!key) {
        const urlParams = new URLSearchParams(window.location.search);
        key = urlParams.get("key") || "";
      }

      console.log("從環境變數讀取 API Key:", key ? `已讀取 (長度: ${key.length})` : "未找到");
      return key;
    } catch (e) {
      console.warn("無法讀取 process.env:", e);
      return "";
    }
  };

  const envKey = getEnvKey();
  const [apiKey, setApiKey] = useState(envKey);
  const [inputKey, setInputKey] = useState("");

  const [screen, setScreen] = useState<"home" | "loading" | "learn" | "quiz" | "roleplay">("home");
  const [mode, setMode] = useState<"vocab" | "speaking">("vocab");
  const [category, setCategory] = useState("");
  const [vocabList, setVocabList] = useState<VocabWord[]>([]);
  const [quizItems, setQuizItems] = useState<QuizItem[]>([]);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  const ai = useRef<GoogleGenAI | null>(null);

  // 調試：檢查 API Key 狀態
  useEffect(() => {
    console.log("API Key 狀態:", {
      hasKey: !!apiKey,
      keyLength: apiKey?.length || 0,
      hasAI: !!ai.current
    });
  }, [apiKey]);

  useEffect(() => {
    if (apiKey && apiKey.trim()) {
      try {
        const trimmedKey = apiKey.trim();
        ai.current = new GoogleGenAI({
          apiKey: trimmedKey,
          apiVersion: "v1beta" // 針對此環境使用 v1beta 以支援更多模型
        });
        console.log("API Key 已設置，長度:", trimmedKey.length);
        // 清除之前的錯誤
        if (error && error.includes("API Key")) {
          setError("");
        }
      } catch (e) {
        console.error("API Key 設置失敗:", e);
        setError("API Key 格式不正確");
        setApiKey("");
      }
    } else {
      ai.current = null;
    }
  }, [apiKey]);

  const categories = [
    { id: "animals", label: "動物", sub: "Animals", icon: "🐶", color: "#FF9AA2" },
    { id: "fruit", label: "水果", sub: "Fruit", icon: "🍓", color: "#FFB7B2" },
    { id: "transport", label: "交通", sub: "Transport", icon: "🚗", color: "#85E3FF" },
    { id: "school", label: "學校", sub: "School", icon: "🎒", color: "#C7CEEA" },
    { id: "colors", label: "顏色", sub: "Colors", icon: "🎨", color: "#E2F0CB" },
    { id: "yummy", label: "美食", sub: "Yummy", icon: "🍔", color: "#FFDAC1" },
    { id: "body", label: "身體", sub: "Body", icon: "👋", color: "#FFD1DC" },
    { id: "nature", label: "自然", sub: "Nature", icon: "🌳", color: "#B5EAD7" },
  ];

  const speakingScenarios = [
    { id: "restaurant", label: "餐廳點餐", sub: "Restaurant", icon: "🍕", color: "#FF9AA2" },
    { id: "intro", label: "自我介紹", sub: "Introduction", icon: "🤝", color: "#B5EAD7" },
    { id: "hobby", label: "我的愛好", sub: "Hobbies", icon: "🎮", color: "#85E3FF" },
    { id: "weather", label: "聊天氣", sub: "Weather", icon: "☀️", color: "#FFDAC1" },
  ];

  const fetchVocabulary = async (selectedCategory: string) => {
    // 檢查 API Key 是否存在
    if (!apiKey || !apiKey.trim()) {
      setError("API Key 尚未設定。請在登入頁面輸入您的 API Key。");
      setScreen("home");
      return;
    }

    if (!ai.current) {
      setError("API Key 初始化失敗，請重新輸入 API Key。");
      setScreen("home");
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

      // 使用標準的 Gemini 模型
      const response = await ai.current.models.generateContent({
        model: "gemini-flash-latest", // 使用該環境支援的最新 Flash 模型
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

      // 更詳細的錯誤處理
      const errorStr = String(e).toLowerCase();
      const detailStr = detail.toLowerCase();

      if (detailStr.includes("400") || errorStr.includes("400")) {
        friendlyMsg = "API Key 無效 (400) - 請檢查您的 Key 是否正確複製。";
        shouldLogout = true;
      }
      else if (detailStr.includes("403") || errorStr.includes("403") || detailStr.includes("permission") || detailStr.includes("forbidden")) {
        friendlyMsg = "API 權限不足 (403)。請檢查：\n1. API Key 是否正確\n2. 專案是否已啟用 Generative Language API\n3. 是否有有效的計費帳戶\n4. 點擊下方連結查看詳細解決步驟";
        shouldLogout = true;
      }
      else if (detailStr.includes("404") || errorStr.includes("404") || detailStr.includes("not found")) {
        friendlyMsg = "模型未找到 (404) - 可能是模型名稱不正確或 API 版本問題。";
        shouldLogout = false; // 不登出，讓用戶可以重試
      }
      else if (detailStr.includes("429") || errorStr.includes("429") || detailStr.includes("quota") || detailStr.includes("rate limit")) {
        friendlyMsg = "請求太頻繁 (429) - 請休息一下再試。";
      }
      else if (detailStr.includes("503") || detailStr.includes("500") || errorStr.includes("503") || errorStr.includes("500")) {
        friendlyMsg = "AI 伺服器忙碌中，請重試。";
      }
      else if (detailStr.includes("network") || detailStr.includes("fetch") || detailStr.includes("connection")) {
        friendlyMsg = "網路連線問題 - 請檢查您的網路連線。";
      }
      else if (detailStr.includes("api key") || detailStr.includes("authentication") || detailStr.includes("unauthorized")) {
        friendlyMsg = "API Key 驗證失敗 - 請檢查您的 API Key 是否正確。";
        shouldLogout = true;
      }
      else {
        // 顯示更詳細的錯誤信息
        friendlyMsg = `讀取失敗：${detail.substring(0, 100)}${detail.length > 100 ? '...' : ''}`;
      }

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

  const handleStartRoleplay = (scenarioId: string) => {
    setCategory(scenarioId);
    setScreen("roleplay");
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
              歡迎來到快樂英語教室！<br />
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
          <span style={{ fontSize: '24px' }}>🌟</span> Happy English
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
              <Mascot mood="error" size={40} />
              <span style={{ fontWeight: 'bold', fontSize: '16px', whiteSpace: 'pre-line' }}>{error}</span>
            </div>
            {errorDetail && (
              <details style={{ fontSize: '12px', color: '#B71C1C', marginTop: '5px', cursor: 'pointer' }}>
                <summary>查看詳細錯誤 (Error Details)</summary>
                <pre style={{ whiteSpace: 'pre-wrap', marginTop: '5px', backgroundColor: 'rgba(255,255,255,0.5)', padding: '5px', borderRadius: '5px' }}>{errorDetail}</pre>
              </details>
            )}
            {error.includes("403") && (
              <div style={{ marginTop: '15px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '10px' }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#1976D2' }}>🔧 解決步驟：</div>
                <ol style={{ margin: '0', paddingLeft: '20px', fontSize: '13px', lineHeight: '1.8' }}>
                  <li>前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: '#1976D2', textDecoration: 'underline' }}>Google AI Studio</a> 檢查 API Key</li>
                  <li>確認專案已啟用 <a href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1976D2', textDecoration: 'underline' }}>Generative Language API</a></li>
                  <li>檢查是否有有效的計費帳戶</li>
                  <li>嘗試建立新的 API Key</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {screen === "home" && (
          <HomeScreen
            mode={mode}
            setMode={setMode}
            categories={categories}
            speakingScenarios={speakingScenarios}
            onSelectVocab={fetchVocabulary}
            onSelectSpeaking={handleStartRoleplay}
          />
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
        {screen === "roleplay" && (
          <RoleplayMode
            scenario={category}
            ai={ai.current}
            onFinish={handleHome}
          />
        )}
      </main>
    </div>
  );
};

// --- Sub Components ---

const HomeScreen = ({
  mode,
  setMode,
  categories,
  speakingScenarios,
  onSelectVocab,
  onSelectSpeaking
}: {
  mode: "vocab" | "speaking";
  setMode: (m: "vocab" | "speaking") => void;
  categories: any[];
  speakingScenarios: any[];
  onSelectVocab: (id: string) => void;
  onSelectSpeaking: (id: string) => void;
}) => {
  return (
    <div style={styles.homeContainer}>
      <div style={styles.mascotHeader}>
        <Mascot mood="happy" size={100} />
        <div style={styles.bubble}>
          {mode === "vocab" ? "今天想學什麼單字？" : "今天想練習說什麼？"}<br />
          (What shall we learn today?)
        </div>
      </div>

      <div style={{ ...styles.tabContainer, marginBottom: '30px', width: '280px' }}>
        <button
          style={mode === "vocab" ? styles.activeTab : styles.inactiveTab}
          onClick={() => setMode("vocab")}
        >
          📖 單字 (Vocab)
        </button>
        <button
          style={mode === "speaking" ? styles.activeTab : styles.inactiveTab}
          onClick={() => setMode("speaking")}
        >
          🗣️ 對話 (Speaking)
        </button>
      </div>

      <div style={styles.categoryGrid}>
        {mode === "vocab" ? (
          categories.map((cat) => (
            <button
              key={cat.id}
              style={{ ...styles.categoryCard, backgroundColor: cat.color }}
              onClick={() => onSelectVocab(cat.id)}
            >
              <div style={styles.catIcon}>{cat.icon}</div>
              <div style={styles.catLabel}>{cat.label}</div>
              <div style={styles.catSub}>{cat.sub}</div>
            </button>
          ))
        ) : (
          speakingScenarios.map((scene) => (
            <button
              key={scene.id}
              style={{ ...styles.categoryCard, backgroundColor: scene.color }}
              onClick={() => onSelectSpeaking(scene.id)}
            >
              <div style={styles.catIcon}>{scene.icon}</div>
              <div style={styles.catLabel}>{scene.label}</div>
              <div style={styles.catSub}>{scene.sub}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

const LoadingView = () => (
  <div style={styles.centerContent}>
    <Mascot mood="thinking" size={150} />
    <p style={styles.loadingText}>
      正在準備可愛的單字卡...<br />
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
  const [cardKey, setCardKey] = useState(0); // 用於觸發動畫
  const isMounted = useRef(true);

  const current = items[idx];

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Play Audio
  // 使用瀏覽器的 Web Speech API 作為備用方案
  const playAudio = async () => {
    if (isPlaying || !ai) return;
    setIsPlaying(true);

    // 優先使用瀏覽器的語音合成 API（更可靠）
    try {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(current.english);
        utterance.lang = 'en-US';
        utterance.rate = 0.8; // 稍慢一點，適合學習
        utterance.pitch = 1.1; // 稍微高一點，更友好
        utterance.onend = () => {
          if (isMounted.current) setIsPlaying(false);
        };
        utterance.onerror = () => {
          if (isMounted.current) setIsPlaying(false);
        };
        window.speechSynthesis.speak(utterance);
        return;
      }
    } catch (e) {
      console.warn("Web Speech API 不可用，嘗試使用 Gemini TTS");
    }

    // 備用方案：嘗試使用 Gemini API（如果支持）
    try {
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
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
        source.onended = () => { if (isMounted.current) setIsPlaying(false); };
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.error("TTS Error", e);
      if (isMounted.current) setIsPlaying(false);
    }
  };

  // Generate Illustration
  // 注意：標準的 Gemini API 不支持圖片生成
  // 此功能暫時禁用，使用 emoji 代替
  const generateIllustration = async () => {
    // Gemini API 目前不支持圖片生成，直接使用 emoji
    // 如果未來需要圖片功能，可以考慮使用其他圖片生成 API
    if (!ai || current.generatedImage || isGeneratingImg) return;
    setIsGeneratingImg(false); // 不嘗試生成圖片，直接使用 emoji
    return;

    /* 保留代碼供未來使用
    setIsGeneratingImg(true);
    try {
      // 根據單詞類型生成更符合情境的圖片提示
      const contextPrompt = getContextualImagePrompt(current.english, current.chinese);
      
      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: {
          parts: [
            {
              text: contextPrompt
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
      } else {
        console.warn("圖片生成失敗，使用emoji代替");
      }
    } catch (e: any) {
      console.error("Image Gen Error", e);
      // 圖片生成失敗時不影響學習，繼續使用emoji
    } finally {
      if(isMounted.current) setIsGeneratingImg(false);
    }
    */
  };

  // Effects when current card changes
  useEffect(() => {
    // 1. Play audio after a short delay
    const audioTimer = setTimeout(() => {
      if (isMounted.current) playAudio();
    }, 500);

    // 2. Generate image if not exists
    if (!current.generatedImage) {
      generateIllustration();
    }

    return () => clearTimeout(audioTimer);
  }, [current.english]);

  const next = () => {
    if (idx < items.length - 1) {
      setCardKey(prev => prev + 1);
      setIdx(idx + 1);
    }
  };
  const prev = () => {
    if (idx > 0) {
      setCardKey(prev => prev + 1);
      setIdx(idx - 1);
    }
  };

  return (
    <div style={styles.modeContainer}>
      <div style={styles.tabContainer}>
        <button style={styles.activeTab}>📖 學習 (Learn)</button>
        <button style={styles.inactiveTab} onClick={onSwitchToQuiz}>🎮 測驗 (Quiz)</button>
      </div>

      <div style={styles.flashCardOuter}>
        <div
          key={cardKey}
          style={{
            ...styles.flashCardInner,
            animation: 'fadeInScale 0.4s ease-out'
          }}
        >
          {/* Image Area */}
          <div style={styles.imageContainer}>
            {current.generatedImage ? (
              <img
                src={current.generatedImage}
                alt={current.english}
                style={{
                  ...styles.generatedImg,
                  animation: 'fadeIn 0.5s ease-in'
                }}
                onError={(e) => {
                  // 如果圖片載入失敗，使用emoji
                  console.warn("圖片載入失敗");
                }}
              />
            ) : (
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  ...styles.emojiLarge,
                  animation: 'bounceIn 0.6s ease-out'
                }}>{current.emoji}</div>
                {isGeneratingImg && (
                  <span style={styles.loadingImgText}>
                    ✨ 繪製中...
                    <span style={{
                      display: 'inline-block',
                      animation: 'pulse 1s infinite'
                    }}>✨</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{
            ...styles.wordEnglish,
            animation: 'slideUp 0.5s ease-out'
          }}>{current.english}</div>
          <div style={{
            ...styles.wordChinese,
            animation: 'slideUp 0.6s ease-out'
          }}>{current.chinese}</div>

          <button
            style={{
              ...styles.audioFab,
              transform: isPlaying ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 0.2s ease'
            }}
            onClick={playAudio}
            disabled={isPlaying}
            title="點擊聽發音"
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
    }, 2000);
  };

  if (finished) {
    const isPerfect = score === items.length;
    const percentage = Math.round((score / items.length) * 100);
    return (
      <div style={styles.centerContent}>
        <div style={{ animation: 'bounceIn 0.8s ease-out' }}>
          <Mascot mood={isPerfect ? "excited" : percentage >= 80 ? "happy" : "sad"} size={150} />
        </div>
        <h2 style={{
          ...styles.finishTitle,
          animation: 'slideUp 0.6s ease-out'
        }}>
          {isPerfect ? "太棒了！滿分！🎉" : percentage >= 80 ? "做得很好！👍" : "繼續加油！💪"}
        </h2>
        <div style={{
          ...styles.scoreBoard,
          animation: 'fadeInScale 0.8s ease-out'
        }}>
          <span style={{ fontSize: '50px', animation: 'pulse 2s infinite' }}>🏆</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
            <span style={styles.scoreNum}>{score} / {items.length}</span>
            <span style={{ fontSize: '18px', color: '#888' }}>{percentage}%</span>
          </div>
        </div>
        <button
          style={{
            ...styles.startButton,
            animation: 'fadeIn 1s ease-out',
            marginTop: '20px'
          }}
          onClick={onFinish}
        >
          再來一次 🎮
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
        <div style={{
          animation: isCorrect === true ? 'bounceIn 0.6s ease-out' : isCorrect === false ? 'shake 0.5s ease-out' : 'none'
        }}>
          <Mascot mood={isCorrect === true ? "excited" : isCorrect === false ? "sad" : "happy"} size={80} />
        </div>
        <div style={{
          ...styles.quizBubble,
          animation: isCorrect !== null ? 'slideUp 0.4s ease-out' : 'none'
        }}>
          {isCorrect === true ? "答對了！好棒！✨" : isCorrect === false ? `哎呀，答案是 ${current.english} 💪` : "這個英文是什麼？🤔"}
        </div>
      </div>

      <div style={styles.quizMain}>
        <div style={styles.quizImageContainer}>
          {current.generatedImage ? (
            <img
              src={current.generatedImage}
              alt={current.english}
              style={{
                width: '120px',
                height: '120px',
                objectFit: 'contain',
                animation: 'bounceIn 0.6s ease-out',
                borderRadius: '15px'
              }}
            />
          ) : (
            <div style={{
              ...styles.quizEmoji,
              animation: 'bounceIn 0.6s ease-out'
            }}>{current.emoji}</div>
          )}
        </div>

        <div style={styles.optionsList}>
          {current.options.map((opt) => {
            let bg = "#FFFFFF";
            let border = "2px solid #EEE";
            let scale = 1;
            let animation = '';

            if (selected) {
              if (opt === current.english) {
                bg = "#B5EAD7";
                border = "3px solid #84DCC6";
                scale = 1.05;
                animation = 'correctPulse 0.5s ease-out';
              } else if (opt === selected) {
                bg = "#FFB7B2";
                border = "3px solid #FF9AA2";
                animation = 'shake 0.5s ease-out';
              }
            }

            return (
              <button
                key={opt}
                style={{
                  ...styles.optionBtn,
                  backgroundColor: bg,
                  border: border,
                  transform: `scale(${scale})`,
                  animation: animation,
                  transition: 'all 0.3s ease'
                }}
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

const RoleplayMode = ({
  scenario,
  ai,
  onFinish,
}: {
  scenario: string;
  ai: any;
  onFinish: () => void;
}) => {
  const [messages, setMessages] = useState<{ role: "user" | "model", text: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ai && !chatRef.current) {
      chatRef.current = ai.models.startChat({
        model: "gemini-flash-latest",
        history: [],
        config: {
          systemInstruction: ROLEPLAY_SYSTEM_INSTRUCTION,
        },
      });

      // Start the conversation
      setLoading(true);
      chatRef.current.sendMessage(`Let's start our roleplay in the scenario: ${scenario}. You start the conversation.`)
        .then((result: any) => {
          setMessages([{ role: "model", text: result.response.text() }]);
          setLoading(false);
        });
    }
  }, [ai, scenario]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading || !chatRef.current) return;

    const userText = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userText }]);
    setLoading(true);

    try {
      const result = await chatRef.current.sendMessage(userText);
      setMessages(prev => [...prev, { role: "model", text: result.response.text() }]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: "model", text: "I'm sorry, I'm a bit tired. Can you say that again?" }]);
    } finally {
      setLoading(false);
    }
  };

  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      // Basic cleaning for TTS (remove parenthetical Chinese)
      const cleanText = text.replace(/\([^)]*\)/g, "");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div style={styles.modeContainer}>
      <div style={styles.roleplayHeader}>
        <Mascot mood={loading ? "thinking" : "happy"} size={60} />
        <div style={styles.roleplayTitle}>
          <h3>{scenario === "restaurant" ? "Pizza Party! 🍕" :
            scenario === "intro" ? "Funny Greeting! 🤝" :
              scenario === "hobby" ? "Playtime! 🎮" : "Sunny Day! ☀️"}</h3>
          <p>跟我說英文吧！ (Talk to me in English!)</p>
        </div>
      </div>

      <div style={styles.chatWindow} ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} style={msg.role === "user" ? styles.userBubbleContainer : styles.modelBubbleContainer}>
            <div style={msg.role === "user" ? styles.userBubble : styles.modelBubble}>
              {msg.text}
              {msg.role === "model" && (
                <button
                  style={styles.msgAudioBtn}
                  onClick={() => playAudio(msg.text)}
                  title="播放聲音"
                >
                  🔊
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={styles.modelBubbleContainer}>
            <div style={{ ...styles.modelBubble, fontStyle: 'italic', opacity: 0.7 }}>
              Typing... 💭
            </div>
          </div>
        )}
      </div>

      <div style={styles.chatInputContainer}>
        <input
          style={styles.chatInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button
          style={{ ...styles.sendBtn, opacity: loading || !input.trim() ? 0.6 : 1 }}
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          ➔
        </button>
      </div>

      <button style={{ ...styles.navHomeBtn, marginTop: '20px' }} onClick={onFinish}>
        結束練習 (Finish)
      </button>
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
    height: '140px',
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
  // Roleplay
  roleplayHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    marginBottom: '20px',
    width: '100%',
  },
  roleplayTitle: {
    flex: 1,
  },
  chatWindow: {
    width: '100%',
    height: '400px',
    backgroundColor: '#FFF',
    borderRadius: '30px',
    padding: '20px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    boxShadow: '0 5px 20px rgba(0,0,0,0.05)',
    marginBottom: '20px',
  },
  userBubbleContainer: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  modelBubbleContainer: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: THEMES.primary,
    color: '#FFF',
    padding: '12px 18px',
    borderRadius: '20px 20px 0 20px',
    fontSize: '16px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
  },
  modelBubble: {
    backgroundColor: THEMES.secondary,
    color: THEMES.text,
    padding: '12px 18px',
    borderRadius: '20px 20px 20px 0',
    fontSize: '16px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  msgAudioBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px',
  },
  chatInputContainer: {
    width: '100%',
    display: 'flex',
    gap: '10px',
  },
  chatInput: {
    flex: 1,
    padding: '15px 20px',
    borderRadius: '25px',
    border: '2px solid #EEE',
    fontSize: '16px',
    outline: 'none',
    boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
  },
  sendBtn: {
    width: '50px',
    height: '50px',
    borderRadius: '25px',
    backgroundColor: THEMES.primary,
    color: '#FFF',
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 0 #E57373',
  },
};

// 確保 DOM 載入完成後再渲染
function initApp() {
  console.log("開始初始化應用程式...");
  console.log("document.readyState:", document.readyState);

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("找不到 root 元素！");
    // 如果找不到，等待一下再試
    setTimeout(initApp, 100);
    return;
  }

  console.log("找到 root 元素，開始渲染...");

  try {
    console.log("createRoot 可用:", typeof createRoot);
    console.log("App 組件可用:", typeof App);

    const root = createRoot(rootElement);
    console.log("createRoot 成功，開始渲染 App...");

    root.render(<App />);
    console.log("✅ 應用程式已成功渲染！");
  } catch (error: any) {
    console.error("❌ 渲染應用程式時發生錯誤:", error);
    console.error("錯誤堆疊:", error?.stack);

    // 顯示錯誤訊息
    rootElement.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #D32F2F; font-family: system-ui, sans-serif; max-width: 600px; margin: 50px auto;">
        <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
        <h2 style="margin: 10px 0;">載入錯誤</h2>
        <p style="margin: 10px 0; color: #666;">應用程式載入失敗，請檢查瀏覽器控制台查看詳細錯誤。</p>
        <details style="text-align: left; background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px; cursor: pointer;">
          <summary style="font-weight: bold; margin-bottom: 10px;">錯誤詳情</summary>
          <pre style="white-space: pre-wrap; word-break: break-all; font-size: 12px;">${error?.message || String(error)}</pre>
          ${error?.stack ? `<pre style="white-space: pre-wrap; word-break: break-all; font-size: 11px; color: #666; margin-top: 10px;">${error.stack}</pre>` : ''}
        </details>
        <p style="margin-top: 20px; font-size: 14px; color: #999;">
          請按 F12 打開開發者工具，查看 Console 標籤中的詳細錯誤訊息
        </p>
      </div>
    `;
  }
}

// 確保 DOM 完全載入後再初始化
console.log("腳本開始執行，document.readyState:", document.readyState);

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    console.log("等待 DOM 載入...");
    document.addEventListener('DOMContentLoaded', () => {
      console.log("DOM 載入完成，開始初始化");
      initApp();
    });
  } else {
    // DOM 已經載入完成
    console.log("DOM 已就緒，立即初始化");
    // 使用 setTimeout 確保所有腳本都已載入
    setTimeout(initApp, 0);
  }
} else {
  console.error("document 未定義！");
}