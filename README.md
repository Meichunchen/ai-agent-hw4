# 作業 4：整合 YouBike 與時間工具

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

## 工具註冊

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
---

## 實測對話紀錄

執行截圖：

![台北小助手實測截圖](./HW4.PNG)

### 對話 1：

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

---

### 對話 2：

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

---

### 對話 3：

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
