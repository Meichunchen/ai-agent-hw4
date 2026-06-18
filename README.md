# 作業 4：整合 YouBike 與時間工具

> AI Agent 實作工作坊（JavaScript 版）— 作業 4
> 一個「台北小助手」AI，能回答「現在時間」和「哪裡有 YouBike 可以借」

## 功能說明

兩個 Function Calling 工具整合在一個對話迴圈裡：

| 工具 | 功能 | 資料來源 |
|---|---|---|
| `get_current_time` | 回傳台灣時間 | Node.js `Date.toLocaleString` |
| `get_youbike_by_area` | 查詢台北市指定行政區內 YouBike 2.0 站點即時可借車數 | [台北市開放資料](https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json)（**不需要 API key**） |

> ⚠️ YouBike 工具是「**行政區查詢版**」，需要傳「大安區」「信義區」這種行政區名稱，**不能傳「台北市」**。

## 環境需求

- Node.js >= 22
- OpenAI API key

## 安裝與執行

```powershell
# 1. 安裝套件
npm install

# 2. 設定 .env
Copy-Item .env.example .env
notepad .env  # 填入 OPENAI_API_KEY

# 3. 啟動互動式助手
npm start
```

## 檔案結構

```
ai-agent-hw4/
├── tools/
│   ├── current_time.js       # ⭐ 時間工具
│   ├── youbike.js            # ⭐ YouBike 工具(行政區查詢版)
│   └── index.js              # ⭐ barrel export(集中匯出所有工具)
├── utils/
│   ├── func-tool.js          # defineTool + toOpenAITool (zodFunction wrapper)
│   └── spinner.js            # CLI 載入動畫
├── lib/openai.js             # OpenAI client
├── db/messages.js            # 對話歷史(lowdb)
├── main.js                   # ⭐ 主程式:對話迴圈 + tool calling + 記憶
├── config.js
├── package.json / .env.example / .gitignore
└── .history/                 # 每次跑 main.js 會留對話紀錄
```

## 工具註冊（仿老師 2.5 寫法）

`main.js` 開頭用 `import *` 一次拿到所有工具，**新增工具完全不用改 main.js**，只要在 `tools/index.js` 加一行 export：

```js
import * as allTools from "./tools/index.js";

const toolList = Object.values(allTools);
const tools = toolList.map(toOpenAITool);                          // 給 OpenAI 的 schema 陣列
const AVAILABLE_TOOLS = Object.fromEntries(
  toolList.map((t) => [t.name, t.fn]),                             // dispatcher 對應表
);
```

`tools/index.js`：
```js
export { currentTimeTool } from "./current_time.js";
export { youbikeTool } from "./youbike.js";
```

## 工具定義（zod schema）

```js
// 時間工具(無參數)
export const currentTimeTool = defineTool({
  name: "get_current_time",
  description: "取得現在的台灣時間",
  fn: getCurrentTime,
  parameters: z.object({}),
});

// YouBike 工具(行政區查詢)
export const youbikeTool = defineTool({
  name: "get_youbike_by_area",
  description: "查詢指定台北市行政區內的 YouBike 2.0 站點，回傳目前可借車數最多的前幾個站點。注意:只能傳台北市的「行政區」名稱(例如「大安區」「信義區」「中山區」),不能傳「台北市」或非行政區名稱。",
  fn: getYoubikeByArea,
  parameters: z.object({
    area: z.string().describe("台北市行政區名稱,例如「大安區」、「信義區」、「中山區」、「士林區」..."),
    limit: z.number().default(5).describe("回傳站點數上限,預設 5"),
  }),
});
```

## System Prompt 設計

```
你是一位住在台北的小助理,能幫使用者查詢:
1. 現在時間(透過 get_current_time 工具)
2. 台北市各行政區的 YouBike 2.0 站點目前可借車數(透過 get_youbike_by_area 工具)

當使用者詢問時間或台北市 YouBike 相關問題時,請主動呼叫對應的工具,不要自己猜測。
YouBike 查詢只能傳台北市行政區名稱(例如「大安區」「信義區」「中山區」),不能直接傳「台北市」這種非行政區名稱...
請全程用繁體中文回答,把工具回傳的資料整理成自然口語句子。如果使用者一句話問了多件事,請把所有需要的工具都呼叫完再整合回答。
```

關鍵設計：
- 列出兩個工具的明確分工
- **強調 YouBike 查詢的「行政區」限制**（避免 AI 傳「台北市」這種無效值）
- **要求 AI 一句話多問題時呼叫多個工具並整合回答**（驗收標準 3 的關鍵）

---

## 驗收標準對照

| 項目 | 達成狀況 |
|---|---|
| 兩個工具都能被正確呼叫 | ✅ 對話 1 呼叫 `get_youbike_by_area`、對話 2 呼叫 `get_current_time` |
| AI 能根據問題選擇正確的工具 | ✅ 問時間只呼叫時間工具、問 YouBike 只呼叫 YouBike 工具，沒有多餘呼叫 |
| 一次問兩個問題時，AI 能呼叫兩個工具並整合回答 | ✅ 對話 3「現在幾點?大安區有 youbike 可以借嗎?」AI 在**同一個 turn 裡 parallel call 兩個工具**，並整合成單一回答 |
| README 記錄 3 個測試問題的執行結果 | ✅ 見下方完整紀錄 |

---

## 實測對話紀錄

執行截圖：

![台北小助手實測截圖](./HW4.PNG)

### 對話 1：YouBike 查詢

**你問：** 現在大安區有 Youbike 可以借嗎

**🔧 工具呼叫：**
```
get_youbike_by_area({"area":"大安區","limit":5})
```

**✅ 工具回傳：**
```json
{
  "area": "大安區",
  "total_stations": 5,
  "stations": [
    { "name": "捷運公館站(3號出口)", "available_rent": 68, "total": 99, "address": "捷運公館站(3號出口)西側" },
    { "name": "捷運大安森林公園站(2號出口)", "available_rent": 59, "address": "捷運大安森林公園站(2號出口)西側" },
    { "name": "龍門廣場", "available_rent": 43, "address": "敦化南路一段與敦化南路一段236巷口" },
    { "name": "和平金山路口", "available_rent": 40, "address": "和平東路一段/金山南路二段西南側" },
    { "name": "捷運忠孝新生站(3號出口)", "available_rent": 40, "address": "忠孝東路三段與10巷口" }
  ]
}
```

**🤖 AI 回答：**
> 有的，現在大安區有 YouBike 可以借。以下是可借車數最多的前 5 個站點（即時查詢）：
>
> 1. 捷運公館站(3號出口) — 可借 68 台
> 2. 捷運大安森林公園站(2號出口) — 可借 59 台
> 3. 龍門廣場 — 可借 43 台
> 4. 和平金山路口 — 可借 40 台
> 5. 捷運忠孝新生站(3號出口) — 可借 40 台
>
> 以上前 5 站合計可借 250 台。需要我幫你查特定站點、更多站或其他行政區嗎？

🔍 **觀察**：AI 正確從「大安區」自然語言抓出 `area` 參數，並把 JSON 回傳整理成 markdown 列表 + 結尾主動追問下一步，符合 system prompt 設定的「整理成自然口語句子」要求。

---

### 對話 2：時間查詢

**你問：** 現在幾點

**🔧 工具呼叫：**
```
get_current_time({})
```

**✅ 工具回傳：**
```
"2026/6/18 下午 8:53:55"
```

**🤖 AI 回答：**
> 現在時間是 2026/6/18 下午 8:53:55。還需要我幫你做什麼嗎？

🔍 **觀察**：時間工具參數是空 object `{}`，AI 正確識別不需要任何參數就直接呼叫。

---

### 對話 3（關鍵）：一次問兩件事 → AI Parallel Tool Calling

**你問：** 現在幾點?大安區有 youbike 可以借嗎?

**🔧 工具呼叫（注意：同一個 turn 裡同時呼叫兩個！）：**
```
get_current_time({})
get_youbike_by_area({"area":"大安區","limit":5})
```

**✅ 工具回傳：**
```
時間: "2026/6/18 下午 8:54:55"
YouBike: { area: "大安區", total_stations: 5, stations: [...] }
```

**🤖 AI 回答：**
> 現在是 2026/6/18 下午 8:54:55。
> 大安區有 YouBike 可借。前 5 名站點（可借車數最多）如下：
>
> 1. 捷運公館站(3號出口) — 可借 68 台
> 2. 捷運大安森林公園站(2號出口) — 可借 59 台
> 3. 龍門廣場 — 可借 43 台
> 4. 和平金山路口 — 可借 40 台
> 5. 捷運忠孝新生站(3號出口) — 可借 40 台
>
> 需要我幫你查離你最近的站點或其他行政區嗎？

🔍 **觀察（最有教學價值）**：這是 **OpenAI Parallel Tool Calling** 功能 — AI 在解析自然語言時就識別出「現在幾點」跟「大安區有 youbike」是兩個獨立的需求，**在同一個 API response 裡回傳兩個 `tool_calls`**，由我們的 dispatcher 並行執行（程式中的 `for (const toolCall of message.tool_calls)` 迴圈）。

兩個工具的回傳結果都進入下一輪的 messages，AI 在第二次 API 呼叫時看到所有資料，把時間跟 YouBike 整合成一段流暢的繁體中文回答。

---

## 心得

這次作業最有感的觀察：**Parallel Tool Calling 把「多任務」這件事整個變簡單**。

具體說，對話 3 在傳統做法（沒有 tool calling）會是：
1. 程式自己 parse「現在幾點 + 大安區 YouBike」這句話，拆出兩個意圖
2. 各自呼叫時間 API、YouBike API
3. 等兩個都回來
4. 拼接結果

但在 OpenAI parallel tool calling 下，我們只需要：
1. 註冊兩個工具
2. AI 自己決定一次呼叫哪些
3. 我們的 dispatcher 只負責「拿到 tool_calls 陣列就執行每一個」

**程式邏輯完全沒有「多任務處理」的概念**，但效果上就達成了多任務 — 這就是 Function Calling 抽象出來的威力。

另外觀察到三件事：

1. **AI 會主動「整理表格」**：YouBike 回傳的是 JSON array，但 AI 把它整理成 markdown 編號列表 + 在最後總結「合計 250 台」。這是 system prompt 寫「整理成自然口語句子」帶來的效果。

2. **AI 會主動追問下一步**：每次回答結尾都有「需要我幫你查...嗎？」這種延伸提問，提升對話延續性。這也是 system prompt 沒有特別寫但 LLM 的訓練偏好。

3. **架構面：`import * as allTools` 比手動 import 更優雅**：之前 hw2 我手動寫 `import { convertUnitTool, convertUnit }`，每加一個工具要改 main.js。老師 2.5 用 `import * as` 之後，**main.js 永遠不用改，加新工具只要在 `tools/index.js` 加一行 export**。這跟作業 2 的「單一修改點」精神一致，但更輕量。
