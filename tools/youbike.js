import { z } from "zod";
import { defineTool } from "../utils/func-tool.js";

const YOUBIKE_API =
  "https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json";

async function getYoubikeByArea({ area, limit = 5 }) {
  const res = await fetch(YOUBIKE_API);
  if (!res.ok) {
    return { error: `YouBike API 錯誤: ${res.status}` };
  }
  const data = await res.json();

  const stations = data
    .filter((s) => s.act === "1" && s.sarea === area)
    .map((s) => ({
      name: s.sna.replace(/^YouBike2\.0_/, ""),
      area: s.sarea,
      address: s.ar,
      available_rent: s.available_rent_bikes,
      available_return: s.available_return_bikes,
      total: s.Quantity,
    }))
    .sort((a, b) => b.available_rent - a.available_rent)
    .slice(0, limit);

  if (stations.length === 0) {
    return {
      area,
      total_stations: 0,
      message: `在「${area}」找不到任何 YouBike 站點。請確認是台北市的行政區名稱（例如：大安區、信義區、中山區、士林區、中正區等）。`,
    };
  }

  return {
    area,
    total_stations: stations.length,
    stations,
  };
}

export const youbikeTool = defineTool({
  name: "get_youbike_by_area",
  description:
    "查詢指定台北市行政區內的 YouBike 2.0 站點，回傳目前可借車數最多的前幾個站點。注意：只能傳台北市的「行政區」名稱（例如「大安區」「信義區」「中山區」），不能傳「台北市」或非行政區名稱。",
  fn: getYoubikeByArea,
  parameters: z.object({
    area: z
      .string()
      .describe(
        "台北市行政區名稱，例如「大安區」、「信義區」、「中山區」、「士林區」、「中正區」、「松山區」、「萬華區」、「大同區」、「文山區」、「南港區」、「內湖區」、「北投區」",
      ),
    limit: z.number().default(5).describe("回傳站點數上限，預設 5"),
  }),
});
