import type { Metadata } from "next";
import VideoToTextClient from "@/components/VideoToTextClient";

export const metadata: Metadata = {
  title: "Video to Text · DetheAi",
  description:
    "Turn any video into accurate text — Hindi, English, Odia and 8 more Indian languages, with timestamps and subtitle downloads.",
};

export default function VideoToTextPage() {
  return <VideoToTextClient />;
}
