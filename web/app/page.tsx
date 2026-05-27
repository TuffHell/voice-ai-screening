import Navigation     from "@/components/Navigation";
import Hero           from "@/components/Hero";
import HowItWorks     from "@/components/HowItWorks";
import Analyse        from "@/components/Analyse";
import Demonstrations from "@/components/Demonstrations";
import History        from "@/components/History";
import ModelTraining  from "@/components/ModelTraining";
import About          from "@/components/About";

export default function Page() {
  return (
    <main className="relative z-10">
      <Navigation />
      <Hero />
      <HowItWorks />
      <Analyse />
      <Demonstrations />
      <History />
      <ModelTraining />
      <About />
    </main>
  );
}
