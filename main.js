// 互動式主程式：整合 YouBike + 時間工具 + 對話記憶
// 執行: npm start

import { input } from "@inquirer/prompts";
import { client, DEFAULT_MODEL } from "./lib/openai.js";
import { initMessage, addMessage, getMessages } from "./db/messages.js";
import { spinner } from "./utils/spinner.js";
import { toOpenAITool } from "./utils/func-tool.js";
import * as allTools from "./tools/index.js";

// ===== 工具註冊中心(仿老師 2.5 寫法) =====
const toolList = Object.values(allTools);
const tools = toolList.map(toOpenAITool);
const AVAILABLE_TOOLS = Object.fromEntries(
  toolList.map((t) => [t.name, t.fn]),
);
// =========================================

const SYSTEM_PROMPT = `你是一位住在台北的小助理，能幫使用者查詢：
1. 現在時間（透過 get_current_time 工具）
2. 台北市各行政區的 YouBike 2.0 站點目前可借車數（透過 get_youbike_by_area 工具）

當使用者詢問時間或台北市 YouBike 相關問題時，請主動呼叫對應的工具，不要自己猜測。
YouBike 查詢只能傳台北市行政區名稱（例如「大安區」「信義區」「中山區」），不能直接傳「台北市」這種非行政區名稱。如果使用者只說「台北市」沒指定區，請主動問他要查哪一區。
請全程用繁體中文回答，把工具回傳的資料整理成自然口語句子。如果使用者一句話問了多件事（例如同時問時間跟 YouBike），請把所有需要的工具都呼叫完再整合回答。`;

await initMessage(SYSTEM_PROMPT);

console.log("🚲 台北小助手已上線！試試問我：");
console.log("   • 現在幾點？");
console.log("   • 信義區有 YouBike 可以借嗎？");
console.log("   • 現在幾點？大安區還有 YouBike 可以借嗎？");
console.log("   （輸入 exit 結束）\n");

try {
  while (true) {
    const userQuestion = (await input({ message: "你：" })).trim();

    if (userQuestion === "") continue;
    if (userQuestion.toLowerCase() === "exit") {
      console.log("再會~");
      break;
    }

    await addMessage(userQuestion);

    // 內層迴圈：處理 AI 可能多輪 tool call
    while (true) {
      const spin = spinner("思考中...").start();
      const response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: getMessages(),
        tools,
        tool_choice: "auto",
      });
      spin.stop();

      const message = response.choices[0].message;
      await addMessage(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        console.log(`\n🤖 ${message.content}\n`);
        break;
      }

      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`\n🔧 [呼叫 ${fnName}] ${JSON.stringify(args)}`);

        const fn = AVAILABLE_TOOLS[fnName];
        const result = fn
          ? await fn(args)
          : { error: `Unknown tool: ${fnName}` };

        const resultStr = JSON.stringify(result);
        const preview =
          resultStr.length > 250
            ? resultStr.slice(0, 250) + "..."
            : resultStr;
        console.log(`✅ [結果] ${preview}\n`);

        await addMessage({
          role: "tool",
          tool_call_id: toolCall.id,
          content: resultStr,
        });
      }
    }
  }
} catch (err) {
  if (err.name === "ExitPromptError") {
    console.log("\n再會~");
  } else {
    throw err;
  }
}
