import HomeClient from "@/components/HomeClient";
import { Toaster } from "@/components/toast";

// Fully client-rendered; no server data needed at request time → works in static export too.
export default function HomePage() {
  return (
    <>
      <HomeClient />
      <Toaster />
    </>
  );
}
