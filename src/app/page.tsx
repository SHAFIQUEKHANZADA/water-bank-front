import Dashboard from "@/components/Dashboard";
import { getWaterData } from "@/lib/data";

// Reads live DB values per request — real numbers in the server-rendered HTML.
export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getWaterData();
  return <Dashboard data={data} />;
}
