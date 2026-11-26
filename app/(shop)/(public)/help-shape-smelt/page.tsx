import type { Metadata } from "next";
import Questionnaire from "./Questionnaire";

export const metadata: Metadata = {
  title: "Help shape what’s next | Smelt",
  description:
    "Help shape the next addition to the Smelt sauna kit. Tell us what you’d actually use.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/help-shape-smelt" },
};
export default function ResearchPage() {
  return <Questionnaire />;
}
