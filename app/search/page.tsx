import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import type { UIMessage } from "ai";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getChatResourceId } from "@/lib/chat-resource";
import { mastra } from "@/mastra";
import { SearchResults } from "./search-results";
import { ProcuraTopBar } from "@/app/components/procura-topbar";
import { WorkspaceHeader } from "@/app/components/workspace-header";

interface Props {
  searchParams: Promise<{ q?: string; id?: string; mode?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, id, mode } = await searchParams;
  const query = q?.trim() ?? "";
  const searchMode = mode === "procurement" ? "procurement" : "chat";

  if (!query) {
    return (
      <main className="min-h-svh" style={{ background: "var(--p-bg)" }}>
        <div className="px-6 py-12" />
      </main>
    );
  }

  if (!id) {
    const newId = crypto.randomUUID();
    const modeParam = searchMode === "procurement" ? "&mode=procurement" : "";
    redirect(`/search?id=${newId}&q=${encodeURIComponent(query)}${modeParam}`);
  }

  let initialMessages: UIMessage[] = [];

  if (searchMode !== "procurement") {
    const session = await auth.api.getSession({ headers: await headers() });
    const resourceId = getChatResourceId(session?.user?.id);
    const memory = await mastra.getAgentById("procurement-agent").getMemory();
    if (memory) {
      try {
        const recalled = await memory.recall({ threadId: id, resourceId, perPage: false });
        initialMessages = toAISdkV5Messages(recalled.messages) as unknown as UIMessage[];
      } catch {
        initialMessages = [];
      }
    }
  }

  const rfqId = `RFQ-${id!.slice(0, 8).toUpperCase()}`;

  return (
    <div data-page-root className="flex flex-col min-h-svh" style={{ background: "var(--p-bg)" }}>
      <ProcuraTopBar rfqId={rfqId} />

      <main className="flex-1">
        {/* RFQ header — editable title, centered */}
        <WorkspaceHeader rfqId={rfqId} query={query} mode={searchMode} />

        {/* Results — wider for procurement (workflow + audit trail sidebar) */}
        <div className={`mx-auto px-8 py-10 ${searchMode === "procurement" ? "max-w-5xl" : "max-w-4xl"}`}>
          <SearchResults
            chatId={id!}
            query={query}
            mode={searchMode}
            initialMessages={initialMessages}
          />
        </div>
      </main>
    </div>
  );
}
