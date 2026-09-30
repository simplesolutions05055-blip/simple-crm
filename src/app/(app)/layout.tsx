import AppProvider from "@/components/AppCtx";
import { Shell } from "@/components/Shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
