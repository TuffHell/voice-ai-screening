import Navigation from "@/components/Navigation";
import Hero       from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Analyse    from "@/components/Analyse";
import About      from "@/components/About";

export default function Page() {
  return (
    <main className="relative z-10">
      <Navigation />
      <Hero />
      <HowItWorks />
      <Analyse />
      <About />
    </main>
  );
}
